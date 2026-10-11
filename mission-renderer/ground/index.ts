import type { Scene } from "three"
import { DoubleSide, Group, Mesh, MeshBasicMaterial, OrthographicCamera, PlaneGeometry, WebGLRenderer } from "three"
import type { TileCoord } from "arknights-mission-core"
import type { MissionCamera, MissionMap } from "#contract/view.js"
import { cellKey, classifyCells, type TerrainCells } from "#ground/cells.js"
import { createTerrainScene, type TerrainFocusRect, type TerrainScene } from "#ground/scene.js"
import { loadTerrainPack, type TerrainPack, type MissionGroundPack, type TerrainResourcePort } from "#ground/pack.js"
import type { TerrainLayout } from "#ground/layout.js"
import type { WebGLContextEvent, WebGLSurface } from "#ground/webgl.js"

export type { MissionGroundPack, TerrainResourcePort } from "#ground/pack.js"
export { MISSION_GROUND_GATE_NODES, MISSION_GROUND_IMAGE_SLOTS, MISSION_GROUND_MESH_SLOTS } from "#ground/pack.js"
export type { TerrainGateSlot, MissionGroundImageSlot, TerrainMeshSlot } from "#ground/pack.js"
export { createTerrainScene, TERRAIN_LIGHTING, gatePulse, type TerrainFocusRect, type TerrainScene } from "#ground/scene.js"

export type MissionGroundMode = "terrain" | "hidden"

/** How highlighted tiles are drawn: a flat square of `size` tiles, `lift` above the tile's surface. */
export const MISSION_GROUND_HIGHLIGHT = Object.freeze({ color: 0xffd34d, opacity: 0.35, size: 0.92, lift: 0.01 })

/** The GPU surface the terrain draws to. */
export interface TerrainRenderView {
  readonly canvas: WebGLSurface & { readonly width: number, readonly height: number }
  readonly renderer: WebGLRenderer | null
  setSize(width: number, height: number): void
  render(scene: Scene, camera: OrthographicCamera): void
  dispose(): void
}

export interface MissionGroundOptions {
  /** Whether the GPU ground may be shown. Defaults to whether a view is present. */
  readonly available?: boolean
  /** Pixels per board tile before the stage's display scale; the canvas is board-sized × display scale × pixel ratio. */
  readonly tileSize?: number
  readonly pixelRatio?: number
  readonly resources?: TerrainResourcePort
  readonly pack?: MissionGroundPack
  /** The GPU view. Null leaves the ground hidden. Undefined creates a WebGL renderer when the browser has one. */
  readonly view?: TerrainRenderView | null
  readonly onMode?: (mode: MissionGroundMode) => void
}

export interface MissionGround {
  readonly mode: MissionGroundMode
  readonly canvas: TerrainRenderView["canvas"] | null
  readonly boardWidth: number
  readonly boardHeight: number
  readonly layout: TerrainLayout | null
  /** Drawn in the ground's scene, above the board, whenever the scene is built (x = column, y = height, z = −row). */
  readonly overlay: Group
  /** The highlighted tiles drawn on the board. */
  readonly highlights: Group
  /** Height of the board's surface at a tile, in tiles. 0 off the map. */
  readonly surfaceHeight: (x: number, y: number) => number
  readonly setHighlights: (tiles: readonly TileCoord[]) => void
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
    const renderer = new WebGLRenderer({ antialias: true, alpha: true, stencil: true, depth: true })
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
export function createMissionGround(options: MissionGroundOptions = {}): MissionGround {
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
  const overlay = new Group()
  overlay.name = "overlay"
  const highlights = new Group()
  highlights.name = "highlights"
  const highlightGeometry = new PlaneGeometry(MISSION_GROUND_HIGHLIGHT.size, MISSION_GROUND_HIGHLIGHT.size).rotateX(-Math.PI / 2)
  const highlightMaterial = new MeshBasicMaterial({
    color: MISSION_GROUND_HIGHLIGHT.color,
    opacity: MISSION_GROUND_HIGHLIGHT.opacity,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  })
  let cells: TerrainCells = new Map()
  let highlighted: readonly TileCoord[] = []

  const surfaceHeight = (x: number, y: number): number => cells.get(cellKey(Math.round(x), Math.round(y)))?.height ?? 0

  const drawHighlights = (): void => {
    highlights.clear()
    for (const tile of highlighted) {
      const square = new Mesh(highlightGeometry, highlightMaterial)
      square.position.set(tile.x, surfaceHeight(tile.x, tile.y) + MISSION_GROUND_HIGHLIGHT.lift, -tile.y)
      highlights.add(square)
    }
  }

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
    sceneRef.scene.add(highlights, overlay)
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
    cells = classifyCells(nextMap)
    drawHighlights()
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
    overlay,
    highlights,
    surfaceHeight,
    setHighlights(tiles) {
      highlighted = tiles
      drawHighlights()
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
      highlights.clear()
      highlightGeometry.dispose()
      highlightMaterial.dispose()
      view?.dispose()
    },
  }
}
