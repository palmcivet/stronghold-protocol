import type { BattleEvent, BattleSnapshot, TileCoord, UnitSnapshot } from "arknights-mission-core"
import type {
  MissionCamera,
  MissionMap,
  MissionPointerEvent,
  MissionPointerHit,
  MissionStage,
  MissionStageCommand,
  MissionUpdateMode,
  MissionView,
} from "#contract/view.js"
import type { MissionAudioCue } from "#contract/audio.js"
import type { MissionAppearances } from "#contract/appearance.js"
import { createActorWorld, type ActorFrame, type MissionActorWorld, type MissionActorWorldOptions } from "#actor/entity/index.js"
import { createHudLayer, type MissionHudLayer } from "#actor/hud/index.js"
import { createViewLoop, type ViewSystem } from "#runtime/stage/loop.js"
import { effectCueFor } from "#audio/index.js"
import { createMissionFeed, type MissionFeed } from "#runtime/feed/index.js"
import { createMissionGround } from "#ground/index.js"
import type { MissionGroundMode, MissionGround, MissionGroundOptions } from "#ground/index.js"
import { pickBoard } from "#pointer/index.js"
import { calculateBoardTransform, type MissionBoardTransform } from "#runtime/camera/index.js"

export type { MissionGroundPack, TerrainResourcePort, MissionGround, MissionGroundOptions } from "#ground/index.js"
export { MISSION_GROUND_GATE_NODES, MISSION_GROUND_IMAGE_SLOTS, MISSION_GROUND_MESH_SLOTS } from "#ground/index.js"

export type MissionBoard = MissionStage & {
  readonly terrain: MissionGround | null
  readonly canvas: MissionGround["canvas"]
  readonly actors: MissionActorWorld
  readonly hud: MissionHudLayer
}

export interface MissionStageOptions {
  readonly onAudioCue?: (cue: MissionAudioCue) => void
  readonly onPointer?: (event: MissionPointerEvent) => void
  readonly terrain?: MissionGroundOptions
  /** Skeleton runtime and resources the actors draw their models with. Without them actors carry no model. */
  readonly actors?: MissionActorWorldOptions
}

interface StageState {
  map: MissionMap | null
  camera: MissionCamera | null
  snapshot: BattleSnapshot | null
  units: readonly UnitSnapshot[]
  events: readonly BattleEvent[]
  highlightedTiles: readonly TileCoord[]
  updateMode: MissionUpdateMode
  speed: number
  appearances: MissionAppearances
}

/** The frame the view systems share; `ingest` fills it from the feed or the pushed events. */
interface StageFrame {
  deltaSeconds: number
  events: readonly BattleEvent[]
  units: readonly UnitSnapshot[]
  moving: ReadonlySet<string>
}

const TILE_SIZE = 64
const DEFAULT_SPEED = 2

function clampSpeed(speed: number): number {
  return Number.isFinite(speed) ? Math.min(20, Math.max(0.05, speed)) : DEFAULT_SPEED
}
const EVENT_LIMIT = 100

const IDENTITY: MissionBoardTransform = {
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
    speed: DEFAULT_SPEED,
    appearances: {},
  }
  let feed: MissionFeed | null = null
  let viewportWidth = 0
  let viewportHeight = 0
  let transform: MissionBoardTransform | null = null
  let shown: HTMLElement | null = null
  let terrain: MissionGround | null = null

  const view = (): MissionView => ({
    map: state.map,
    camera: state.camera,
    snapshot: state.snapshot,
    units: state.units,
    events: state.events,
    highlightedTiles: state.highlightedTiles,
    updateMode: state.updateMode,
    speed: state.speed,
    appearances: state.appearances,
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
    ? createMissionGround({
        ...options.terrain,
        tileSize: TILE_SIZE,
        onMode: (mode: MissionGroundMode) => {
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

  const actors = createActorWorld({ ...options.actors, ...(terrain ? { surface: terrain.surfaceHeight } : {}) })
  const hud = createHudLayer(actors)
  terrain?.overlay.add(actors.layer, hud.layer)
  /** Events pushed in external mode, waiting for the next frame. */
  let arrived: BattleEvent[] = []
  let moving: ReadonlySet<string> = new Set()

  const ingest: ViewSystem<StageFrame> = {
    id: "ingest",
    run(frame) {
      let events: readonly BattleEvent[]
      if (feed) {
        feed.advance(frame.deltaSeconds)
        const sample = feed.sample()
        if (sample) {
          state.units = sample.units
          moving = sample.moving
        }
        events = feed.takeEvents()
      } else {
        events = arrived
        arrived = []
        moving = new Set()
      }
      if (events.length > 0) state.events = [...state.events, ...events].slice(-EVENT_LIMIT)
      frame.events = events
      frame.units = state.units
      frame.moving = moving
    },
  }

  const audio: ViewSystem<ActorFrame> = {
    id: "audio",
    run(frame) {
      for (const event of frame.events) {
        const cue = effectCueFor(event, frame.units)
        if (cue) options.onAudioCue?.(cue)
        if (event.type === "leak") terrain?.flashObjective()
      }
    },
  }

  const loop = createViewLoop<StageFrame>([
    ingest,
    ...actors.systems,
    hud.system,
    audio,
  ])

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
        terrain?.setHighlights(command.tiles)
        break
      case "set-update-mode":
        state.updateMode = command.mode
        if (command.speed !== undefined) state.speed = clampSpeed(command.speed)
        if (command.mode === "local") {
          if (feed) {
            feed.configure({ speed: state.speed, delay: command.delay })
            break
          }
          feed = createMissionFeed({ speed: state.speed, delay: command.delay })
          if (state.snapshot) feed.push(state.snapshot)
          for (const event of arrived) feed.pushEvent(event)
          arrived = []
          break
        }
        if (feed) {
          arrived.push(...feed.pendingEvents())
          if (state.snapshot) state.units = state.snapshot.units
          feed = null
        }
        break
      case "set-speed":
        state.speed = clampSpeed(command.speed)
        feed?.configure({ speed: state.speed })
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
        if (feed) feed.pushEvent(command.event)
        else arrived.push(command.event)
        break
      case "set-appearances":
        state.appearances = { ...state.appearances, ...command.appearances }
        actors.setAppearances(command.appearances)
        break
      case "reset":
        feed?.reset()
        state.snapshot = null
        state.units = []
        state.events = []
        state.highlightedTiles = []
        terrain?.setHighlights([])
        state.updateMode = "external"
        state.appearances = {}
        feed = null
        arrived = []
        actors.clear()
        hud.clear()
        break
    }
  }

  if (initialMap) renderMap(initialMap)

  const board: MissionBoard = {
    terrain,
    get canvas() {
      return terrain?.canvas ?? null
    },
    get view() {
      return view()
    },
    dispatch,
    actors,
    hud,
    update(deltaSeconds) {
      loop.run({ deltaSeconds, events: [], units: state.units, moving })
      terrain?.update(deltaSeconds)
      placeCanvas()
    },
    pointer(phase, screenX, screenY) {
      const event: MissionPointerEvent = { phase, screenX, screenY, hit: board.pick(screenX, screenY) }
      options.onPointer?.(event)
      return event
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
      actors.clear()
      hud.clear()
      terrain?.destroy()
    },
  }
  return board
}

function canvasElement(value: object | null | undefined): HTMLElement | null {
  if (!value || !("style" in value)) return null
  const style = (value as { style?: CSSStyleDeclaration | null }).style
  if (!style) return null
  return value as HTMLElement
}
