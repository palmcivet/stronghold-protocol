import type { TileCoord } from 'arknights-mission-core';
import type { Scene } from 'three';
import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  type PerspectiveCamera,
  PlaneGeometry,
  WebGLRenderer,
} from 'three';
import type {
  MissionCamera,
  MissionMap,
  MissionTileRect,
} from '#contract/view.js';
import { cellKey, classifyCells, type TerrainCells } from '#ground/cells.js';
import type { TerrainDevice, TerrainLayout } from '#ground/layout.js';
import {
  loadTerrainPack,
  type MissionGroundPack,
  type TerrainPack,
  type TerrainResourcePort,
} from '#ground/pack.js';
import {
  createTerrainScene,
  type TerrainFocusRect,
  type TerrainFog,
  type TerrainScene,
} from '#ground/scene.js';
import { TILE_SIZE } from '#ground/tile.js';
import {
  type WebGLContextEvent,
  type WebGLSurface,
  webgl2Available,
} from '#ground/webgl.js';
import {
  frameProjection,
  type MissionProjection,
  type MissionProjectionOptions,
} from '#runtime/camera/projection.js';

export type {
  MissionGroundImageSlot,
  MissionGroundPack,
  TerrainGateSlot,
  TerrainMeshSlot,
  TerrainResourcePort,
} from '#ground/pack.js';
export {
  MISSION_GROUND_GATE_NODES,
  MISSION_GROUND_IMAGE_SLOTS,
  MISSION_GROUND_MESH_SLOTS,
} from '#ground/pack.js';
export {
  createTerrainScene,
  gatePulse,
  TERRAIN_LIGHTING,
  type TerrainFocusRect,
  type TerrainFog,
  type TerrainScene,
} from '#ground/scene.js';
export { type WebGLProbeDocument, webgl2Available } from '#ground/webgl.js';

export type MissionGroundMode = 'terrain' | 'hidden';

/** How highlighted tiles are drawn: a flat square of `size` tiles, `lift` above the tile's surface. */
export const MISSION_GROUND_HIGHLIGHT = Object.freeze({
  color: 0xffd34d,
  opacity: 0.35,
  size: 0.92,
  lift: 0.01,
});

/** The most pixels per CSS pixel the ground draws by default, as master's board on its default quality. */
export const MISSION_GROUND_MAX_PIXEL_RATIO = 2;

/** Clear colour and fog, as master's board: the far board fades into the clear colour. */
export const MISSION_GROUND_ATMOSPHERE = Object.freeze({
  clear: 0x0c1114,
  fog: Object.freeze({ color: 0x0c1114, near: 17, far: 36 }),
});

/** The clear colour behind the board (null keeps the canvas transparent) and the distance fog (null draws none). */
export interface MissionGroundAtmosphere {
  readonly clear?: number | null;
  readonly fog?: TerrainFog | null;
}

const rect = (
  r0: number,
  r1: number,
  c0: number,
  c1: number,
): MissionTileRect =>
  Object.freeze({ x: c0, y: r0, width: c1 - c0 + 1, height: r1 - r0 + 1 });

/**
 * The parts of the official board each phase builds, as master: the player's field with the row of devices above it
 * and the enemy preview, both halves joined in a joint defence, the boss field, and the whole board.
 */
export const MISSION_GROUND_AREAS = Object.freeze({
  normal: Object.freeze([rect(6, 13, 0, 10), rect(13, 18, 6, 14)]),
  unite: Object.freeze([rect(6, 13, 0, 20), rect(13, 18, 6, 14)]),
  boss: Object.freeze([rect(0, 6, 0, 20)]),
  all: Object.freeze([rect(0, 18, 0, 20)]),
});

/** `high` draws the key light's shadows; `low` does not. */
export type MissionGroundQuality = 'high' | 'low';

/** The map with only the tiles inside `areas`; the whole map without areas. */
export function clipMapToAreas(
  map: MissionMap,
  areas: readonly MissionTileRect[] | null,
): MissionMap {
  if (!areas) {
    return map;
  }
  return {
    ...map,
    tiles: map.tiles.filter((tile) =>
      areas.some(
        (area) =>
          tile.x >= area.x &&
          tile.x < area.x + area.width &&
          tile.y >= area.y &&
          tile.y < area.y + area.height,
      ),
    ),
  };
}

