import { expect, test } from "vitest"
import { effectRecord } from "#server/content/support/record.js"
import { benchGate, bountyOf, gateOf } from "#server/content/choice/plan.js"

test("self-heal and flawless plans keep their packet numbers", () => {
  const heal = effectRecord("allybuff_select_11")
  const flawless = effectRecord("allybuff_select_18")
  expect(gateOf(heal)).toEqual({ kind: "always", count: 0 })
  expect(gateOf(flawless)).toEqual({ kind: "always", count: 0 })
  expect(benchGate({ kind: "benchAtMost", count: 0 }, 0)).toBe(true)
  expect(benchGate({ kind: "benchAtMost", count: 0 }, 1)).toBe(false)
  expect(benchGate({ kind: "benchAtLeast", count: 3 }, 3)).toBe(true)
  const bounty = bountyOf(effectRecord("aceffect_enemy_2"))
  expect(bounty).toBeNull()
})
