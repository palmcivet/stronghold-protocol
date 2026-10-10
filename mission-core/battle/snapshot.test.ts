import { describe, expect, it } from "vitest"
import type { UnitSpec } from "#contract/spec.js"
import { readSnapshot } from "#battle/snapshot.js"
import { createUnit } from "#unit/record/index.js"

function spec(id: string, side: UnitSpec["side"], kind?: UnitSpec["kind"]): UnitSpec {
  return {
    id,
    side,
    ...(kind ? { kind } : {}),
    attributes: { hp: 1, maxHp: 1 },
    skills: [],
    attackRange: [],
    tags: [],
    deployPositions: [],
    x: 0,
    y: 0,
  }
}

describe("unit kind in snapshots", () => {
  it("reads an operator for an ally and an enemy for an enemy when no kind is given", () => {
    const snapshot = readSnapshot(0, [
      createUnit(spec("guard", "ally"), true, 0),
      createUnit(spec("walker", "enemy"), true, 1),
    ])

    expect(snapshot.units.map((unit) => [unit.id, unit.kind])).toEqual([
      ["guard", "operator"],
      ["walker", "enemy"],
    ])
  })

  it("keeps an explicit device kind on the unit that stands for a crate or turret", () => {
    const snapshot = readSnapshot(3, [createUnit(spec("crate-1", "ally", "device"), true, 0)])

    expect(snapshot.units[0]?.kind).toBe("device")
  })
})
