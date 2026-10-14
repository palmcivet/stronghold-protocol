import {
  type BattleEvent,
  type BattleSnapshot,
  BLOWER,
  type TileCoord,
  type UnitSnapshot,
} from 'arknights-mission-core';
import {
  type ActorFrame,
  createActorWorld,
  type MissionActorWorld,
  type MissionActorWorldOptions,
} from '#actor/entity/index.js';
import { createHudLayer, type MissionHudLayer } from '#actor/hud/index.js';
import type { MissionHudReaderTable } from '#actor/hud/readout.js';
import type { MissionHudStyle } from '#actor/hud/style.js';
import type { MissionActorImpostor } from '#actor/impostor/actor.js';
import {
  createMissionImpostorAtlas,
  type MissionImpostorAtlas,
  type MissionImpostorAtlasOptions,
} from '#actor/impostor/index.js';
import { createSkillCueHold, effectCueFor } from '#audio/index.js';
import type { MissionAppearances } from '#contract/appearance.js';
import type { MissionAudioCue } from '#contract/audio.js';
import type {
  MissionCamera,
  MissionMap,
  MissionPointerEvent,
  MissionPointerHit,
  MissionStage,
  MissionStageCommand,
  MissionTileRect,
  MissionUpdateMode,
  MissionView,
} from '#contract/view.js';
import {
  createMissionCueBindings,
  type MissionCueBindings,
} from '#effect/binding.js';
import { createEffectLayer, type MissionEffectLayer } from '#effect/layer.js';
import {
  createMissionEffectTable,
  type MissionEffectTable,
} from '#effect/table.js';
import type {
  MissionGround,
  MissionGroundMode,
  MissionGroundOptions,
} from '#ground/index.js';
import {
  createMissionGround,
  type MissionBlowerFacing,
} from '#ground/index.js';
import { TILE_SIZE } from '#ground/tile.js';
import { pickBoard } from '#pointer/index.js';
import {
  calculateBoardTransform,
  type MissionBoardTransform,
} from '#runtime/camera/index.js';
import { frameProjection } from '#runtime/camera/projection.js';
import { createCullSystem } from '#runtime/cull/index.js';
import { createMissionFeed, type MissionFeed } from '#runtime/feed/index.js';
import { createViewLoop, type ViewSystem } from '#runtime/stage/loop.js';

export type {
  MissionGround,
  MissionGroundOptions,
  MissionGroundPack,
  TerrainResourcePort,
} from '#ground/index.js';
export {
  MISSION_GROUND_GATE_NODES,
  MISSION_GROUND_IMAGE_SLOTS,
  MISSION_GROUND_MESH_SLOTS,
} from '#ground/index.js';

export type MissionBoard = MissionStage & {
  readonly terrain: MissionGround | null;
  readonly canvas: MissionGround['canvas'];
  readonly actors: MissionActorWorld;
  readonly hud: MissionHudLayer;
  readonly effects: MissionEffectLayer;
  /**
   * Hot-update the actors' skeleton runtime and resource port after the stage was created without them
   * (late asset load). Appearances already dispatched will load models on the next bind.
   */
  readonly configureActors: (
    next: Pick<MissionActorWorldOptions, 'skeleton' | 'resources'>,
  ) => void;
};

export interface MissionStageOptions {
  readonly onAudioCue?: (cue: MissionAudioCue) => void;
  readonly onPointer?: (event: MissionPointerEvent) => void;
  readonly terrain?: MissionGroundOptions;
  /** Skeleton runtime and resources the actors draw their models with. Without them actors carry no model. */
  readonly actors?: MissionActorWorldOptions;
  /** Effect kinds the cues start. Defaults to a table of the engine's kinds. Sealed by the stage. */
  readonly effects?: MissionEffectTable;
  /** What each cue key draws and plays. Defaults to the core event bindings. Sealed by the stage. */
  readonly cues?: MissionCueBindings;
  /** Called once per key when an event arrives whose cue key is neither bound nor declared; it draws and plays nothing. */
  readonly onUnboundCue?: (key: string) => void;
  /** Readers of the pips and negative health pool on the bars. Sealed by the stage. */
  readonly hud?: MissionHudReaderTable;
  /** Status icons, rank frames and textures of the bars and redeploy rings. */
  readonly hudStyle?: MissionHudStyle;
  /**
   * Draws the actors' skeletons through an impostor atlas on the ground's renderer, flushed before each ground frame.
   * Without a WebGL ground every skeleton draws directly.
   */
  readonly impostor?: MissionStageImpostorOptions;
}

