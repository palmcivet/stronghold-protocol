import { describe, expect, test } from "vitest"
import {
  BLOCK_RADIUS,
  BLOCK_RADIUS_DEVICE,
  BLOCK_RADIUS_FLY,
  blockModule,
  createBattle,
  type ContentContext,
  type MissionModule,
  type UnitSnapshot,
  type UnitSpec,
} from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

type Plan = Readonly<Record<number, (ctx: ContentContext) => void>>

const tiles = [0, 1].flatMap((y) => Array.from({ length: 12 }, (_, x) => ({ x, y, height: 0, deployable: true, walkableBy: ["ground"] })))
const route = { checkpoints: [], end: { x: 0, y: 0 } }

function op(id: string, x: number, blockCnt = 1, extra: Partial<UnitSpec> = {}): UnitSpec {
  return ally(id, { x, y: 0, attackRange: [], attributes: { hp: 1e6, atk: 0, def: 0, blockCnt }, ...extra })
}

function foe(id: string, x: number, extra: Partial<UnitSpec> = {}, weight = 1): UnitSpec {
  return ally(id, { side: "enemy", x, y: 0, attributes: { hp: 1e7, atk: 0, def: 0, moveSpeed: 2, blockWeight: weight }, route, ...extra })
}

function lane(units: UnitSpec[], plan: Plan = {}) {
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.registerSystem({ id: "case-plan", slot: "schedule", priority: 0, run: (runCtx) => plan[runCtx.tick()]?.(runCtx) })
    },
  }
  const battle = createBattle(spec({ modules: ["block", "case"], tiles, units }), [blockModule, module])
  return {
    battle,
    run(count: number) {
      for (let index = 0; index < count; index += 1) battle.step()
    },
    unit(id: string): UnitSnapshot {
      const unit = battle.snapshot().units.find((item) => item.id === id)
      if (!unit) throw new Error(`no ${id}`)
      return unit
    },
  }
}

const kill = (id: string) => (ctx: ContentContext) => ctx.dealDamage({ sourceId: id, targetId: id, amount: 1e12, kind: "true" })

/** X 被前面的 front 挡住，E 穿过满员的 front 被后面的 back 挡住，这时 E 同时压在两人身上。 */
function sandwich(plan: Plan = {}) {
  const h = lane([op("front", 6), op("back", 5), foe("x", 9), foe("e", 10)], plan)
  h.run(150)
  expect(h.unit("x").blockedBy).toBe("front")
  expect(h.unit("e").blockedBy).toBe("back")
  expect(Math.hypot(h.unit("e").x - 6, h.unit("e").y)).toBeLessThan(BLOCK_RADIUS)
  return h
}

