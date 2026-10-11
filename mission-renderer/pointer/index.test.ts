import { describe, expect, it } from "vitest"
import type { UnitSnapshot } from "arknights-mission-core"
import type { MissionBoardTransform } from "#runtime/camera/index.js"
import { pickBoard } from "#pointer/index.js"

const transform: MissionBoardTransform = {
  x: 0,
  y: 0,
  scale: 1,
  worldX: 0,
  worldY: 0,
  worldWidth: 192,
  worldHeight: 64,
}

function unit(id: string, x: number, y: number, tags: readonly string[] = [], height = 0): UnitSnapshot {
  return {
    id,
    side: "ally",
    kind: "operator",
    x,
    y,
    facing: "RIGHT",
    height,
    attributes: { hp: 1, maxHp: 1 },
    maxHp: 1,
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
    unbalanceUntil: null,
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

  it("picks the nearest unit in reach, whatever the order of the units", () => {
    const tiles = [{ x: 1, y: 0 }]
    const units = [unit("far", 1.3, 0), unit("near", 1.1, 0)]
    expect(pickBoard(96 + 64 * 0.15, 32, transform, 64, 3, 1, units, tiles)).toEqual({ type: "unit", unitId: "near" })
    expect(pickBoard(96 + 64 * 0.15, 32, transform, 64, 3, 1, [...units].reverse(), tiles)).toEqual({ type: "unit", unitId: "near" })
  })

  it("breaks a tie in distance by the unit drawn on top: higher, then in the nearer row", () => {
    const board: MissionBoardTransform = { ...transform, worldHeight: 128 }
    const low = unit("low", 1, 0.5)
    const high = unit("high", 1, 0.5, [], 0.4)
    expect(pickBoard(96, 64, board, 64, 3, 2, [low, high], [])).toEqual({ type: "unit", unitId: "high" })
    const back = unit("back", 1, 0.7)
    const front = unit("front", 1, 0.3)
    expect(pickBoard(96, 64, board, 64, 3, 2, [back, front], [])).toEqual({ type: "unit", unitId: "front" })
  })
})
