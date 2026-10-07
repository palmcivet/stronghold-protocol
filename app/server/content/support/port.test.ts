import { expect, test } from "vitest"
import { createBattle, type BattleSpec, type MissionModule, type UnitSpec } from "arknights-mission-core"
import { TICK } from "arknights-mission-core"

function spec(modules: readonly string[], units: readonly UnitSpec[], notes?: BattleSpec["notes"]): BattleSpec {
  return {
    seed: 1,
    modules,
    tiles: [{ x: 0, y: 0, height: 0, deployable: true, walkableBy: ["ground"] }],
    units,
    spawns: [],
    deployStrategy: null,
    cost: {
      ally: { initial: 0, regen: 0, cap: 0 },
      enemy: { initial: 0, regen: 0, cap: 0 },
    },
    ...(notes ? { notes } : {}),
  }
}

function unit(id: string, attributes: Record<string, number>): UnitSpec {
  return {
    id,
    side: "ally",
    attributes,
    skills: [],
    attackRange: [{ x: 1, y: 0 }],
    tags: [],
    deployPositions: ["ground"],
    x: 0,
    y: 0,
  }
}

test("a keyed modifier changes the attribute until its duration ends", () => {
  const probe: MissionModule = {
    id: "probe",
    install(registration) {
      registration.registerSystem({
        id: "probe:set",
        slot: "schedule",
        priority: 0,
        run(ctx) {
          if (ctx.tick() !== 0) return
          ctx.setModifier("a", "permanent", [{ attribute: "atk", op: "percent", value: 0.5 }])
          ctx.setModifier("a", "brief", [{ attribute: "atk", op: "add", value: 20 }], TICK)
        },
      })
      registration.registerSystem({
        id: "probe:read",
        slot: "finale",
        priority: 0,
        run(ctx) {
          ctx.emit("probe", { atk: ctx.attribute("a", "atk"), brief: ctx.hasModifier("a", "brief") })
        },
      })
    },
  }
  const battle = createBattle(spec(["probe"], [unit("a", { hp: 100, atk: 100 })]), [probe])
  battle.step()
  const first = battle.drainEvents().filter((event) => event.type === "probe")
  expect(first[0]?.data.atk).toBe(180)
  expect(first[0]?.data.brief).toBe(true)
  battle.step()
  const second = battle.drainEvents().filter((event) => event.type === "probe")
  expect(second[0]?.data.atk).toBe(150)
  expect(second[0]?.data.brief).toBe(false)
})

test("revising a fatal event keeps the unit at 1 hp", () => {
  let bound = false
  const probe: MissionModule = {
    id: "probe",
    install(registration) {
      registration.registerSystem({
        id: "probe:bind",
        slot: "schedule",
        priority: 0,
        run(ctx) {
          if (bound) return
          bound = true
          ctx.subscribe("fatal", (event) => {
            ctx.revise(event, { prevented: true })
          })
        },
      })
      registration.registerSystem({
        id: "probe:hit",
        slot: "ally",
        priority: 0,
        run(ctx) {
          if (ctx.tick() !== 0) return
          ctx.dealDamage({ sourceId: "a", targetId: "a", amount: 500, kind: "true" })
        },
      })
    },
  }
  const battle = createBattle(spec(["probe"], [unit("a", { hp: 100, atk: 10 })]), [probe])
  battle.step()
  expect(battle.snapshot().units.find((entry) => entry.id === "a")?.attributes.hp).toBe(1)
})
