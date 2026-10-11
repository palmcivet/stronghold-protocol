import { describe, expect, test } from "vitest"
import { TICK, createBattle, type ContentContext, type MissionModule, type TileSpec, type UnitSpec } from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

const lane: readonly TileSpec[] = Array.from({ length: 6 }, (_, x) => ({ x, y: 0, height: 0, deployable: true, walkableBy: ["ground"] }))

const HIT = 0.4
const BAT = 2

interface Options {
  readonly ranged?: boolean
  readonly clip?: boolean
  readonly plan?: (ctx: ContentContext, struck: readonly number[]) => void
}

/** 一个打不死的阻挡者与一个敌人：近战站在阻挡者身边被挡住，远程隔 3 格。记出手与普攻伤害的拍。 */
function swing(options: Options, ticks: number): { strikes: number[]; damaged: number[] } {
  const strikes: number[] = []
  const damaged: number[] = []
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.subscribe("attack-hit", (event) => {
        if (event.data.unitId === "e") strikes.push(event.tick)
      })
      ctx.subscribe("damaged", (event) => {
        if (event.data.sourceId === "e") damaged.push(event.tick)
      })
      ctx.registerSystem({
        id: "plan",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          options.plan?.(runCtx, strikes)
        },
      })
    },
  }
  const ranged = options.ranged === true
  const enemy: UnitSpec = ally("e", {
    side: "enemy",
    x: ranged ? 3 : 1,
    y: 0,
    facing: "LEFT",
    attributes: { hp: 1e9, atk: 100, def: 0, moveSpeed: 0, bat: BAT },
    attackRange: ranged ? [-3, -2, -1, 0, 1, 2, 3].map((x) => ({ x, y: 0 })) : [],
    timers: ["attack"],
    ...(ranged ? { attackShape: { projectile: "arrow" as const } } : { blockedBy: "a" }),
    ...(options.clip === false ? {} : { attackClip: { duration: 1, hit: HIT } }),
  })
  const wall = ally("a", { x: 0, y: 0, attributes: { hp: 1e9, atk: 0, def: 0 }, attackRange: [], ...(ranged ? {} : { blocking: ["e"] }) })
  const battle = createBattle(spec({ modules: ["case"], tiles: lane, units: [wall, enemy] }), [module])
  for (let step = 0; step < ticks; step += 1) battle.step()
  return { strikes, damaged }
}

const at = (seconds: number): number => Math.round(seconds / TICK)

/** 第一下之后的前摇开始 0.2 秒时施加 duration 秒晕眩，检查这一下被打断、晕眩后从头前摇。 */
function stunMidSwing(duration: number): void {
  let stunAt = -1
  const { strikes } = swing(
    {
      plan(ctx, struck) {
        const first = struck[0]
        if (first === undefined || stunAt >= 0 || ctx.tick() !== first + at(BAT - HIT + 0.2)) return
        stunAt = ctx.tick()
        ctx.applyEffect("e", "stun", { duration })
      },
    },
    at(HIT + BAT + duration + HIT + 1),
  )
  const first = strikes[0] ?? -1
  expect(strikes.filter((tick) => tick > first && tick < stunAt + at(duration))).toEqual([])
  expect(strikes[1]).toBe(stunAt + at(duration) - 1 + at(HIT))
  expect(strikes[1]).toBeGreaterThan(first + at(BAT + duration))
}

describe("敌人出手的前摇与打断", () => {
  test("被阻挡的敌人冷却走完就开始前摇，在命中点出手，之后每个攻击间隔一次", () => {
    const { strikes, damaged } = swing({}, at(4.6))
    expect(strikes).toEqual([at(HIT), at(HIT + BAT), at(HIT + 2 * BAT)])
    expect(damaged).toEqual(strikes)
  })

  test("命中点之前 0.1 秒的晕眩打断这一下，晕眩结束后重新走完整个前摇", () => stunMidSwing(0.1))

  test("命中点之前 0.2 秒的晕眩打断这一下，晕眩结束后重新走完整个前摇", () => stunMidSwing(0.2))

  test("冷却中的晕眩只让冷却停下，不重新前摇", () => {
    const { strikes } = swing(
      {
        plan(ctx, struck) {
          const first = struck[0]
          if (first !== undefined && ctx.tick() === first + at(0.5)) ctx.applyEffect("e", "stun", { duration: 0.5 })
        },
      },
      at(HIT + BAT + 1.2),
    )
    expect(strikes[1]).toBe((strikes[0] ?? 0) + at(BAT + 0.5) - 1)
  })

  test("缴械像晕眩一样打断前摇，结束后重新走完整个前摇", () => {
    let disarmAt = -1
    const { strikes } = swing(
      {
        plan(ctx, struck) {
          const first = struck[0]
          if (first === undefined || disarmAt >= 0 || ctx.tick() !== first + at(BAT - HIT + 0.2)) return
          disarmAt = ctx.tick()
          ctx.applyEffect("e", "disarm", { duration: 0.1 })
        },
      },
      at(HIT + BAT + 1.2),
    )
    expect(strikes[1]).toBe(disarmAt + at(0.1) - 1 + at(HIT))
  })

  test("已经出手的一箭照常飞到，出手后的晕眩不撤回", () => {
    let stunAt = -1
    const { strikes, damaged } = swing(
      {
        ranged: true,
        plan(ctx, struck) {
          if (struck.length === 1 && stunAt < 0) {
            stunAt = ctx.tick()
            ctx.applyEffect("e", "stun", { duration: 1 })
          }
        },
      },
      at(HIT + 0.8),
    )
    expect(strikes).toHaveLength(1)
    expect(stunAt).toBe((strikes[0] ?? 0) + 1)
    expect(damaged).toHaveLength(1)
    expect(damaged[0]).toBeGreaterThan(strikes[0] ?? 0)
  })

  test("没有攻击片段时没有前摇，第一拍就出手，晕眩只让冷却停下", () => {
    const { strikes } = swing(
      {
        clip: false,
        plan(ctx, struck) {
          const first = struck[0]
          if (first !== undefined && ctx.tick() === first + at(BAT - 0.1)) ctx.applyEffect("e", "stun", { duration: 0.1 })
        },
      },
      at(BAT + 0.6),
    )
    expect(strikes[0]).toBe(0)
    expect(strikes[1]).toBe(at(BAT + 0.1) - 1)
  })
})
