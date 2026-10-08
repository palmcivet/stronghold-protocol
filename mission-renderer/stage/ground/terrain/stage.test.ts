import { describe, expect, it, vi } from "vitest"
import { DataTexture } from "three"
import type { AssetRef } from "arknights-assets-catalog"
import type { MissionMap } from "#contract/view.js"
import { createTerrainStage, type TerrainRenderView } from "./stage.js"
import type { WebGLContextEvent } from "./webgl.js"

const map: MissionMap = {
  cols: 3,
  rows: 3,
  tiles: [{ x: 0, y: 0, height: 0, deployable: true, walkableBy: ["ground"], objective: true }],
}

const diffuse = { id: "board-d", kind: "image", address: "/board/d.png", fallbackId: null } satisfies AssetRef

interface MockView extends TerrainRenderView {
  readonly listeners: Map<string, (event: WebGLContextEvent) => void>
}

function viewOf(): MockView {
  const listeners = new Map<string, (event: WebGLContextEvent) => void>()
  return {
    canvas: {
      width: 1,
      height: 1,
      getContext: () => ({}),
      addEventListener: (type: string, listener: (event: WebGLContextEvent) => void) => {
        listeners.set(type, listener)
      },
      removeEventListener: (type: string) => {
        listeners.delete(type)
      },
    },
    renderer: null,
    listeners,
    setSize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
  }
}

function atlas(): DataTexture {
  return new DataTexture(new Uint8Array([8, 8, 8, 255]), 1, 1)
}

describe("terrain stage", () => {
  it("shows the 3D ground once the atlas has loaded and renders it on update", async () => {
    const view = viewOf()
    const stage = createTerrainStage({
      view,
      resources: { image: async () => atlas(), release: vi.fn() },
      pack: { images: { D: diffuse } },
    })

    stage.setMap(map)
    await stage.ready
    stage.update(0)

    expect(stage.mode).toBe("terrain")
    expect(stage.canvas).toBe(view.canvas)
    expect(stage.layout).not.toBeNull()
    expect(view.render).toHaveBeenCalled()
    stage.destroy()
  })

  it("sizes the canvas with the display scale", async () => {
    const view = viewOf()
    const stage = createTerrainStage({
      view,
      resources: { image: async () => atlas(), release: vi.fn() },
      pack: { images: { D: diffuse } },
    })

    stage.setMap(map)
    await stage.ready
    stage.setDisplayScale(0.5)

    expect(view.setSize).toHaveBeenLastCalledWith(96, 96)
    stage.destroy()
  })

  it("stays hidden when there is no GPU view", async () => {
    const stage = createTerrainStage({
      view: null,
      resources: { image: async () => atlas(), release: vi.fn() },
      pack: { images: { D: diffuse } },
    })

    stage.setMap(map)
    await stage.ready
    stage.update(0)

    expect(stage.mode).toBe("hidden")
    expect(stage.canvas).toBeNull()
    stage.destroy()
  })

  it("stays hidden when the diffuse atlas fails to load", async () => {
    const release = vi.fn()
    const stage = createTerrainStage({
      view: viewOf(),
      resources: {
        image: async () => {
          throw new Error("missing atlas")
        },
        release,
      },
      pack: { images: { D: diffuse } },
    })

    stage.setMap(map)
    await stage.ready

    expect(stage.mode).toBe("hidden")
    expect(release).toHaveBeenCalledWith(diffuse, "image")
    stage.destroy()
  })

  it("hides the ground while the context is lost and rebuilds it on restore", async () => {
    const view = viewOf()
    const modes: string[] = []
    const stage = createTerrainStage({
      view,
      resources: { image: async () => atlas(), release: vi.fn() },
      pack: { images: { D: diffuse } },
      onMode: (mode) => modes.push(mode),
    })

    stage.setMap(map)
    await stage.ready
    expect(stage.mode).toBe("terrain")

    view.listeners.get("webglcontextlost")?.({ preventDefault() {} })
    expect(stage.mode).toBe("hidden")

    view.listeners.get("webglcontextrestored")?.({ preventDefault() {} })
    await stage.ready
    expect(stage.mode).toBe("terrain")
    expect(modes).toEqual(["terrain", "hidden", "terrain"])
    stage.destroy()
  })

  it("accepts a camera and a leak without a loaded scene", () => {
    const stage = createTerrainStage({ view: null })

    stage.setCamera({ x: 0, y: 0, width: 1, height: 1, margin: 0 })
    stage.flashObjective()
    stage.update(0.1)

    expect(stage.mode).toBe("hidden")
    stage.destroy()
  })
})
