import { expect, test } from "vitest"
import {
  blockModule,
  createBattle,
  defineEffect,
  NO_HEAL,
  type BattleEvent,
  type ContentContext,
  type MissionModule,
  type UnitSpec,
} from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

type Plan = Readonly<Record<number, (ctx: ContentContext) => void>>

const tiles = [0, 1].flatMap((y) => Array.from({ length: 10 }, (_, x) => ({ x, y, height: 0, deployable: true, walkableBy: ["ground"] })))

function open(units: UnitSpec[], plan: Plan = {}, prepare?: MissionModule["install"]) {
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      prepare?.(ctx)
      ctx.registerSystem({ id: "plan", slot: "schedule", priority: 1, run: (runCtx) => plan[runCtx.tick()]?.(runCtx) })
    },
  }
  const battle = createBattle(spec({ modules: ["block", "case"], tiles, units }), [blockModule, module])
  const events: { tick: number; event: BattleEvent }[] = []
  let tick = 0
  return {
    battle,
    run(count: number) {
      for (let index = 0; index < count; index += 1) {
        battle.step()
        for (const event of battle.drainEvents()) events.push({ tick, event })
        tick += 1
      }
    },
    damaged(source: string, target: string, from = 0, to = Infinity): number {
      return events.filter(
        ({ tick: at, event }) => at >= from && at < to && event.type === "damaged" && event.data.sourceId === source && event.data.targetId === target,
      ).length
    },
    attacks(unitId: string, from = 0, to = Infinity): number {
      return events.filter(({ tick: at, event }) => at >= from && at < to && event.type === "attack" && event.data.unitId === unitId).length
    },
    unit(id: string) {
      const found = battle.snapshot().units.find((item) => item.id === id)
      if (!found) throw new Error(`no ${id}`)
      return found
    },
  }
}

test("沉睡的敌人不被普攻选中，醒来之后照常挨打", () => {
  const h = open(
    [
      ally("s", { timers: ["attack"], attackRange: [1, 2, 3].map((x) => ({ x, y: 0 })), attributes: { hp: 1e6, atk: 100, def: 0, bat: 0.5 } }),
      ally("e", { side: "enemy", x: 2, attackRange: [], attributes: { hp: 1e6, atk: 0, def: 0 } }),
    ],
    { 0: (ctx) => ctx.applyEffect("e", "sleep", { duration: 2 }) },
  )
  h.run(100)
  expect(h.damaged("s", "e", 0, 55)).toBe(0)
  expect(h.damaged("s", "e", 62, 100)).toBeGreaterThan(0)
})

test("恐惧：放开阻挡、不出手；没有来源时停在自己的格子上；结束后再被挡住", () => {
  let x0 = Number.NaN
  const h = open(
    [
      ally("g", { x: 3, attackRange: [], attributes: { hp: 1e6, atk: 0, def: 0, blockCnt: 2 } }),
      ally("e", {
        side: "enemy",
        x: 8,
        timers: ["attack"],
        attackRange: [],
        attributes: { hp: 1e6, atk: 100, def: 0, bat: 1, moveSpeed: 2, blockWeight: 1 },
        route: { checkpoints: [], end: { x: 0, y: 0 } },
      }),
    ],
    {
      200: (ctx) => {
        x0 = ctx.unit("e")?.x ?? Number.NaN
        ctx.applyEffect("e", "fear", { duration: 2 })
      },
    },
  )
  h.run(200)
  expect(h.unit("e").blockedBy).toBe("g")
  expect(h.attacks("e", 150, 200)).toBeGreaterThan(0)
  h.run(57)
  expect(h.unit("e").blockedBy).toBeNull()
  expect(h.attacks("e", 201, 257)).toBe(0)
  expect(Math.round(h.unit("e").x)).toBe(Math.round(x0))
  h.run(30)
  expect(h.unit("e").blockedBy).toBe("g")
})

