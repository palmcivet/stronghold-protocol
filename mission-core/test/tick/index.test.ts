import { expect, test } from "vitest"
import { createBattle, runSteps, TICK } from "arknights-mission-core"
import { spec } from "../fixture.js"

test("步长是 1/30，无头推进按拍计数", () => {
  expect(TICK).toBe(1 / 30)
  const battle = createBattle(spec(), [])
  expect(runSteps(battle, 4).finished).toBe(false)
  expect(battle.snapshot().tick).toBe(4)
})
