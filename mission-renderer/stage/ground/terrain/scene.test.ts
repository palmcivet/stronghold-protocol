import { describe, expect, it } from "vitest"
import { DataTexture } from "three"
import type { MissionMap } from "#contract/view.js"
import { resolveUvTable } from "./atlas.js"
import type { BoardTile } from "./cells.js"
import { createTerrainScene, gatePulse } from "./scene.js"
import type { TerrainPack } from "./pack.js"

function texture(): DataTexture {
  return new DataTexture(new Uint8Array([8, 8, 8, 255]), 1, 1)
}

function pack(): TerrainPack {
  return {
    images: { D: texture() },
    meshes: {},
    gates: {},
    uv: resolveUvTable(null),
    release() {},
  }
}

const styledTiles: readonly BoardTile[] = [
  { x: 0, y: 0, height: 0, deployable: true, walkableBy: ["ground"], device: "blower" },
  { x: 1, y: 1, height: 0, deployable: true, walkableBy: ["ground"], objective: true },
  { x: 2, y: 2, height: 0, deployable: false, walkableBy: ["ground"], glyph: "d" },
]

const map: MissionMap = { cols: 3, rows: 3, tiles: styledTiles }

describe("terrain scene", () => {
  it("frames the whole map from above with the board's rows pointing up the screen", () => {
    const scene = createTerrainScene({ map, pack: pack() })

    expect(scene.camera.left).toBe(-1.5)
    expect(scene.camera.right).toBe(1.5)
    expect(scene.camera.top).toBe(1.5)
    expect(scene.camera.bottom).toBe(-1.5)
    expect(scene.camera.position.x).toBe(1)
    expect(scene.camera.position.z).toBe(-1)
    scene.destroy()
  })

  it("builds the board, shadow catcher, blower and the water overlay", () => {
    const scene = createTerrainScene({ map, pack: pack() })

    expect(scene.ground.getObjectByName("terrain-ground")).toBeTruthy()
    expect(scene.ground.getObjectByName("terrain-shadow")).toBeTruthy()
    expect(scene.ground.getObjectByName("terrain-blower")).toBeTruthy()
    expect(scene.ground.getObjectByName("terrain-water")).toBeTruthy()
    scene.destroy()
  })

  it("eases the lit field towards the requested rectangle in scene space", () => {
    const scene = createTerrainScene({ map, pack: pack() })

    scene.setFocus({ x: 0, y: 0, width: 1, height: 1 })
    for (let step = 0; step < 60; step += 1) scene.update(0.1)

    expect(scene.litField.x).toBeCloseTo(-0.5, 4)
    expect(scene.litField.y).toBeCloseTo(-0.5, 4)
    expect(scene.litField.z).toBeCloseTo(0.5, 4)
    expect(scene.litField.w).toBeCloseTo(0.5, 4)
    scene.destroy()
  })

  it("keeps the gate pulse inside its curve", () => {
    expect(gatePulse(0)).toBeCloseTo(0.134)
    expect(gatePulse(1)).toBeCloseTo(0.229)
  })
})
