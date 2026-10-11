import { describe, expect, it } from "vitest"
import type { UnitSpec } from "#contract/spec.js"
import { readSnapshot } from "#battle/snapshot.js"
import { createRegistry } from "#battle/registry.js"
import { createWorld } from "#kernel/world/index.js"
import { addUnit, type BattleWorld, type UnitState } from "#unit/record/index.js"
import { spec as battleSpec } from "#test/fixture.js"

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

function worldOf(tick: number, units: readonly UnitSpec[]): BattleWorld {
  const world = createWorld<UnitState>(battleSpec())
  world.tick = tick
  for (const unit of units) addUnit(world, unit, true)
  return world
}

describe("unit kind in snapshots", () => {
  it("reads an operator for an ally and an enemy for an enemy when no kind is given", () => {
    const snapshot = readSnapshot(worldOf(0, [spec("guard", "ally"), spec("walker", "enemy")]), createRegistry())

    expect(snapshot.units.map((unit) => [unit.id, unit.kind])).toEqual([
      ["guard", "operator"],
      ["walker", "enemy"],
    ])
  })

  it("keeps an explicit device kind on the unit that stands for a crate or turret", () => {
    const snapshot = readSnapshot(worldOf(3, [spec("crate-1", "ally", "device")]), createRegistry())

    expect(snapshot.units[0]?.kind).toBe("device")
  })
})
