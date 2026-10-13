import type { AssetKey } from 'arknights-assets-catalog';
import {
  DataTexture,
  Fog,
  type Mesh,
  PerspectiveCamera,
  type Scene,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { MissionMap } from '#contract/view.js';
import type { BoardTile } from '#ground/cells.js';
import {
  clipMapToAreas,
  createMissionGround,
  MISSION_GROUND_AREAS,
  MISSION_GROUND_ATMOSPHERE,
  type TerrainRenderView,
  type TerrainResourcePort,
  webgl2Available,
} from '#ground/index.js';
import type { WebGLContextEvent } from '#ground/webgl.js';
import {
  frameProjection,
  syncPerspectiveCamera,
} from '#runtime/camera/projection.js';
import { defined } from '#test/defined.js';

const map: MissionMap = {
  cols: 3,
  rows: 3,
  tiles: [
    {
      x: 0,
      y: 0,
      height: 0,
      deployable: true,
      walkableBy: ['ground'],
      objective: true,
    },
  ],
};

const diffuse: AssetKey = 'texture:map/autochess/TX_autochessi_D';

function resourcesWith(
  image: () => Promise<unknown>,
  release = vi.fn(),
): TerrainResourcePort {
  return { image, model: async () => null, json: async () => null, release };
}

interface MockView extends TerrainRenderView {
  readonly listeners: Map<string, (event: WebGLContextEvent) => void>;
}

function viewOf(): MockView {
  const listeners = new Map<string, (event: WebGLContextEvent) => void>();
  return {
    canvas: {
      width: 1,
      height: 1,
      getContext: () => ({}),
      addEventListener: (
        type: string,
        listener: (event: WebGLContextEvent) => void,
      ) => {
        listeners.set(type, listener);
      },
      removeEventListener: (type: string) => {
        listeners.delete(type);
      },
    },
    renderer: null,
    listeners,
    setSize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
  };
}

function atlas(): DataTexture {
  return new DataTexture(new Uint8Array([8, 8, 8, 255]), 1, 1);
}

describe('terrain stage', () => {
  it('projects through the configured optics and reframes when the camera rectangle changes', async () => {
    const view = viewOf();
    const stage = createMissionGround({
      view,
      resources: resourcesWith(async () => atlas()),
      pack: { images: { diffuse } },
      tileSize: 10,
      projection: { pitch: 40, fovY: 35 },
    });
    expect(stage.projection).toBeNull();
    stage.setMap(map);
    expect(stage.projection).toEqual(
      frameProjection(3, 3, null, 10, { pitch: 40, fovY: 35 }),
    );
    const rect = { x: 1, y: 1, width: 2, height: 2, margin: 0 };
    stage.setCamera(rect);
    const framed = defined(
      frameProjection(3, 3, rect, 10, { pitch: 40, fovY: 35 }),
    );
    expect(stage.projection).toEqual(framed);
    await stage.ready;
    const twin = new PerspectiveCamera();
    syncPerspectiveCamera(twin, framed);
    expect(stage.camera?.projectionMatrix.elements).toEqual(
      twin.projectionMatrix.elements,
    );
    stage.destroy();
  });

  it('points the wind devices along the blower facings, also when they arrive before the scene', async () => {
    const view = viewOf();
    const stage = createMissionGround({
      view,
      resources: {
        image: async () => atlas(),
        // The prop's outlet is its OBJ +x, which the board mirrors to −x.
        model: async () => 'v 0 0 0\nv 1 0 0\nv 0 0 1\nvt 0 0\nf 1/1 2/1 3/1\n',
        json: async () => null,
        release: vi.fn(),
      },
      pack: {
        images: { diffuse },
        meshes: { blower: 'model:test/blower' as AssetKey },
      },
    });
    const blower: BoardTile = {
      x: 1,
      y: 1,
      height: 0,
      deployable: false,
      walkableBy: [],
      device: 'blower',
    };
    const windy: MissionMap = { ...map, tiles: [blower] };
    stage.setBlowerFacings([{ x: 1, y: 1, facing: 'RIGHT' }]);
    stage.setMap(windy);
    await stage.ready;
    const outlet = (): [number, number] => {
      const mesh = stage.overlay.parent?.getObjectByName(
        'terrain-blower',
      ) as Mesh;
      const position = mesh.geometry.getAttribute('position');
      return [
        Math.round(position.getX(1) - position.getX(0)),
        Math.round(position.getZ(1) - position.getZ(0)),
      ];
    };
    expect(outlet()).toEqual([1, 0]);
    stage.setBlowerFacings([{ x: 1, y: 1, facing: 'DOWN' }]);
    expect(outlet()).toEqual([0, 1]);
    expect(stage.blowerFacings).toEqual([{ x: 1, y: 1, facing: 'DOWN' }]);
    stage.destroy();
  });

  it('shows the 3D ground once the atlas has loaded and renders it on update', async () => {
    const view = viewOf();
    const stage = createMissionGround({
      view,
      resources: resourcesWith(async () => atlas()),
      pack: { images: { diffuse: diffuse } },
    });

    stage.setMap(map);
    await stage.ready;
    stage.update(0);

    expect(stage.mode).toBe('terrain');
    expect(stage.canvas).toBe(view.canvas);
    expect(stage.layout).not.toBeNull();
    expect(view.render).toHaveBeenCalled();
    stage.destroy();
  });

  it('sizes the canvas with the display scale', async () => {
    const view = viewOf();
    const stage = createMissionGround({
      view,
      resources: resourcesWith(async () => atlas()),
      pack: { images: { diffuse: diffuse } },
    });

    stage.setMap(map);
    await stage.ready;
    stage.setDisplayScale(0.5);

    expect(view.setSize).toHaveBeenLastCalledWith(96, 96);
    stage.destroy();
  });

  it('stays hidden when there is no GPU view', async () => {
    const stage = createMissionGround({
      view: null,
      resources: resourcesWith(async () => atlas()),
      pack: { images: { diffuse: diffuse } },
    });

    stage.setMap(map);
    await stage.ready;
    stage.update(0);

    expect(stage.mode).toBe('hidden');
    expect(stage.canvas).toBeNull();
    stage.destroy();
  });

  it('stays hidden when the diffuse atlas fails to load', async () => {
    const release = vi.fn();
    const stage = createMissionGround({
      view: viewOf(),
      resources: resourcesWith(async () => {
        throw new Error('missing atlas');
      }, release),
      pack: { images: { diffuse: diffuse } },
    });

    stage.setMap(map);
    await stage.ready;

    expect(stage.mode).toBe('hidden');
    expect(release).toHaveBeenCalledWith(diffuse, 'image');
    stage.destroy();
  });

  it('hides the ground while the context is lost and rebuilds it on restore', async () => {
    const view = viewOf();
    const modes: string[] = [];
    const stage = createMissionGround({
      view,
      resources: resourcesWith(async () => atlas()),
      pack: { images: { diffuse: diffuse } },
      onMode: (mode) => modes.push(mode),
    });

    stage.setMap(map);
    await stage.ready;
    expect(stage.mode).toBe('terrain');

    view.listeners.get('webglcontextlost')?.({ preventDefault() {} });
    expect(stage.mode).toBe('hidden');

    view.listeners.get('webglcontextrestored')?.({ preventDefault() {} });
    await stage.ready;
    expect(stage.mode).toBe('terrain');
    expect(modes).toEqual(['terrain', 'hidden', 'terrain']);
    stage.destroy();
  });

  it('accepts a camera and a leak without a loaded scene', () => {
    const stage = createMissionGround({ view: null });

    stage.setCamera({ x: 0, y: 0, width: 1, height: 1, margin: 0 });
    stage.flashObjective();
    stage.update(0.1);

    expect(stage.mode).toBe('hidden');
    stage.destroy();
  });
});

describe('ground options', () => {
  const tile = (x: number, y: number) => ({
    x,
    y,
    height: 0,
    deployable: true,
    walkableBy: ['ground'] as const,
    objective: false,
  });
  const wide: MissionMap = {
    cols: 3,
    rows: 2,
    tiles: [tile(0, 0), tile(1, 0), tile(2, 0), tile(0, 1), tile(2, 1)],
  };

  it('keeps only the tiles inside the areas, and every tile without areas', () => {
    const areas = [{ x: 1, y: 0, width: 2, height: 2 }];
    expect(clipMapToAreas(wide, areas).tiles.map((t) => [t.x, t.y])).toEqual([
      [1, 0],
      [2, 0],
      [2, 1],
    ]);
    expect(clipMapToAreas(wide, null)).toBe(wide);
    expect(MISSION_GROUND_AREAS.normal[0]).toEqual({
      x: 0,
      y: 6,
      width: 11,
      height: 8,
    });
  });

  it('fogs the scene as master by default, rebuilds it for new areas, and switches the quality', async () => {
    const ground = createMissionGround({
      view: viewOf(),
      resources: resourcesWith(async () => atlas()),
      pack: { images: { diffuse } },
      quality: 'low',
    });
    ground.setMap(wide);
    await ground.ready;
    const scene = ground.overlay.parent as Scene;
    expect(scene.fog).toBeInstanceOf(Fog);
    expect((scene.fog as Fog).far).toBe(MISSION_GROUND_ATMOSPHERE.fog.far);
    const before = ground.layout;
    ground.setAreas([{ x: 2, y: 0, width: 1, height: 2 }]);
    expect(ground.layout).not.toBe(before);
    expect(ground.areas).toEqual([{ x: 2, y: 0, width: 1, height: 2 }]);
    expect(ground.quality).toBe('low');
    ground.setQuality('high');
    expect(ground.quality).toBe('high');
    ground.destroy();

    const clear = createMissionGround({
      view: viewOf(),
      resources: resourcesWith(async () => atlas()),
      pack: { images: { diffuse } },
      atmosphere: { fog: null },
    });
    clear.setMap(wide);
    await clear.ready;
    expect((clear.overlay.parent as Scene).fog).toBeNull();
    clear.destroy();
  });

  it('draws only on WebGL2, refusing a slow GPU unless allowed', () => {
    const doc = (fast: boolean) => ({
      createElement: () => ({
        getContext: (
          _kind: 'webgl2',
          attributes?: { readonly failIfMajorPerformanceCaveat?: boolean },
        ) =>
          fast || !attributes?.failIfMajorPerformanceCaveat
            ? { getExtension: () => null }
            : null,
      }),
    });
    expect(webgl2Available(false, doc(true))).toBe(true);
    expect(webgl2Available(false, doc(false))).toBe(false);
    expect(webgl2Available(true, doc(false))).toBe(true);
    expect(webgl2Available(false, undefined)).toBe(false);
  });
});
