import { describe, expect, it } from "vitest"
import type { UnitSnapshot } from "arknights-mission-core"
import type { BoardTransform } from "./projection.js"
import { pickBoard } from "./pointer.js"

const transform: BoardTransform = {
  x: 0,
  y: 0,
  scale: 1,
  worldX: 0,
  worldY: 0,
  worldWidth: 192,
  worldHeight: 64,
}

function unit(id: string, x: number, y: number, tags: readonly string[] = []): UnitSnapshot {
  return {
    id,
    side: "ally",
    kind: "operator",
    x,
    y,
    facing: "RIGHT",
    height: 0,
    attributes: { hp: 1, maxHp: 1 },
    tags,
    attackRange: [],
    deployPositions: [],
    elements: {},
    blocking: [],
    blockedBy: null,
    skills: [],
    shield: 0,
    downed: false,
    redeploy: null,
    components: {},
  }
}

describe("board picking", () => {
  it("picks a unit before its tile and ignores a hidden unit", () => {
    const tiles = [{ x: 1, y: 0 }, { x: 2, y: 0 }]
    const units = [unit("guard", 1, 0), unit("shade", 2, 0, ["hidden"])]

    expect(pickBoard(96, 32, transform, 64, 3, 1, units, tiles)).toEqual({ type: "unit", unitId: "guard" })
    expect(pickBoard(160, 32, transform, 64, 3, 1, units, tiles)).toEqual({ type: "tile", x: 2, y: 0 })
    expect(pickBoard(8, 8, null, 64, 3, 1, units, tiles)).toEqual({ type: "empty" })
  })
})