/** The atlas the stage builds for the actors' impostors, and how often they redraw. */
export type MissionStageImpostorOptions = Omit<
  MissionImpostorAtlasOptions,
  'renderer'
> &
  Omit<MissionActorImpostor, 'atlas'>;

interface StageState {
  map: MissionMap | null;
  camera: MissionCamera | null;
  snapshot: BattleSnapshot | null;
  units: readonly UnitSnapshot[];
  events: readonly BattleEvent[];
  highlightedTiles: readonly TileCoord[];
  updateMode: MissionUpdateMode;
  speed: number;
  appearances: MissionAppearances;
}

/** The frame the view systems share; `ingest` fills it from the feed or the pushed events. */
interface StageFrame {
  deltaSeconds: number;
  events: readonly BattleEvent[];
  units: readonly UnitSnapshot[];
  moving: ReadonlySet<string>;
  speed: number;
  field: MissionTileRect | null;
}

const DEFAULT_SPEED = 2;

function clampSpeed(speed: number): number {
  return Number.isFinite(speed)
    ? Math.min(20, Math.max(0.05, speed))
    : DEFAULT_SPEED;
}
const EVENT_LIMIT = 100;

const IDENTITY: MissionBoardTransform = {
  x: 0,
  y: 0,
  scale: 1,
  worldX: 0,
  worldY: 0,
  worldWidth: 0,
  worldHeight: 0,
};

/**
 * Creates a stage. Seals the effect table, the cue bindings and the HUD readers it is given, and throws when a binding
 * names an effect kind that is missing or does not accept its key.
 */
/** Tiles and facings of the snapshot's blower units, which the ground's wind devices follow. */
export function blowerFacings(
  snapshot: BattleSnapshot,
): readonly MissionBlowerFacing[] {
  return snapshot.units
    .filter((unit) => unit.tags.includes(BLOWER.id))
    .map((unit) => ({
      // Adding 0 turns a rounded −0 into 0.
      x: Math.round(unit.x) + 0,
      y: Math.round(unit.y) + 0,
      facing: unit.facing,
    }));
}

/** Tiles of the snapshot's device units, where the ground keeps its crates. */
/** The playing field in tiles: the camera's rectangle, or the whole map without one; null without a map. */
export function fieldOf(
  map: MissionMap | null,
  camera: MissionCamera | null,
): MissionTileRect | null {
  if (!map) {
    return null;
  }
  return camera
    ? { x: camera.x, y: camera.y, width: camera.width, height: camera.height }
    : { x: 0, y: 0, width: map.cols, height: map.rows };
}

