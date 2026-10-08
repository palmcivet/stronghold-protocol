import { describe, expect, it } from "vitest"
import type { MissionMap } from "#contract/view.js"
import { cellKey, classifyCells, glyphOf, type BoardTile } from "./cells.js"

const tile = { height: 0, deployable: true, walkableBy: ["ground"] }

function mapOf(tiles: readonly BoardTile[], cols: number): MissionMap {
  return { cols, rows: 1, tiles }
}

describe("terrain cells", () => {
  it("reads the glyph a tile carries, or infers one from its device and height", () => {
    expect(glyphOf({ x: 0, y: 0, ...tile, glyph: "R" })).toBe("R")
    expect(glyphOf({ x: 0, y: 0, ...tile, device: "barrier" })).toBe("X")
    expect(glyphOf({ x: 0, y: 0, ...tile, objective: true })).toBe("E")
    expect(glyphOf({ x: 0, y: 0, ...tile, height: 1 })).toBe("h")
    expect(glyphOf({ x: 0, y: 0, ...tile, deployable: false, walkableBy: [] })).toBe("#")
    expect(glyphOf({ x: 0, y: 0, ...tile })).toBe("r")
  })

  it("builds a non-content tile only when it touches content", () => {
    const cells = classifyCells(mapOf([
      { x: 0, y: 0, ...tile, glyph: "X" },
      { x: 1, y: 0, ...tile, glyph: "X" },
      { x: 2, y: 0, ...tile, glyph: "r" },
    ], 3))

    expect(cells.get(cellKey(0, 0))?.drawn).toBe(false)
    expect(cells.get(cellKey(1, 0))?.drawn).toBe(true)
    expect(cells.get(cellKey(2, 0))?.drawn).toBe(true)
  })

  it("raises a high-ground tile to the wall height and joins it to raised neighbours", () => {
    const cells = classifyCells(mapOf([
      { x: 0, y: 0, ...tile, glyph: "h" },
      { x: 1, y: 0, ...tile, glyph: "h" },
    ], 2))

    expect(cells.get(cellKey(0, 0))?.height).toBe(0.42)
    expect(cells.get(cellKey(0, 0))?.surface).toBe("plateL")
    expect(cells.get(cellKey(1, 0))?.surface).toBe("plateR")
  })
})
