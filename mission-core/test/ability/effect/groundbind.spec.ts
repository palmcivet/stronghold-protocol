import { expect, test } from "vitest"
import { createBattle, type ContentContext, type MissionModule, type UnitSpec } from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

type Plan = Readonly<Record<number, (ctx: ContentContext) => void>>

const tiles = [0, 1, 2, 3, 4].flatMap((x) => [0, 1].map((y) => ({ x, y, height: 0, deployable: true, walkableBy: ["ground"] })))

function flyer(id: string, patch: Partial<UnitSpec> = {}): UnitSpec {
  return ally(id, {
    side: "enemy",
    x: 1,
    y: 0,
    motion: "FLY",
    attackRange: [],
    attributes: { hp: 1e7, atk: 0, def: 0, moveSpeed: 1 },
    ...patch,
  })
}

function open(units: UnitSpec[], plan: Plan) {
  const hits: { tick: number; target: string }[] = []
  const speeds: Record<string, number[]> = {}
  let tick = 0
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.subscribe("damaged", (event) => {
        hits.push({ tick, target: String(event.data.targetId) })
      })
      ctx.registerSystem({
        id: "plan",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          tick = runCtx.tick()
          plan[tick]?.(runCtx)
        },
      })
      ctx.registerSystem({
        id: "read",
        slot: "finale",
        priority: 0,
        run(runCtx) {
          for (const unit of units) (speeds[unit.id] ??= []).push(runCtx.attribute(unit.id, "moveSpeed"))
        },
      })
    },
  }
  const battle = createBattle(spec({ modules: ["case"], tiles, units }), [module])
  return { battle, hits, speeds }
}

function tagsOf(battle: ReturnType<typeof createBattle>, id: string): readonly string[] {
  return battle.snapshot().units.find((unit) => unit.id === id)?.tags ?? []
}

test("缚地授予 groundbind 与 no-move，移速乘 0，抵抗缩短它，重量超过 3 时减半", () => {
  const { battle, speeds } = open(
    [flyer("f"), flyer("heavy", { y: 1, attributes: { hp: 1e7, atk: 0, def: 0, massLevel: 4 } }), flyer("resist", { x: 2 })],
    {
      0: (ctx) => {
        ctx.applyEffect("f", "groundbind", { duration: 10 })
        ctx.applyEffect("heavy", "groundbind", { duration: 10 })
        ctx.applyEffect("resist", "resist", { value: 0.5 })
        ctx.applyEffect("resist", "groundbind", { duration: 10 })
      },
    },
  )
  battle.step()
  expect(tagsOf(battle, "f")).toEqual(["groundbind", "no-move"])
  expect(speeds.f?.[0]).toBe(0)
  for (let step = 1; step < 149; step += 1) battle.step()
  expect(tagsOf(battle, "heavy")).toContain("groundbind")
  expect(tagsOf(battle, "resist")).toContain("groundbind")
  battle.step()
  expect(tagsOf(battle, "heavy")).not.toContain("groundbind")
  expect(tagsOf(battle, "resist")).not.toContain("groundbind")
  expect(tagsOf(battle, "f")).toContain("groundbind")
})

test("缚地的飞行敌人算地面单位，打不到空中的干员能打它；结束后回到空中", () => {
  const { battle, hits } = open(
    [
      ally("a", { x: 0, y: 0, attributes: { hp: 1000, atk: 100, def: 0 }, attackRange: [{ x: 1, y: 0 }], timers: ["attack"] }),
      flyer("f"),
    ],
    { 30: (ctx) => ctx.applyEffect("f", "groundbind", { duration: 2 }) },
  )
  for (let step = 0; step < 150; step += 1) battle.step()
  const on = (from: number, to: number) => hits.filter((hit) => hit.target === "f" && hit.tick >= from && hit.tick < to).length
  expect(on(0, 30)).toBe(0)
  expect(on(30, 90)).toBeGreaterThan(0)
  expect(on(91, 150)).toBe(0)
})

test("飞行敌人不吃浮空，缚地中的飞行敌人吃浮空并回到空中", () => {
  const { battle, hits } = open(
    [
      ally("a", { x: 0, y: 0, attributes: { hp: 1000, atk: 100, def: 0 }, attackRange: [{ x: 1, y: 0 }], timers: ["attack"] }),
      flyer("f"),
      flyer("free", { x: 3 }),
    ],
    {
      0: (ctx) => {
        ctx.applyEffect("free", "levitate", { duration: 3 })
        ctx.applyEffect("f", "groundbind", { duration: 5 })
      },
      30: (ctx) => ctx.applyEffect("f", "levitate", { duration: 2 }),
    },
  )
  battle.step()
  expect(tagsOf(battle, "free")).toEqual([])
  for (let step = 1; step < 31; step += 1) battle.step()
  expect(tagsOf(battle, "f")).toContain("levitate")
  const before = hits.filter((hit) => hit.target === "f").length
  expect(before).toBeGreaterThan(0)
  for (let step = 31; step < 80; step += 1) battle.step()
  expect(hits.filter((hit) => hit.target === "f" && hit.tick > 31).length).toBe(0)
})
