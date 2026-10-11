import { describe, expect, test } from "vitest"
import {
  createBattle,
  redeployModule,
  type BattleEvent,
  type BattleEventType,
  type BattleInput,
  type ContentContext,
  type MissionModule,
  type UnitSpec,
} from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

const lane = [0, 1, 2, 3].map((x) => ({ x, y: 0, height: 0, deployable: true, walkableBy: ["ground"] }))

/** 测试里按名字读事件数据的一个字段。 */
function field(event: BattleEvent, key: string): unknown {
  return (event.data as unknown as Record<string, unknown>)[key]
}

type Plan = Readonly<Record<number, (ctx: ContentContext) => void>>

/** a 是 cost 3、respawnTime 1 秒的友方，e 是敌人。plan 在 schedule 槽按拍调用内容接口。 */
function open(plan: Plan = {}, redeploy = false, units: UnitSpec[] = []) {
  const notes: unknown[] = []
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.registerSystem({
        id: "plan",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          const step = plan[runCtx.tick()]
          if (step) notes.push(step(runCtx))
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["case", ...(redeploy ? ["redeploy"] : [])],
      cost: { ally: { initial: 10, regen: 0, cap: 99 }, enemy: { initial: 0, regen: 0, cap: 0 } },
      tiles: lane,
      units: [
        ally("a", {
          attributes: { hp: 100, maxHp: 100, atk: 0, def: 0, cost: 3, respawnTime: 1 },
          attackRange: [],
          skills: [{ id: "s", body: "instant", trigger: "NEVER", spCost: 5, initSp: 2, duration: 0, ammo: 0, spType: "time" }],
        }),
        ally("e", { side: "enemy", x: 3, attributes: { hp: 100, atk: 0 }, attackRange: [] }),
        ...units,
      ],
    }),
    [module, ...(redeploy ? [redeployModule] : [])],
  )
  const events: BattleEvent[] = []
  return {
    battle,
    notes,
    events,
    step(inputs?: readonly BattleInput[]) {
      battle.step(inputs)
      events.push(...battle.drainEvents())
    },
    run(count: number) {
      for (let index = 0; index < count; index += 1) this.step()
    },
    unit(id = "a") {
      const found = battle.snapshot().units.find((unit) => unit.id === id)
      if (!found) throw new Error(`no ${id}`)
      return found
    },
    of(type: BattleEventType): BattleEvent[] {
      return events.filter((event) => event.type === type)
    },
  }
}

describe("玩家输入", () => {
  test("retreat 撤下在场的友方：送出 input 与 retreat，不送 downed，不记倒下；再部署模块按计时与费用让它回来", () => {
    const h = open({}, true)
    h.step([{ type: "retreat", unitId: "a" }])
    expect(h.of("input").map((event) => event.data)).toEqual([{ input: { type: "retreat", unitId: "a" } }])
    expect(h.of("retreat").map((event) => event.data)).toEqual([{ unitId: "a" }])
    expect(h.of("downed")).toEqual([])
    expect(h.battle.ledger().battle.deaths).toBe(0)
    expect(h.unit().downed).toBe(true)
    h.run(30)
    expect(h.unit().downed).toBe(false)
    expect(h.of("deploy").filter((event) => event.tick > 0).map((event) => field(event, "unitId"))).toEqual(["a"])
  })

  test("不成立的输入送出 input-refused 和原因，世界不变；按提交顺序执行", () => {
    const h = open()
    h.step([
      { type: "redeploy", unitId: "a" },
      { type: "retreat", unitId: "e" },
      { type: "retreat", unitId: "nobody" },
      { type: "cast", unitId: "a", skillId: "s" },
      { type: "retreat", unitId: "a" },
      { type: "redeploy", unitId: "a" },
    ])
    expect(h.of("input-refused").map((event) => event.data)).toEqual([
      { input: { type: "redeploy", unitId: "a" }, reason: "not-waiting" },
      { input: { type: "retreat", unitId: "e" }, reason: "not-ally" },
      { input: { type: "retreat", unitId: "nobody" }, reason: "unknown-unit" },
      { input: { type: "cast", unitId: "a", skillId: "s" }, reason: "cannot-cast" },
      { input: { type: "redeploy", unitId: "a" }, reason: "not-ready" },
    ])
    expect(h.of("input").map((event) => event.data)).toEqual([{ input: { type: "retreat", unitId: "a" } }])
  })

  test("redeploy 在计时走完后带 tile 落到别的格子；计时没走完时拒绝", () => {
    const h = open({}, false, [])
    h.step([{ type: "retreat", unitId: "a" }])
    h.step([{ type: "redeploy", unitId: "a", tile: { x: 2, y: 0 } }])
    expect(h.of("input-refused").map((event) => field(event, "reason"))).toEqual(["not-ready"])
    const quick = open({}, false, [ally("b", { x: 1, attributes: { hp: 100, maxHp: 100, atk: 0, cost: 0, respawnTime: 0 }, attackRange: [] })])
    quick.step([{ type: "retreat", unitId: "b" }])
    quick.step([{ type: "redeploy", unitId: "b", tile: { x: 2, y: 0 } }])
    expect(quick.of("input-refused")).toEqual([])
    expect(quick.unit("b")).toMatchObject({ downed: false, x: 2, y: 0 })
  })

  test("cast 手动释放技能，充能够时送出 skill-start", () => {
    const h = open({ 0: (ctx) => ctx.readySkill("a", "s") })
    h.step()
    h.step([{ type: "cast", unitId: "a", skillId: "s" }])
    expect(h.of("skill-start").map((event) => field(event, "unitId"))).toEqual(["a"])
    expect(h.of("input")).toHaveLength(1)
  })
})

