import type { Scene } from "three"
import { OrthographicCamera, WebGLRenderer } from "three"
import type { MissionCamera, MissionMap } from "#contract/view.js"
import { createTerrainScene, type TerrainFocusRect, type TerrainScene } from "./scene.js"
import { loadTerrainPack, type TerrainPack, type TerrainPackPort, type TerrainPackRequest } from "./pack.js"
import type { TerrainLayout } from "./layout.js"
import type { WebGLContextEvent, WebGLSurface } from "./webgl.js"

export type { TerrainPackPort, TerrainPackRequest } from "./pack.js"
export { TERRAIN_GATE_NODES, TERRAIN_IMAGE_SLOTS, TERRAIN_MESH_SLOTS } from "./pack.js"
export type { TerrainGateSlot, TerrainImageSlot, TerrainMeshSlot } from "./pack.js"
export { createTerrainScene, TERRAIN_LIGHTING, gatePulse, type TerrainFocusRect, type TerrainScene } from "./scene.js"

export type TerrainMode = "terrain" | "hidden"

/** The GPU surface the terrain draws to. */
export interface TerrainRenderView {
  readonly canvas: WebGLSurface & { readonly width: number, readonly height: number }
  readonly renderer: WebGLRenderer | null
  setSize(width: number, height: number): void
  render(scene: Scene, camera: OrthographicCamera): void
  dispose(): void
}

export interface TerrainStageOptions {
  /** Whether the GPU ground may be shown. Defaults to whether a view is present. */
  readonly available?: boolean
  /** Pixels per board tile before the stage's display scale; the canvas is board-sized × display scale × pixel ratio. */
  readonly tileSize?: number
  readonly pixelRatio?: number
  readonly resources?: TerrainPackPort
  readonly pack?: TerrainPackRequest
  /** The GPU view. Null leaves the ground hidden. Undefined creates a WebGL renderer when the browser has one. */
  readonly view?: TerrainRenderView | null
  readonly onMode?: (mode: TerrainMode) => void
}

export interface TerrainStage {
  readonly mode: TerrainMode
  readonly canvas: TerrainRenderView["canvas"] | null
  readonly boardWidth: number
  readonly boardHeight: number
  readonly layout: TerrainLayout | null
  readonly ready: Promise<void>
  readonly setMap: (map: MissionMap) => void
  readonly setCamera: (camera: MissionCamera | null) => void
  readonly setDisplayScale: (scale: number) => void
  readonly setAvailable: (available: boolean) => void
  readonly flashObjective: () => void
  readonly update: (deltaSeconds: number) => void
  readonly destroy: () => void
}

function createWebGLView(pixelRatio: number): TerrainRenderView | null {
  try {
    const renderer = new WebGLRenderer({ antialias: true, alpha: true, stencil: false, depth: true })
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(1)
    const canvas = renderer.domElement as unknown as TerrainRenderView["canvas"]
    return {
      canvas,
      renderer,
      setSize(width, height) {
        renderer.setSize(Math.max(1, Math.floor(width * pixelRatio)), Math.max(1, Math.floor(height * pixelRatio)), false)
      },
      render(scene, camera) {
        renderer.render(scene, camera)
      },
      dispose() {
        renderer.dispose()
        renderer.forceContextLoss()
      },
    }
  } catch {
    return null
  }
}

function focusOf(camera: MissionCamera | null): TerrainFocusRect | null {
  if (!camera) return null
  return { x: camera.x, y: camera.y, width: camera.width, height: camera.height }
}

/**
 * The 3D ground of a map. It is shown once its atlas has loaded. The ground stays hidden when there is no GPU view,
 * when the pack is missing or fails to load, and while the WebGL context is lost; the scene is rebuilt when the
 * context returns. Units and the battle state are never touched here.
 */
export function createTerrainStage(options: TerrainStageOptions = {}): TerrainStage {
  const tileSize = options.tileSize ?? 64
  const pixelRatio = options.pixelRatio ?? 1
  const view = options.view === undefined ? createWebGLView(pixelRatio) : options.view
  let enabled = options.available ?? view !== null
  let map: MissionMap | null = null
  let sceneRef: TerrainScene | null = null
  let pack: TerrainPack | null = null
  let focus: TerrainFocusRect | null = null
  let displayScale = 1
  let generation = 0
  let presented = false
  let ready = Promise.resolve()

  const publish = (): void => {
    const next = enabled && sceneRef !== null && view !== null
    if (next === presented) return
    presented = next
    options.onMode?.(presented ? "terrain" : "hidden")
  }

  const resizeView = (): void => {
    if (!map || !view) return
    view.setSize(map.cols * tileSize * displayScale, map.rows * tileSize * displayScale)
  }

  const clearGround = (): void => {
    generation += 1
    sceneRef?.destroy()
    sceneRef = null
    pack?.release()
    pack = null
    publish()
  }

  const buildScene = (nextMap: MissionMap, loaded: TerrainPack): void => {
    sceneRef = createTerrainScene({ map: nextMap, pack: loaded, renderer: view?.renderer ?? null })
    sceneRef.setFocus(focus)
    resizeView()
  }

  const load = async (nextMap: MissionMap, currentGeneration: number): Promise<void> => {
    if (!options.pack || !options.resources) return
    const loaded = await loadTerrainPack(options.resources, options.pack)
    if (currentGeneration !== generation) {
      loaded?.release()
      return
    }
    pack = loaded
    if (loaded) buildScene(nextMap, loaded)
    publish()
  }

  const setMap = (nextMap: MissionMap): void => {
    clearGround()
    map = nextMap
    resizeView()
    ready = load(nextMap, generation)
  }

  const onContextLost = (event: WebGLContextEvent): void => {
    event.preventDefault()
    enabled = false
    publish()
  }

  const onContextRestored = (): void => {
    enabled = true
    if (map) setMap(map)
  }

  view?.canvas.addEventListener("webglcontextlost", onContextLost)
  view?.canvas.addEventListener("webglcontextrestored", onContextRestored)

  return {
    get mode() {
      return presented ? "terrain" : "hidden"
    },
    get canvas() {
      return presented && view ? view.canvas : null
    },
    get boardWidth() {
      return (map?.cols ?? 0) * tileSize
    },
    get boardHeight() {
      return (map?.rows ?? 0) * tileSize
    },
    get layout() {
      return sceneRef?.layout ?? null
    },
    get ready() {
      return ready
    },
    setMap,
    setCamera(camera) {
      focus = focusOf(camera)
      sceneRef?.setFocus(focus)
    },
    setDisplayScale(scale) {
      if (!(scale > 0)) return
      displayScale = scale
      resizeView()
    },
    setAvailable(available) {
      enabled = available
      publish()
    },
    flashObjective() {
      sceneRef?.flashObjective()
    },
    update(deltaSeconds) {
      if (!sceneRef) return
      sceneRef.update(deltaSeconds)
      if (presented && view) view.render(sceneRef.scene, sceneRef.camera)
    },
    destroy() {
      view?.canvas.removeEventListener("webglcontextlost", onContextLost)
      view?.canvas.removeEventListener("webglcontextrestored", onContextRestored)
      clearGround()
      view?.dispose()
    },
  }
}
