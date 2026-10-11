import { describe, expect, test } from "vitest"
import { createBattle, type ContentContext, type EffectChange, type MissionModule, type UnitSpec } from "arknights-mission-core"
import { LEVITATE, STUN } from "#port/tag.js"
import { ally, spec } from "#test/fixture.js"

interface Probe {
  /** 每拍末尾 e 身上有没有这个标签。 */
  readonly held: boolean[]
  /** effect 阶段修饰看到的每次施加。 */
  readonly seen: EffectChange[]
  dmgTaken: number
}

/** 第 0 拍执行 apply；revise 注册成 priority 0 的 effect 阶段修饰。 */
function run(
  apply: (ctx: ContentContext) => void,
  revise: ((change: EffectChange) => void) | null,
  ticks: number,
  tag = STUN,
  patch: Partial<UnitSpec> = {},
): Probe {
  const probe: Probe = { held: [], seen: [], dmgTaken: Number.NaN }
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      if (revise) {
        ctx.registerDamageModifier({
          id: "case-effect",
          stage: "effect",
          priority: 0,
          modify(change) {
            probe.seen.push({ ...change })
            revise(change)
          },
        })
      }
      ctx.registerSystem({
        id: "apply",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          if (runCtx.tick() === 0) apply(runCtx)
        },
      })
      ctx.registerSystem({
        id: "read",
        slot: "finale",
        priority: 0,
        run(runCtx) {
          probe.held.push(runCtx.hasTag("e", tag))
          probe.dmgTaken = runCtx.attribute("e", "dmgTaken")
        },
      })
    },
  }
  const battle = createBattle(
    spec({ modules: ["case"], units: [ally("e", { side: "enemy", attributes: { hp: 1000 }, ...patch })] }),
    [module],
  )
  for (let step = 0; step < ticks; step += 1) battle.step()
  return probe
}

const count = (held: readonly boolean[]): number => held.filter(Boolean).length

describe("效果施加的 effect 阶段", () => {
  test("修饰可以改这次的拍数：1 秒晕眩翻倍成 2 秒；看到的是施加者、效果与换成拍数的时长", () => {
    const plain = run((ctx) => ctx.applyEffect("e", "stun", { duration: 1 }), null, 90)
    const doubled = run(
      (ctx) => ctx.applyEffect("e", "stun", { duration: 1, sourceId: "s" }),
      (change) => {
        change.ticks *= 2
      },
      90,
    )
    expect(count(doubled.held)).toBe(count(plain.held) + 30)
    expect(doubled.seen).toEqual([{ unitId: "e", effectId: "stun", sourceId: "s", ticks: 30, permanent: false, value: 0, cancel: false }])
  })

  test("取消、拍数改成 0 时这次施加不成立；改成 Infinity 时一直持续", () => {
    const cancelled = run((ctx) => ctx.applyEffect("e", "stun", { duration: 1 }), (change) => {
      change.cancel = true
    }, 10)
    const zero = run((ctx) => ctx.applyEffect("e", "stun", { duration: 1 }), (change) => {
      change.ticks = 0
    }, 10)
    const forever = run((ctx) => ctx.applyEffect("e", "stun", { duration: 1 }), (change) => {
      change.ticks = Number.POSITIVE_INFINITY
    }, 120)
    expect(count(cancelled.held)).toBe(0)
    expect(count(zero.held)).toBe(0)
    expect(count(forever.held)).toBe(120)
  })

  test("修饰可以改这次的强度，非有限值不生效", () => {
    const raised = run((ctx) => ctx.applyEffect("e", "fragile", { duration: 1, value: 0.1 }), (change) => {
      change.value = 0.5
    }, 2)
    const broken = run((ctx) => ctx.applyEffect("e", "fragile", { duration: 1, value: 0.1 }), (change) => {
      change.value = Number.NaN
    }, 2)
    expect(raised.dmgTaken).toBeCloseTo(1.5, 12)
    expect(broken.dmgTaken).toBeCloseTo(1.1, 12)
  })

  test("内置的抵抗与重量减半在内容修饰之后：内容看到的是缩短之前的拍数，缩短照常发生", () => {
    const plain = run((ctx) => ctx.applyEffect("e", "stun", { duration: 1 }), null, 90)
    const light = run((ctx) => ctx.applyEffect("e", "levitate", { duration: 1 }), null, 90, LEVITATE)
    const resisted = run(
      (ctx) => {
        ctx.applyEffect("e", "resist")
        ctx.applyEffect("e", "stun", { duration: 1 })
      },
      (change) => {
        if (change.effectId === "stun") change.ticks *= 2
      },
      90,
    )
    expect(resisted.seen.find((change) => change.effectId === "stun")?.ticks).toBe(30)
    expect(count(resisted.held)).toBe(count(plain.held))
    const heavy = run(
      (ctx) => ctx.applyEffect("e", "levitate", { duration: 1 }),
      (change) => {
        change.ticks *= 2
      },
      90,
      LEVITATE,
      { attributes: { hp: 1000, massLevel: 4 } },
    )
    expect(count(heavy.held)).toBe(count(light.held))
  })
})

test("status 事件的 entered：新开始为真，刷新为假，到期之后再施加又为真；较弱的施加排进等待链时不送 status", () => {
  const entered: string[] = []
  const plan: Record<number, (ctx: ContentContext) => void> = {
    0: (ctx) => {
      ctx.applyEffect("e", "freeze", { duration: 1 })
      ctx.applyEffect("e", "freeze", { duration: 2 })
      ctx.applyEffect("e", "fragile", { duration: 5, value: 0.5 })
      ctx.applyEffect("e", "fragile", { duration: 9, value: 0.2 })
    },
    70: (ctx) => ctx.applyEffect("e", "freeze", { duration: 1 }),
  }
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.subscribe("status", (event) => {
        entered.push(`${event.data.statusId}:${String(event.data.entered)}`)
      })
      ctx.registerSystem({
        id: "apply",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          plan[runCtx.tick()]?.(runCtx)
        },
      })
    },
  }
  const battle = createBattle(spec({ modules: ["case"], units: [ally("e", { side: "enemy", attributes: { hp: 1000 } })] }), [module])
  for (let step = 0; step < 71; step += 1) battle.step()
  expect(entered).toEqual(["freeze:true", "freeze:false", "fragile:true", "freeze:true"])
})