/** The GPU surface the terrain draws to. */
export interface TerrainRenderView {
  readonly canvas: WebGLSurface & {
    readonly width: number;
    readonly height: number;
  };
  readonly renderer: WebGLRenderer | null;
  setSize(width: number, height: number): void;
  render(scene: Scene, camera: PerspectiveCamera): void;
  dispose(): void;
}

export interface MissionGroundOptions {
  /** Whether the GPU ground may be shown. Defaults to whether a view is present. */
  readonly available?: boolean;
  /** Pixels per board tile before the stage's display scale; the canvas is board-sized × display scale × pixel ratio. */
  readonly tileSize?: number;
  /** Defaults to the screen's pixel ratio, at most `MISSION_GROUND_MAX_PIXEL_RATIO`. */
  readonly pixelRatio?: number;
  readonly resources?: TerrainResourcePort;
  readonly pack?: MissionGroundPack;
  /** The GPU view. Null leaves the ground hidden. Undefined creates a WebGL renderer when the browser has one. */
  readonly view?: TerrainRenderView | null;
  readonly onMode?: (mode: MissionGroundMode) => void;
  /** Called on every frame the scene is drawn, just before it is drawn; the impostor atlas flushes here. */
  readonly onBeforeRender?: () => void;
  /** Field of view and pitch of the perspective camera. Defaults to `MISSION_PROJECTION`. */
  readonly projection?: MissionProjectionOptions;
  /** Clear colour and fog. Defaults to `MISSION_GROUND_ATMOSPHERE`. */
  readonly atmosphere?: MissionGroundAtmosphere;
  /** The parts of the board to build, in tiles; null or missing builds the whole map. */
  readonly areas?: readonly MissionTileRect[] | null;
  /** Defaults to `high`. */
  readonly quality?: MissionGroundQuality;
  /** Lets a software or blocklisted GPU draw the ground it creates. Defaults to false. */
  readonly allowSlowGpu?: boolean;
}

/** A blower unit's tile and facing. */
export interface MissionBlowerFacing {
  readonly x: number;
  readonly y: number;
  readonly facing: TerrainDevice['direction'];
}

export interface MissionGround {
  readonly mode: MissionGroundMode;
  readonly canvas: TerrainRenderView['canvas'] | null;
  readonly boardWidth: number;
  readonly boardHeight: number;
  readonly layout: TerrainLayout | null;
  /** Drawn in the ground's scene, above the board, whenever the scene is built (x = column, y = height, z = −row). */
  readonly overlay: Group;
  /** The highlighted tiles drawn on the board. */
  readonly highlights: Group;
  /** How the camera projects the board onto the board-sized canvas; null without a map. Pointer picking uses it too. */
  readonly projection: MissionProjection | null;
  /** The camera the scene is drawn with. Null until a scene is built. */
  readonly camera: PerspectiveCamera | null;
  /** The GPU renderer of the view. Null without a WebGL view. */
  readonly renderer: WebGLRenderer | null;
  /** Height of the board's surface at a tile, in tiles. 0 off the map. */
  readonly surfaceHeight: (x: number, y: number) => number;
  readonly setHighlights: (tiles: readonly TileCoord[]) => void;
  /** Point the map's wind devices along the facings of the battle's blower units; kept across scene rebuilds. */
  readonly setBlowerFacings: (facings: readonly MissionBlowerFacing[]) => void;
  /** The facings last handed to `setBlowerFacings`. */
  readonly blowerFacings: readonly MissionBlowerFacing[];
  /**
   * Shows the map's crates only where the battle's device units stand, so a destroyed crate leaves the board; null
   * shows every crate, as before a battle. Kept across scene rebuilds.
   */
  readonly setCrateTiles: (tiles: readonly TileCoord[] | null) => void;
  readonly ready: Promise<void>;
  readonly setMap: (map: MissionMap) => void;
  readonly setCamera: (camera: MissionCamera | null) => void;
  readonly setDisplayScale: (scale: number) => void;
  readonly setAvailable: (available: boolean) => void;
  /** Rebuilds the scene with only these parts of the board; null builds the whole map. */
  readonly setAreas: (areas: readonly MissionTileRect[] | null) => void;
  readonly areas: readonly MissionTileRect[] | null;
  /** Turns the shadows on for `high` and off for `low`, without rebuilding. */
  readonly setQuality: (quality: MissionGroundQuality) => void;
  readonly quality: MissionGroundQuality;
  readonly flashObjective: () => void;
  readonly update: (deltaSeconds: number) => void;
  readonly destroy: () => void;
}

