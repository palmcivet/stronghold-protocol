import { expect, test } from "vitest"
import { createBattle, type MissionModule, type StatusDefinition } from "arknights-mission-core"
import { ally, spec } from "../fixture.js"

const stealth: StatusDefinition = {
  id: "stealth",
  flags: ["stealth"],
  modifiers: [],
  immunity: [],
  stackCap: 1,
  cancels: [],
  duration: 0,
}

test("快照不调用选择器", () => {
  let calls = 0
  const probe: MissionModule = {
    id: "probe",
    install(ctx) {
      ctx.registerStatus(stealth)
      ctx.registerSelector({
        id: "trap",
        filter() {
          calls += 1
          return true
        },
        compare() {
          calls += 1
          return 0
        },
      })
      ctx.registerSystem({
        id: "apply",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          runCtx.applyStatus("a", "stealth")
        },
      })
      ctx.registerSystem({
        id: "query",
        slot: "ally",
        priority: 1,
        run(runCtx) {
          runCtx.unitsInRange("a", "trap")
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["probe"],
      units: [ally("a"), ally("b", { side: "enemy", x: 1, y: 0 })],
    }),
    [probe],
  )
  expect(calls).toBe(0)
  battle.snapshot()
  expect(calls).toBe(0)
  battle.step()
  expect(calls).toBeGreaterThan(0)
  const afterStep = calls
  const snapshot = battle.snapshot()
  expect(calls).toBe(afterStep)
  expect(snapshot.units.find((unit) => unit.id === "a")?.flags).toContain("stealth")
  expect(snapshot.units.find((unit) => unit.id === "a")?.elements).toEqual({})
})
