import { describe, expect, it, vi } from "vitest"
import { DataTexture } from "three"
import type { AssetKey } from "arknights-assets-catalog"
import { loadTerrainPack, TERRAIN_GATE_NODES, type TerrainResourcePort } from "./pack.js"

const diffuse: AssetKey = "texture:map/autochess/TX_autochessi_D"
const gate: AssetKey = "model:map/fx/gate_end"

describe("terrain pack", () => {
  it("names the official gate nodes", () => {
    expect(TERRAIN_GATE_NODES).toMatchObject({
      startDown: "Start_down",
      startUp: "Start_up",
      startBack: "Start_back",
      endDown: "Start_down1",
      endUp: "Start_up1",
    })
  })

  it("keeps the diffuse atlas and a parsed gate mesh", async () => {
    const release = vi.fn()
    const texture = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
    const pack = await loadTerrainPack({
      image: async () => texture,
      model: async () => "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n",
      json: async () => null,
      release,
    }, {
      images: { D: diffuse },
      gates: { endDown: gate },
    })

    expect(pack?.images.D).toBe(texture)
    expect(pack?.gates.endDown).toBeTruthy()
    pack?.release()
    expect(release).toHaveBeenCalledWith(diffuse, "image")
    expect(release).toHaveBeenCalledWith(gate, "model")
  })

  it("loads the prefab and tile tables as json and resolves gate pieces by prefab name", async () => {
    const requested: { key: AssetKey, kind: string }[] = []
    const port: TerrainResourcePort = {
      image: async (key) => {
        requested.push({ key, kind: "image" })
        return new DataTexture(new Uint8Array([8, 8, 8, 255]), 1, 1)
      },
      model: async (key) => {
        requested.push({ key, kind: "model" })
        return "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"
      },
      json: async (key) => {
        requested.push({ key, kind: "json" })
        return key === "json:map/fx/prefab" ? [{ name: "Start_down1", mesh: "gate_end" }] : null
      },
      release: vi.fn(),
    }
    const pack = await loadTerrainPack(port, {
      images: { D: diffuse },
      gatePrefab: "json:map/fx/prefab",
      resolveMesh: (name) => (name === "gate_end" ? gate : null),
      tiles: "json:map/autochess/tiles",
    })

    expect(pack?.gates.endDown).toBeTruthy()
    expect(requested).toContainEqual({ key: "json:map/fx/prefab", kind: "json" })
    expect(requested).toContainEqual({ key: "json:map/autochess/tiles", kind: "json" })
    expect(requested).toContainEqual({ key: gate, kind: "model" })
  })

  it("drops the ground when the diffuse atlas fails", async () => {
    const release = vi.fn()
    const pack = await loadTerrainPack({
      image: async () => {
        throw new Error("missing atlas")
      },
      model: async () => null,
      json: async () => null,
      release,
    }, { images: { D: diffuse } })

    expect(pack).toBeNull()
    expect(release).toHaveBeenCalledWith(diffuse, "image")
  })
})