function createWebGLView(
  pixelRatio: number,
  clear: number | null,
  allowSlow: boolean,
): TerrainRenderView | null {
  if (!webgl2Available(allowSlow)) {
    return null;
  }
  try {
    const renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      stencil: true,
      depth: true,
    });
    renderer.setClearColor(clear ?? 0x000000, clear === null ? 0 : 1);
    renderer.setPixelRatio(1);
    const canvas =
      renderer.domElement as unknown as TerrainRenderView['canvas'];
    return {
      canvas,
      renderer,
      setSize(width, height) {
        renderer.setSize(
          Math.max(1, Math.floor(width * pixelRatio)),
          Math.max(1, Math.floor(height * pixelRatio)),
          false,
        );
      },
      render(scene, camera) {
        renderer.render(scene, camera);
      },
      dispose() {
        renderer.dispose();
        renderer.forceContextLoss();
      },
    };
  } catch {
    return null;
  }
}

function focusOf(camera: MissionCamera | null): TerrainFocusRect | null {
  if (!camera) {
    return null;
  }
  return {
    x: camera.x,
    y: camera.y,
    width: camera.width,
    height: camera.height,
  };
}

/**
 * The 3D ground of a map. It is shown once its atlas has loaded. The ground stays hidden when there is no GPU view,
 * when the pack is missing or fails to load, and while the WebGL context is lost; the scene is rebuilt when the
 * context returns. Units and the battle state are never touched here.
 */
