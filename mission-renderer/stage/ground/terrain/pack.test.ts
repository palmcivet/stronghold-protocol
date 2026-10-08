import { describe, expect, it, vi } from "vitest"
import { DataTexture } from "three"
import type { AssetRef } from "arknights-assets-catalog"
import { loadTerrainPack, TERRAIN_GATE_NODES } from "./pack.js"

const diffuse = { id: "board-d", kind: "image", address: "/board/d.png", fallbackId: null } satisfies AssetRef
const gate = { id: "gate-end", kind: "model", address: "/board/end.obj", fallbackId: null } satisfies AssetRef

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

  it("drops the ground when the diffuse atlas fails", async () => {
    const release = vi.fn()
    const pack = await loadTerrainPack({
      image: async () => {
        throw new Error("missing atlas")
      },
      release,
    }, { images: { D: diffuse } })

    expect(pack).toBeNull()
    expect(release).toHaveBeenCalledWith(diffuse, "image")
  })
})