test("两个闪避来源各自独立判定：0.5 与 0.5 合成 1 − 0.5 × 0.5 = 0.75", () => {
  let dodge = Number.NaN
  open(
    [ally("u", { attackRange: [], attributes: { hp: 100, atk: 0, def: 0 } })],
    {
      0: (ctx) => {
        ctx.applyEffect("u", "case-d1")
        ctx.applyEffect("u", "case-d2")
      },
      1: (ctx) => {
        dodge = ctx.attribute("u", "dodgePhys")
      },
    },
    (ctx) => {
      ctx.registerEffect(defineEffect("case-d1", { modifiers: [{ attribute: "dodgePhys", op: "add", value: 0.5 }] }))
      ctx.registerEffect(defineEffect("case-d2", { modifiers: [{ attribute: "dodgePhys", op: "add", value: 0.5 }] }))
    },
  ).run(2)
  expect(dodge).toBeCloseTo(0.75, 9)
})

test("NEVER 的技能技力满了也不自己放；手动放之后持续期间不回技力", () => {
  let cast = false
  const h = open(
    [
      ally("u", {
        attackRange: [],
        attributes: { hp: 100, atk: 0, def: 0 },
        skills: [{ id: "s", body: "duration", trigger: "NEVER", spCost: 2, initSp: 2, duration: 5, ammo: 0, spType: "time" }],
      }),
    ],
    { 120: (ctx) => void (cast = ctx.castSkill("u", "s")) },
  )
  h.run(120)
  expect(h.unit("u").skills[0]).toMatchObject({ active: false, sp: 2 })
  h.run(60)
  expect(cast).toBe(true)
  expect(h.unit("u").skills[0]).toMatchObject({ active: true, sp: 0 })
})

test("治疗选生命比例最低的受伤友方；都满血时不出手；带 no-heal 的不治", () => {
  const heal = (id: string, x: number, extra: Partial<UnitSpec> = {}) =>
    ally(id, { x, y: 0, attackRange: [], attributes: { hp: 5000, maxHp: 5000, atk: 0, def: 0 }, ...extra })
  const h = open(
    [
      ally("m", {
        timers: ["attack"],
        attackShape: { damage: "heal" },
        attackRange: [0, 1, 2, 3].map((x) => ({ x, y: 0 })),
        attributes: { hp: 1e6, atk: 200, def: 0, bat: 1 },
      }),
      heal("a", 1),
      heal("b", 2),
      heal("r", 3, { tags: [NO_HEAL.id] }),
    ],
    {
      60: (ctx) => {
        ctx.dealDamage({ sourceId: "a", targetId: "a", amount: 1000, kind: "true" })
        ctx.dealDamage({ sourceId: "b", targetId: "b", amount: 3000, kind: "true" })
        ctx.dealDamage({ sourceId: "r", targetId: "r", amount: 4900, kind: "true" })
      },
    },
  )
  h.run(60)
  expect(h.attacks("m")).toBe(0)
  h.run(35)
  expect(h.unit("b").attributes.hp).toBeGreaterThan(2000)
  expect(h.unit("a").attributes.hp).toBe(4000)
  expect(h.unit("r").attributes.hp).toBe(100)
})

test("远程敌人打范围里的友方：阻挡者优先，其次嘲讽高的，再其次最晚部署的", () => {
  const caster = (blockedBy?: string) =>
    ally("e", {
      side: "enemy",
      x: 3,
      facing: "LEFT",
      timers: ["attack"],
      attackRange: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
      attributes: { hp: 1e6, atk: 100, def: 0, bat: 1 },
      ...(blockedBy ? { blockedBy } : {}),
    })
  const target = (id: string, x: number, aggroSeq: number, taunt = 0, blocking = false) =>
    ally(id, { x, attackRange: [], aggroSeq, attributes: { hp: 1e6, atk: 0, def: 0, taunt }, ...(blocking ? { blocking: ["e"] } : {}) })
  const hitOf = (units: UnitSpec[]) => {
    const h = open(units)
    h.run(60)
    return ["a", "b", "c"].filter((id) => h.damaged("e", id) > 0)
  }
  expect(hitOf([target("a", 1, 2), target("b", 2, 1, 1), caster()])).toEqual(["b"])
  expect(hitOf([target("a", 1, 2), target("b", 2, 1), caster()])).toEqual(["a"])
  expect(hitOf([target("a", 1, 2), target("b", 2, 1, 1), target("c", 4, 0, 0, true), caster("c")])).toEqual(["c"])
})