describe("阻挡接替", () => {
  test("阻挡半径是官方数：地面 0.7071，飞行 0.8944，装置 0.4472", () => {
    expect(BLOCK_RADIUS).toBeCloseTo(0.7071, 3)
    expect(BLOCK_RADIUS_FLY).toBeCloseTo(0.8944, 3)
    expect(BLOCK_RADIUS_DEVICE).toBeCloseTo(0.4472, 3)
  })

  test("夹在两人中间的敌人：后面的阻挡者活着时跟着它；它死后前面腾出位置的那位接替，敌人不往前走", () => {
    const h = sandwich({ 150: kill("x"), 160: kill("back") })
    h.run(2)
    expect(h.unit("e").blockedBy).toBe("back")
    const x = h.unit("e").x
    h.run(10)
    expect(h.unit("e").blockedBy).toBe("front")
    h.run(30)
    expect(h.unit("e").blockedBy).toBe("front")
    expect(h.unit("e").x).toBeCloseTo(x, 6)
  })

  test("后面的阻挡者撤退或晕眩时，敌人交给还压着它的那位", () => {
    for (const hand of [(ctx: ContentContext) => void ctx.retreatUnit("back"), (ctx: ContentContext) => ctx.applyEffect("back", "stun", { duration: 5 })]) {
      const h = sandwich({ 150: (ctx) => { kill("x")(ctx); hand(ctx) } })
      h.run(2)
      expect(h.unit("e").blockedBy).toBe("front")
    }
  })

  test("后面的阻挡者死时前面那位还满员：敌人接着走", () => {
    const h = sandwich({ 150: kill("back") })
    h.run(2)
    expect(h.unit("e").blockedBy).toBeNull()
    const x = h.unit("e").x
    h.run(30)
    expect(h.unit("e").x).toBeLessThan(x - 0.2)
  })

  test("满员时穿过去；穿过格子但还在 0.7071 里时腾出位置，当场被挡；一直没位置就走过去", () => {
    const pass = lane([op("front", 6), foe("x", 9), foe("e", 10)])
    pass.run(150)
    expect(pass.unit("e").blockedBy).toBeNull()
    expect(pass.unit("e").x).toBeLessThan(5.5)
    pass.run(60)
    expect(pass.unit("e").x).toBeLessThan(4.5)
    expect(pass.unit("front").blocking).toEqual(["x"])

    const h = lane([op("front", 6), foe("x", 9), foe("e", 10)], { 138: kill("x") })
    h.run(138)
    const e = h.unit("e")
    expect(e.blockedBy).toBeNull()
    expect(e.x).toBeLessThan(5.5)
    expect(6 - e.x).toBeLessThan(BLOCK_RADIUS)
    h.run(1)
    expect(h.unit("e").blockedBy).toBe("front")
  })

  test("在阻挡半径处接触：敌人停在离干员约 0.71 格处，在干员的格子之外", () => {
    const h = lane([op("front", 6), foe("x", 9)])
    h.run(120)
    expect(h.unit("x").blockedBy).toBe("front")
    const d = h.unit("x").x - 6
    expect(d).toBeLessThanOrEqual(BLOCK_RADIUS)
    expect(d).toBeGreaterThan(BLOCK_RADIUS - 0.05)
  })

  test("站在路线旁一行的干员碰不到走过的敌人", () => {
    const h = lane([op("side", 6, 1, { y: 1 }), foe("x", 9)])
    h.run(200)
    expect(h.unit("x").x).toBeLessThan(4)
    expect(h.battle.drainEvents().filter((event) => event.type === "blocked")).toEqual([])
  })

  test("阻挡重量 2 的敌人要 2 个空位：阻挡数 1 挡不住，2 挡得住", () => {
    const one = lane([op("front", 6), foe("h", 9, {}, 2)])
    one.run(200)
    expect(one.unit("h").blockedBy).toBeNull()
    expect(one.unit("h").x).toBeLessThan(4.5)
    const two = lane([op("front", 6, 2), foe("h", 9, {}, 2)])
    two.run(120)
    expect(two.unit("h").blockedBy).toBe("front")
  })
})

describe("挡住就打得到", () => {
  const damagedBy = (h: ReturnType<typeof lane>, source: string, target: string) =>
    h.battle.drainEvents().filter((event) => event.type === "damaged" && event.data.sourceId === source && event.data.targetId === target).length

  test("单纯的阻挡，四个朝向：阻挡者打它挡住的敌人，不管在不在范围里", () => {
    for (const facing of ["UP", "RIGHT", "DOWN", "LEFT"] as const) {
      const h = lane([op("b", 6, 1, { facing, attackRange: [{ x: 1, y: 0 }], timers: ["attack"], attributes: { hp: 1e6, atk: 100, def: 0, blockCnt: 1 } }), foe("x", 9)])
      h.run(120)
      expect(h.unit("x").blockedBy).toBe("b")
      h.battle.drainEvents()
      h.run(90)
      expect(damagedBy(h, "b", "x"), facing).toBeGreaterThan(0)
    }
  })

  test("晚接替（敌人已经穿过前面那位，在它身后、它的范围之外）：接替的阻挡者照样打它", () => {
    const h = lane(
      [
        op("front", 6, 1, { attackRange: [{ x: 1, y: 0 }], timers: ["attack"], attributes: { hp: 1e6, atk: 100, def: 0, blockCnt: 1 } }),
        op("back", 5),
        foe("x", 9),
        foe("e", 10),
      ],
      { 150: kill("x"), 160: kill("back") },
    )
    h.run(152)
    expect(h.unit("e").blockedBy).toBe("back")
    h.run(10)
    expect(h.unit("e").blockedBy).toBe("front")
    expect(h.unit("e").x).toBeLessThan(6)
    h.battle.drainEvents()
    h.run(90)
    expect(damagedBy(h, "front", "e")).toBeGreaterThan(0)
  })
})
