import { describe, expect, it } from "vitest"
import { resolveUvTable, surfaceUV, TERRAIN_SURFACES } from "./atlas.js"

describe("terrain atlas", () => {
  it("maps a surface rectangle into texture coordinates", () => {
    const concrete = TERRAIN_SURFACES.concrete
    if (!concrete) throw new Error("missing concrete surface")

    expect(surfaceUV(concrete)).toEqual([
      258 / 2048, 1 - 766 / 2048,
      510 / 2048, 1 - 766 / 2048,
      510 / 2048, 1 - 514 / 2048,
      258 / 2048, 1 - 514 / 2048,
    ])
  })

  it("lets tiles.json replace a surface and ignores a rectangle outside the atlas", () => {
    const table = resolveUvTable({
      board3d: {
        concrete: { src: "D", rect: [0, 0, 32, 32], rot: 90, flipX: true },
        broken: { src: "D", rect: [2000, 2000, 100, 100] },
      },
    })

    expect(table.concrete).toMatchObject({ rect: [0, 0, 32, 32], rot: 90, flipX: true })
    expect(table.broken).toBeUndefined()
    expect(table.ringHatch).toEqual(TERRAIN_SURFACES.ringHatch)
  })
})