export function createMissionGround(
  options: MissionGroundOptions = {},
): MissionGround {
  const tileSize = options.tileSize ?? TILE_SIZE;
  const pixelRatio =
    options.pixelRatio ??
    Math.min(MISSION_GROUND_MAX_PIXEL_RATIO, globalThis.devicePixelRatio || 1);
  const clear =
    options.atmosphere?.clear === undefined
      ? MISSION_GROUND_ATMOSPHERE.clear
      : options.atmosphere.clear;
  const fog =
    options.atmosphere?.fog === undefined
      ? MISSION_GROUND_ATMOSPHERE.fog
      : options.atmosphere.fog;
  let areas = options.areas ?? null;
  let quality: MissionGroundQuality = options.quality ?? 'high';
  const view =
    options.view === undefined
      ? createWebGLView(pixelRatio, clear, options.allowSlowGpu === true)
      : options.view;
  let enabled = options.available ?? view !== null;
  let map: MissionMap | null = null;
  let sceneRef: TerrainScene | null = null;
  let pack: TerrainPack | null = null;
  let focus: TerrainFocusRect | null = null;
  let viewCamera: MissionCamera | null = null;
  let projection: MissionProjection | null = null;
  const reproject = (): void => {
    projection = map
      ? frameProjection(
          map.cols,
          map.rows,
          viewCamera,
          tileSize,
          options.projection,
        )
      : null;
    if (projection) {
      sceneRef?.setProjection(projection);
    }
  };
  let displayScale = 1;
  let generation = 0;
  let presented = false;
  let ready = Promise.resolve();
  const overlay = new Group();
  overlay.name = 'overlay';
  const highlights = new Group();
  highlights.name = 'highlights';
  const highlightGeometry = new PlaneGeometry(
    MISSION_GROUND_HIGHLIGHT.size,
    MISSION_GROUND_HIGHLIGHT.size,
  ).rotateX(-Math.PI / 2);
  const highlightMaterial = new MeshBasicMaterial({
    color: MISSION_GROUND_HIGHLIGHT.color,
    opacity: MISSION_GROUND_HIGHLIGHT.opacity,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  let cells: TerrainCells = new Map();
  let highlighted: readonly TileCoord[] = [];

  const surfaceHeight = (x: number, y: number): number =>
    cells.get(cellKey(Math.round(x), Math.round(y)))?.height ?? 0;

  const drawHighlights = (): void => {
    highlights.clear();
    for (const tile of highlighted) {
      const square = new Mesh(highlightGeometry, highlightMaterial);
      square.position.set(
        tile.x,
        surfaceHeight(tile.x, tile.y) + MISSION_GROUND_HIGHLIGHT.lift,
        -tile.y,
      );
      highlights.add(square);
    }
  };

  const publish = (): void => {
    const next = enabled && sceneRef !== null && view !== null;
    if (next === presented) {
      return;
    }
    presented = next;
    options.onMode?.(presented ? 'terrain' : 'hidden');
  };

  const resizeView = (): void => {
    if (!map || !view) {
      return;
    }
    view.setSize(
      map.cols * tileSize * displayScale,
      map.rows * tileSize * displayScale,
    );
  };

  const clearGround = (): void => {
    generation += 1;
    sceneRef?.destroy();
    sceneRef = null;
    pack?.release();
    pack = null;
    publish();
  };

  let facings: readonly MissionBlowerFacing[] = [];
  let crateTiles: readonly TileCoord[] | null = null;
  const applyFacings = (): void => {
    for (const blower of facings) {
      sceneRef?.setBlowerFacing(blower.x, blower.y, blower.facing);
    }
    sceneRef?.setCrateTiles(crateTiles);
  };

  const buildScene = (nextMap: MissionMap, loaded: TerrainPack): void => {
    sceneRef = createTerrainScene({
      map: clipMapToAreas(nextMap, areas),
      pack: loaded,
      renderer: view?.renderer ?? null,
      projection,
      fog,
      shadows: quality !== 'low',
    });
    sceneRef.scene.add(highlights, overlay);
    sceneRef.setFocus(focus);
    applyFacings();
    resizeView();
  };

  const load = async (
    nextMap: MissionMap,
    currentGeneration: number,
  ): Promise<void> => {
    if (!options.pack || !options.resources) {
      return;
    }
    const loaded = await loadTerrainPack(options.resources, options.pack);
    if (currentGeneration !== generation) {
      loaded?.release();
      return;
    }
    pack = loaded;
    if (loaded) {
      buildScene(nextMap, loaded);
    }
    publish();
  };

  const setMap = (nextMap: MissionMap): void => {
    clearGround();
    map = nextMap;
    cells = classifyCells(nextMap);
    reproject();
    drawHighlights();
    resizeView();
    ready = load(nextMap, generation);
  };

  const onContextLost = (event: WebGLContextEvent): void => {
    event.preventDefault();
    enabled = false;
    publish();
  };

  const onContextRestored = (): void => {
    enabled = true;
    if (map) {
      setMap(map);
    }
  };

  view?.canvas.addEventListener('webglcontextlost', onContextLost);
  view?.canvas.addEventListener('webglcontextrestored', onContextRestored);

  return {
    renderer: view?.renderer ?? null,
    get mode() {
      return presented ? 'terrain' : 'hidden';
    },
    get canvas() {
      return presented && view ? view.canvas : null;
    },
    get boardWidth() {
      return (map?.cols ?? 0) * tileSize;
    },
    get boardHeight() {
      return (map?.rows ?? 0) * tileSize;
    },
    get layout() {
      return sceneRef?.layout ?? null;
    },
    overlay,
    highlights,
    get camera() {
      return sceneRef?.camera ?? null;
    },
    get projection() {
      return projection;
    },
    surfaceHeight,
    setHighlights(tiles) {
      highlighted = tiles;
      drawHighlights();
    },
    setBlowerFacings(next) {
      facings = next;
      applyFacings();
    },
    get blowerFacings() {
      return facings;
    },
    setCrateTiles(tiles) {
      crateTiles = tiles;
      sceneRef?.setCrateTiles(tiles);
    },
    get ready() {
      return ready;
    },
    setMap,
    setCamera(camera) {
      viewCamera = camera;
      reproject();
      focus = focusOf(camera);
      sceneRef?.setFocus(focus);
    },
    setDisplayScale(scale) {
      if (!(scale > 0)) {
        return;
      }
      displayScale = scale;
      resizeView();
    },
    setAvailable(available) {
      enabled = available;
      publish();
    },
    setAreas(next) {
      areas = next;
      if (sceneRef && pack && map) {
        sceneRef.destroy();
        buildScene(map, pack);
      }
    },
    get areas() {
      return areas;
    },
    setQuality(next) {
      quality = next;
      sceneRef?.setShadows(next !== 'low');
    },
    get quality() {
      return quality;
    },
    flashObjective() {
      sceneRef?.flashObjective();
    },
    update(deltaSeconds) {
      if (!sceneRef) {
        return;
      }
      sceneRef.update(deltaSeconds);
      if (presented && view) {
        options.onBeforeRender?.();
        view.render(sceneRef.scene, sceneRef.camera);
      }
    },
    destroy() {
      view?.canvas.removeEventListener('webglcontextlost', onContextLost);
      view?.canvas.removeEventListener(
        'webglcontextrestored',
        onContextRestored,
      );
      clearGround();
      highlights.clear();
      highlightGeometry.dispose();
      highlightMaterial.dispose();
      view?.dispose();
    },
  };
}