export function deviceTiles(snapshot: BattleSnapshot): readonly TileCoord[] {
  return snapshot.units
    .filter((unit) => unit.kind === 'device' && !unit.tags.includes(BLOWER.id))
    .map((unit) => ({ x: Math.round(unit.x) + 0, y: Math.round(unit.y) + 0 }));
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
    updateMode: 'external',
    speed: DEFAULT_SPEED,
    appearances: {},
  };
  let feed: MissionFeed | null = null;
  let viewportWidth = 0;
  let viewportHeight = 0;
  let transform: MissionBoardTransform | null = null;
  let shown: HTMLElement | null = null;
  let terrain: MissionGround | null = null;
  let impostorAtlas: MissionImpostorAtlas | null = null;

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
  });

  const placeCanvas = (): void => {
    const next = canvasElement(terrain?.canvas);
    if (next) {
      shown = next;
    }
    if (!shown) {
      return;
    }
    const visible = terrain?.mode === 'terrain' && next !== null;
    shown.style.visibility = visible ? 'visible' : 'hidden';
    if (!visible || !transform || !terrain) {
      return;
    }
    shown.style.position = 'absolute';
    shown.style.left = `${transform.x}px`;
    shown.style.top = `${transform.y}px`;
    shown.style.width = `${terrain.boardWidth * transform.scale}px`;
    shown.style.height = `${terrain.boardHeight * transform.scale}px`;
  };

  terrain = options.terrain
    ? createMissionGround({
        ...options.terrain,
        tileSize: TILE_SIZE,
        onMode: (mode: MissionGroundMode) => {
          options.terrain?.onMode?.(mode);
          placeCanvas();
        },
        onBeforeRender: () => {
          options.terrain?.onBeforeRender?.();
          impostorAtlas?.flush();
        },
      })
    : null;

  const fitViewport = (): void => {
    if (!state.map || viewportWidth <= 0 || viewportHeight <= 0) {
      return;
    }
    const next = calculateBoardTransform(
      state.map.cols,
      state.map.rows,
      state.camera,
      TILE_SIZE,
      viewportWidth,
      viewportHeight,
    );
    if (!next) {
      return;
    }
    transform = next;
    terrain?.setDisplayScale(next.scale);
    placeCanvas();
  };

  const pitch = options.terrain?.projection?.pitch;
  // Stable bag so `configureActors` can hot-update skeleton/resources without rebuilding the stage.
  const actorOptions: MissionActorWorldOptions = {
    ...options.actors,
    ...(pitch !== undefined ? { pitch } : {}),
    ...(terrain ? { surface: terrain.surfaceHeight } : {}),
  };
  const actors = createActorWorld(actorOptions);
  const renderer = terrain?.renderer ?? null;
  impostorAtlas =
    options.impostor && renderer
      ? createMissionImpostorAtlas({ ...options.impostor, renderer })
      : null;
  if (impostorAtlas && options.impostor) {
    actors.setImpostor({
      atlas: impostorAtlas,
      ...(options.impostor.interval !== undefined
        ? { interval: options.impostor.interval }
        : {}),
      ...(options.impostor.pixelsPerUnit !== undefined
        ? { pixelsPerUnit: options.impostor.pixelsPerUnit }
        : {}),
    });
  }
  const hud = createHudLayer(actors, options.hud, options.hudStyle);
  const bindings = options.cues ?? createMissionCueBindings();
  const effects = createEffectLayer(actors, {
    table: options.effects ?? createMissionEffectTable(),
    bindings,
    ...(options.onUnboundCue ? { onUnboundCue: options.onUnboundCue } : {}),
  });
  terrain?.overlay.add(actors.layer, hud.layer, effects.layer);
  /** Events pushed in external mode, waiting for the next frame. */
  let arrived: BattleEvent[] = [];
  let moving: ReadonlySet<string> = new Set();

  const ingest: ViewSystem<StageFrame> = {
    id: 'ingest',
    run(frame) {
      let events: readonly BattleEvent[];
      if (feed) {
        feed.advance(frame.deltaSeconds);
        const sample = feed.sample();
        if (sample) {
          state.units = sample.units;
          moving = sample.moving;
        }
        events = feed.takeEvents();
      } else {
        events = arrived;
        arrived = [];
        moving = new Set();
      }
      if (events.length > 0) {
        state.events = [...state.events, ...events].slice(-EVENT_LIMIT);
      }
      frame.events = events;
      frame.units = state.units;
      frame.moving = moving;
      frame.speed = state.speed;
    },
  };

  const skillHold = createSkillCueHold();
  const audio: ViewSystem<ActorFrame> = {
    id: 'audio',
    run(frame) {
      const ids = new Set(frame.units.map((unit) => unit.id));
      const known = (unitId: string): boolean => ids.has(unitId);
      for (const cue of skillHold.release(known)) {
        options.onAudioCue?.(cue);
      }
      for (const event of frame.events) {
        const raw = effectCueFor(event, frame.units, { bindings });
        const cue = raw ? skillHold.pass(raw, known) : null;
        if (cue) {
          options.onAudioCue?.(cue);
        }
        if (event.type === 'leak') {
          terrain?.flashObjective();
        }
      }
    },
  };

  const loop = createViewLoop<StageFrame>([
    ingest,
    ...actors.systems,
    hud.system,
    effects.system,
    audio,
    createCullSystem({
      camera: () => terrain?.camera ?? null,
      actors,
      effects: effects.layer,
    }),
  ]);

  const renderMap = (map: MissionMap): void => {
    skillHold.clear();
    state.map = map;
    terrain?.setMap(map);
    terrain?.setCamera(state.camera);
    fitViewport();
  };

  const dispatch = (command: MissionStageCommand): void => {
    switch (command.type) {
      case 'set-map':
        renderMap(command.map);
        break;
      case 'set-camera':
        state.camera = command.camera;
        terrain?.setCamera(command.camera);
        fitViewport();
        break;
      case 'set-highlights':
        state.highlightedTiles = command.tiles;
        terrain?.setHighlights(command.tiles);
        break;
      case 'set-update-mode':
        state.updateMode = command.mode;
        if (command.speed !== undefined) {
          state.speed = clampSpeed(command.speed);
        }
        if (command.mode === 'local') {
          if (feed) {
            feed.configure({ speed: state.speed, delay: command.delay });
            break;
          }
          feed = createMissionFeed({
            speed: state.speed,
            delay: command.delay,
          });
          if (state.snapshot) {
            feed.push(state.snapshot);
          }
          for (const event of arrived) {
            feed.pushEvent(event);
          }
          arrived = [];
          break;
        }
        if (feed) {
          arrived.push(...feed.pendingEvents());
          if (state.snapshot) {
            state.units = state.snapshot.units;
          }
          feed = null;
        }
        break;
      case 'set-speed':
        state.speed = clampSpeed(command.speed);
        feed?.configure({ speed: state.speed });
        break;
      case 'push-snapshot':
        state.snapshot = command.snapshot;
        terrain?.setBlowerFacings(blowerFacings(command.snapshot));
        terrain?.setCrateTiles(deviceTiles(command.snapshot));
        if (feed) {
          feed.push(command.snapshot);
          break;
        }
        state.units = command.snapshot.units;
        break;
      case 'push-event':
        if (feed) {
          feed.pushEvent(command.event);
        } else {
          arrived.push(command.event);
        }
        break;
      case 'set-appearances':
        state.appearances = { ...state.appearances, ...command.appearances };
        actors.setAppearances(command.appearances);
        break;
      case 'reset':
        feed?.reset();
        state.snapshot = null;
        state.units = [];
        state.events = [];
        state.highlightedTiles = [];
        terrain?.setHighlights([]);
        terrain?.setCrateTiles(null);
        state.updateMode = 'external';
        state.appearances = {};
        feed = null;
        arrived = [];
        actors.clear();
        hud.clear();
        effects.clear();
        break;
    }
  };

  if (initialMap) {
    renderMap(initialMap);
  }

  const board: MissionBoard = {
    terrain,
    get canvas() {
      return terrain?.canvas ?? null;
    },
    get view() {
      return view();
    },
    dispatch,
    actors,
    hud,
    effects,
    configureActors(next) {
      Object.assign(actorOptions, next);
    },
    update(deltaSeconds) {
      loop.run({
        deltaSeconds,
        events: [],
        units: state.units,
        moving,
        speed: state.speed,
        field: fieldOf(state.map, state.camera),
      });
      terrain?.update(deltaSeconds);
      placeCanvas();
    },
    pointer(phase, screenX, screenY) {
      const event: MissionPointerEvent = {
        phase,
        screenX,
        screenY,
        hit: board.pick(screenX, screenY),
      };
      options.onPointer?.(event);
      return event;
    },
    pick(screenX, screenY): MissionPointerHit {
      if (!state.map) {
        return { type: 'empty' };
      }
      return pickBoard(
        screenX,
        screenY,
        transform ?? {
          ...IDENTITY,
          worldWidth: state.map.cols * TILE_SIZE,
          worldHeight: state.map.rows * TILE_SIZE,
        },
        terrain?.projection ??
          frameProjection(
            state.map.cols,
            state.map.rows,
            state.camera,
            TILE_SIZE,
            options.terrain?.projection,
          ),
        terrain?.surfaceHeight ?? (() => 0),
        state.map.cols,
        state.map.rows,
        state.units,
        state.map.tiles,
      );
    },
    resize(width, height) {
      viewportWidth = width;
      viewportHeight = height;
      fitViewport();
    },
    destroy() {
      actors.clear();
      hud.clear();
      effects.clear();
      impostorAtlas?.clear();
      terrain?.destroy();
    },
  };
  return board;
}

function canvasElement(value: object | null | undefined): HTMLElement | null {
  if (!value || !('style' in value)) {
    return null;
  }
  const style = (value as { style?: CSSStyleDeclaration | null }).style;
  if (!style) {
    return null;
  }
  return value as HTMLElement;
}
