import { describe, expect, it } from "vitest"
import { meshUvs, parseMissionAtlas } from "#actor/skeleton/index.js"

describe("skeleton mesh", () => {
  it("maps mesh coordinates onto the packed region, rotated or not", () => {
    const atlas = parseMissionAtlas(["p.png", "size: 100,100", "a", "  rotate: false", "  xy: 10, 20", "  size: 30, 40", "  orig: 30, 40", "  offset: 0, 0", "b", "  rotate: true", "  xy: 0, 0", "  size: 20, 10", "  orig: 20, 10", "  offset: 0, 0"].join("\n"))
    expect(Array.from(meshUvs([0, 0, 1, 1], atlas.findRegion("a")!)).map((value) => Math.round(value * 100) / 100)).toEqual([0.1, 0.2, 0.4, 0.6])
    expect(Array.from(meshUvs([0, 0, 1, 1], atlas.findRegion("b")!)).map((value) => Math.round(value * 100) / 100)).toEqual([0, 0.2, 0.1, 0])
  })
})
