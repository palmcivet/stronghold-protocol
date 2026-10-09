import type { BattleEvent, BattleSnapshot, TileCoord, UnitSnapshot } from "arknights-mission-core"
import type {
  MissionCamera,
  MissionMap,
  MissionPointerHit,
  MissionStage,
  MissionStageCommand,
  MissionUpdateMode,
  MissionView,
} from "#contract/view.js"
import type { MissionAudioCue } from "#contract/event.js"
import { effectCueFor } from "./cue.js"
import { createLocalFeed, type LocalFeed } from "./feed.js"
import { createTerrainStage } from "./ground/terrain/stage.js"
import type { TerrainMode, TerrainStage, TerrainStageOptions } from "./ground/terrain/stage.js"
import { pickBoard } from "./pointer.js"
import { calculateBoardTransform, type BoardTransform } from "./projection.js"

export type { TerrainPackRequest, TerrainResourcePort, TerrainStage, TerrainStageOptions } from "./ground/terrain/stage.js"
export { TERRAIN_GATE_NODES, TERRAIN_IMAGE_SLOTS, TERRAIN_MESH_SLOTS } from "./ground/terrain/stage.js"

export type MissionBoard = MissionStage & {
  readonly terrain: TerrainStage | null
  readonly canvas: TerrainStage["canvas"]
}

export interface MissionStageOptions {
  readonly onAudioCue?: (cue: MissionAudioCue) => void
  readonly terrain?: TerrainStageOptions
}

interface StageState {
  map: MissionMap | null
  camera: MissionCamera | null
  snapshot: BattleSnapshot | null
  units: readonly UnitSnapshot[]
  events: readonly BattleEvent[]
  highlightedTiles: readonly TileCoord[]
  updateMode: MissionUpdateMode
}

const TILE_SIZE = 64
const EVENT_LIMIT = 100

const IDENTITY: BoardTransform = {
  x: 0,
  y: 0,
  scale: 1,
  worldX: 0,
  worldY: 0,
  worldWidth: 0,
  worldHeight: 0,
}

export function createMissionStage(
  initialMap: MissionMap | null = null,
  options: MissionStageOptions = {},
): MissionBoard {
  const state: StageState = {
    map: null,
    camera: null,
    snapshot: null,
    units: [],
    events: [],
    highlightedTiles: [],
    updateMode: "external",
  }
  let feed: LocalFeed | null = null
  let viewportWidth = 0
  let viewportHeight = 0
  let transform: BoardTransform | null = null
  let shown: HTMLElement | null = null
  let terrain: TerrainStage | null = null

  const view = (): MissionView => ({
    map: state.map,
    camera: state.camera,
    snapshot: state.snapshot,
    units: state.units,
    events: state.events,
    highlightedTiles: state.highlightedTiles,
    updateMode: state.updateMode,
  })

  const placeCanvas = (): void => {
    const next = canvasElement(terrain?.canvas)
    if (next) shown = next
    if (!shown) return
    const visible = terrain?.mode === "terrain" && next !== null
    shown.style.visibility = visible ? "visible" : "hidden"
    if (!visible || !transform || !terrain) return
    shown.style.position = "absolute"
    shown.style.left = `${transform.x}px`
    shown.style.top = `${transform.y}px`
    shown.style.width = `${terrain.boardWidth * transform.scale}px`
    shown.style.height = `${terrain.boardHeight * transform.scale}px`
  }

  terrain = options.terrain
    ? createTerrainStage({
        ...options.terrain,
        tileSize: TILE_SIZE,
        onMode: (mode: TerrainMode) => {
          options.terrain?.onMode?.(mode)
          placeCanvas()
        },
      })
    : null

  const fitViewport = (): void => {
    if (!state.map || viewportWidth <= 0 || viewportHeight <= 0) return
    const next = calculateBoardTransform(
      state.map.cols,
      state.map.rows,
      state.camera,
      TILE_SIZE,
      viewportWidth,
      viewportHeight,
    )
    if (!next) return
    transform = next
    terrain?.setDisplayScale(next.scale)
    placeCanvas()
  }

  const releaseEvent = (event: BattleEvent): void => {
    state.events = [...state.events, event].slice(-EVENT_LIMIT)
    const cue = effectCueFor(event, state.units)
    if (cue) options.onAudioCue?.(cue)
    if (event.type === "leak") terrain?.flashObjective()
  }

  const renderMap = (map: MissionMap): void => {
    state.map = map
    terrain?.setMap(map)
    terrain?.setCamera(state.camera)
    fitViewport()
  }

  const dispatch = (command: MissionStageCommand): void => {
    switch (command.type) {
      case "set-map":
        renderMap(command.map)
        break
      case "set-camera":
        state.camera = command.camera
        terrain?.setCamera(command.camera)
        fitViewport()
        break
      case "set-highlights":
        state.highlightedTiles = command.tiles
        break
      case "set-update-mode":
        state.updateMode = command.mode
        feed = command.mode === "local"
          ? createLocalFeed({ speed: command.speed, delay: command.delay })
          : null
        break
      case "push-snapshot":
        state.snapshot = command.snapshot
        if (feed) {
          feed.push(command.snapshot)
          break
        }
        state.units = command.snapshot.units
        break
      case "push-event":
        if (feed) {
          feed.pushEvent(command.event)
          break
        }
        releaseEvent(command.event)
        break
      case "reset":
        feed?.reset()
        state.snapshot = null
        state.units = []
        state.events = []
        state.highlightedTiles = []
        state.updateMode = "external"
        feed = null
        break
    }
  }

  if (initialMap) renderMap(initialMap)

  return {
    terrain,
    get canvas() {
      return terrain?.canvas ?? null
    },
    get view() {
      return view()
    },
    dispatch,
    update(deltaSeconds) {
      if (feed) {
        feed.advance(deltaSeconds)
        const sample = feed.sample()
        if (sample) state.units = sample.units
        for (const event of feed.takeEvents()) releaseEvent(event)
      }
      terrain?.update(deltaSeconds)
      placeCanvas()
    },
    pick(screenX, screenY): MissionPointerHit {
      if (!state.map) return { type: "empty" }
      return pickBoard(
        screenX,
        screenY,
        transform ?? { ...IDENTITY, worldWidth: state.map.cols * TILE_SIZE, worldHeight: state.map.rows * TILE_SIZE },
        TILE_SIZE,
        state.map.cols,
        state.map.rows,
        state.units,
        state.map.tiles,
      )
    },
    resize(width, height) {
      viewportWidth = width
      viewportHeight = height
      fitViewport()
    },
    destroy() {
      terrain?.destroy()
    },
  }
}

function canvasElement(value: object | null | undefined): HTMLElement | null {
  if (!value || !("style" in value)) return null
  const style = (value as { style?: CSSStyleDeclaration | null }).style
  if (!style) return null
  return value as HTMLElement
}