describe("内容命令", () => {
  test("redeployUnit 立即、免费、保留技力，落到给定格子；撤下敌人也走同一段", () => {
    const h = open({
      0: (ctx) => ctx.retreatUnit("a"),
      1: (ctx) => ctx.redeployUnit("a", { delay: 0, cost: 0, keepSp: true, tile: { x: 2, y: 0 } }),
      2: (ctx) => ctx.retreatUnit("e"),
    })
    h.run(3)
    expect(h.notes).toEqual([null, null, null])
    expect(h.unit()).toMatchObject({ downed: false, x: 2, y: 0 })
    expect(h.of("deploy").filter((event) => event.tick > 0).map((event) => field(event, "unitId"))).toEqual(["a"])
    expect(h.unit("e").downed).toBe(true)
  })

  test("keepSp 保留撤下前的技力，不带时按 initSp 重新开始", () => {
    const sp = (keepSp: boolean) => {
      const h = open({
        0: (ctx) => {
          ctx.gainSp("a", "s", 2, { ignoreLock: true })
          return ctx.retreatUnit("a")
        },
        1: (ctx) => ctx.redeployUnit("a", { delay: 0, cost: 0, keepSp }),
      })
      h.run(2)
      return h.unit().skills[0]?.sp ?? Number.NaN
    }
    expect(sp(true)).toBeGreaterThanOrEqual(4)
    expect(sp(false)).toBeLessThan(2.1)
  })

  test("keepSp 也保留充能", () => {
    const charges = (keepSp: boolean) => {
      const h = open({
        0: (ctx) => {
          ctx.readySkill("a", "s")
          return ctx.retreatUnit("a")
        },
        1: (ctx) => ctx.redeployUnit("a", { delay: 0, cost: 0, keepSp }),
      })
      h.run(2)
      return h.unit().skills[0]?.charges ?? Number.NaN
    }
    expect(charges(true)).toBe(1)
    expect(charges(false)).toBe(0)
  })

  test("delay 不是 0 时排下，由再部署模块到点执行；没装再部署模块时拒绝", () => {
    const h = open(
      {
        0: (ctx) => ctx.retreatUnit("a"),
        1: (ctx) => ctx.redeployUnit("a", { delay: 0.5, cost: 0 }),
      },
      true,
    )
    h.run(15)
    expect(h.unit().downed).toBe(true)
    h.run(1)
    expect(h.unit().downed).toBe(false)
    expect(h.of("deploy").at(-1)?.tick).toBe(15)
    const bare = open({ 0: (ctx) => ctx.retreatUnit("a"), 1: (ctx) => ctx.redeployUnit("a", { delay: 0.5 }) })
    bare.run(2)
    expect(bare.notes).toEqual([null, "no-redeploy"])
  })
})
