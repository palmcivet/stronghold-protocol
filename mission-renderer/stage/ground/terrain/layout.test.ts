import { describe, expect, it } from "vitest"
import type { MissionMap } from "#contract/view.js"
import { resolveUvTable } from "./atlas.js"
import type { BoardTile } from "./cells.js"
import { buildTerrainLayout, overlayQuads } from "./layout.js"

const uv = resolveUvTable(null)

function map(tiles: readonly BoardTile[], cols = 3, rows = 3): MissionMap {
  return { cols, rows, tiles }
}

describe("terrain layout", () => {
  it("builds the end gate and the bounds of an objective tile", () => {
    const layout = buildTerrainLayout(map([
      { x: 0, y: 0, height: 0, deployable: true, walkableBy: ["ground"], objective: true },
    ], 1, 1), uv)

    expect(layout.gates).toEqual([{ kind: "end", x: 0, y: 0, z: 0 }])
    expect(layout.bounds).toEqual({ x0: -0.5, x1: 0.5, y0: -0.5, y1: 0.5 })
    expect(layout.buckets.board.index.length).toBeGreaterThan(0)
    expect(layout.buckets.board.position.length).toBe(layout.buckets.board.normal.length)
  })

  it("lists deep-sea, mire, infection and grille tiles for the overlays", () => {
    const layout = buildTerrainLayout(map([
      { x: 0, y: 0, height: 0, deployable: false, walkableBy: ["ground"], glyph: "d" },
      { x: 1, y: 0, height: 0, deployable: true, walkableBy: ["ground"], glyph: "m" },
      { x: 2, y: 0, height: 0, deployable: true, walkableBy: ["ground"], glyph: "i" },
      { x: 2, y: 1, height: 0, deployable: true, walkableBy: ["ground"], glyph: "g" },
    ]), uv)

    expect(layout.water).toEqual([{ x: 0, y: 0 }])
    expect(layout.mire).toEqual([{ x: 1, y: 0 }])
    expect(layout.infection).toEqual([{ x: 2, y: 0 }])
    expect(layout.smog).toEqual([{ x: 2, y: 1 }])
  })

  it("marks the boundary of the play area for the field border", () => {
    const layout = buildTerrainLayout(map([
      { x: 1, y: 1, height: 0, deployable: true, walkableBy: ["ground"] },
    ]), uv)

    expect(layout.edges.map((edge) => edge.direction).sort()).toEqual(["E", "N", "S", "W"])
  })

  it("places a platform device as a slab and a blower as a device record", () => {
    const layout = buildTerrainLayout(map([
      { x: 0, y: 0, height: 0, deployable: true, walkableBy: ["ground"], device: "platform" },
      { x: 1, y: 0, height: 0, deployable: true, walkableBy: ["ground"], device: "blower" },
    ]), uv)

    expect(layout.devices).toEqual([{ kind: "blower", x: 1, y: 0, z: 0, direction: "UP" }])
    expect(layout.buckets.board.position.length).toBeGreaterThan(0)
  })
})

describe("overlay quads", () => {
  it("builds one quad per point at the given height", () => {
    const quads = overlayQuads([{ x: 2, y: 3 }], 0.5)

    expect(quads.index.length).toBe(6)
    expect(quads.position[2]).toBe(0.5)
    expect(quads.position[5]).toBe(0.5)
  })
})
