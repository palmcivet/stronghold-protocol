import {
  DataTexture,
  type Mesh,
  type MeshBasicMaterial,
  PerspectiveCamera,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { MissionMap } from '#contract/view.js';
import { resolveUvTable } from '#ground/atlas.js';
import type { BoardTile } from '#ground/cells.js';
import { parseObj } from '#ground/mesh.js';
import type { TerrainPack } from '#ground/pack.js';
import { createTerrainScene, gatePulse } from '#ground/scene.js';
import {
  frameProjection,
  syncPerspectiveCamera,
} from '#runtime/camera/projection.js';
import { defined } from '#test/defined.js';

function texture(): DataTexture {
  return new DataTexture(new Uint8Array([8, 8, 8, 255]), 1, 1);
}

function pack(): TerrainPack {
  return {
    images: { diffuse: texture() },
    meshes: {},
    gates: {},
    uv: resolveUvTable(null),
    release() {},
  };
}

const styledTiles: readonly BoardTile[] = [
  {
    x: 0,
    y: 0,
    height: 0,
    deployable: true,
    walkableBy: ['ground'],
    device: 'blower',
  },
  {
    x: 1,
    y: 1,
    height: 0,
    deployable: true,
    walkableBy: ['ground'],
    objective: true,
  },
  {
    x: 2,
    y: 2,
    height: 0,
    deployable: false,
    walkableBy: ['ground'],
    glyph: 'd',
  },
];

const map: MissionMap = { cols: 3, rows: 3, tiles: styledTiles };

describe('terrain scene', () => {
  it('looks at the whole map through the official perspective camera, rows running up the screen', () => {
    const scene = createTerrainScene({ map, pack: pack() });
    const camera = scene.camera;
    const expected = defined(frameProjection(3, 3, null, 1));
    const twin = new PerspectiveCamera();
    syncPerspectiveCamera(twin, expected);
    expect(camera.projectionMatrix.elements).toEqual(
      twin.projectionMatrix.elements,
    );
    expect(camera.position.toArray()).toEqual(twin.position.toArray());
    const near = new Vector3(1, 0, 0).project(camera);
    const far = new Vector3(1, 0, -2).project(camera);
    expect(far.y).toBeGreaterThan(near.y);
    const projection = defined(
      frameProjection(3, 3, { x: 0, y: 0, width: 2, height: 2, margin: 0 }, 1),
    );
    scene.setProjection(projection);
    syncPerspectiveCamera(twin, projection);
    expect(camera.projectionMatrix.elements).toEqual(
      twin.projectionMatrix.elements,
    );
    scene.destroy();
  });

  it('builds the board, shadow catcher, blower and the water overlay', () => {
    const scene = createTerrainScene({ map, pack: pack() });

    expect(scene.ground.getObjectByName('terrain-ground')).toBeTruthy();
    expect(scene.ground.getObjectByName('terrain-shadow')).toBeTruthy();
    expect(scene.ground.getObjectByName('terrain-blower')).toBeTruthy();
    expect(scene.ground.getObjectByName('terrain-water')).toBeTruthy();
    scene.destroy();
  });

  it('disposes the border dash texture it made when destroyed', () => {
    const scene = createTerrainScene({ map, pack: pack() });
    const edges = scene.ground.getObjectByName('terrain-edges') as Mesh;
    const dash = (edges.material as MeshBasicMaterial).map;
    if (!dash) {
      throw new Error('border has no dash texture');
    }
    const dispose = vi.spyOn(dash, 'dispose');
    scene.destroy();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('turns the wind device to the facing it is given', () => {
    // The prop's outlet is its OBJ +x, which the board mirrors to −x.
    const blower = parseObj(
      'v 0 0 0\nv 1 0 0\nv 0 0 1\nvt 0 0\nf 1/1 2/1 3/1\n',
    );
    if (!blower) {
      throw new Error('blower mesh did not parse');
    }
    const scene = createTerrainScene({
      map,
      pack: { ...pack(), meshes: { blower } },
    });
    const mesh = scene.ground.getObjectByName('terrain-blower') as Mesh;
    const outlet = (): [number, number] => {
      const position = mesh.geometry.getAttribute('position');
      return [
        Math.round(position.getX(1) - position.getX(0)),
        Math.round(position.getZ(1) - position.getZ(0)),
      ];
    };
    // UP is +row, which is −z in the scene.
    expect(outlet()).toEqual([0, -1]);
    const before = mesh.geometry;
    expect(scene.setBlowerFacing(0, 0, 'RIGHT')).toBe(true);
    expect(outlet()).toEqual([1, 0]);
    expect(mesh.geometry).not.toBe(before);
    expect(scene.setBlowerFacing(0, 0, 'LEFT')).toBe(true);
    expect(outlet()).toEqual([-1, 0]);
    expect(scene.setBlowerFacing(1, 1, 'LEFT')).toBe(false);
    scene.destroy();
  });

  it('shows the crates only where the battle keeps a device unit, and all of them before a battle', () => {
    const crate = (x: number): BoardTile => ({
      x,
      y: 0,
      height: 0,
      deployable: false,
      walkableBy: [],
      device: 'crate',
    });
    const scene = createTerrainScene({
      map: { ...map, tiles: [crate(0), crate(1)] },
      pack: pack(),
    });
    const shown = () =>
      scene.ground.children
        .filter((child) => child.name === 'terrain-crate' && child.visible)
        .map((child) => child.name);
    expect(shown()).toHaveLength(2);
    expect(scene.setCrateTiles([{ x: 1, y: 0 }])).toBe(true);
    expect(shown()).toHaveLength(1);
    scene.setCrateTiles([]);
    expect(shown()).toHaveLength(0);
    scene.setCrateTiles(null);
    expect(shown()).toHaveLength(2);
    scene.destroy();
  });

  it('casts no shadows without a renderer and frees every geometry it built when destroyed', () => {
    const scene = createTerrainScene({ map, pack: pack() });
    const meshes: Mesh[] = [];
    scene.ground.traverse((object) => {
      if ((object as Mesh).isMesh) {
        meshes.push(object as Mesh);
      }
    });
    expect(meshes.length).toBeGreaterThan(0);
    expect(
      meshes.every((mesh) => !mesh.castShadow && !mesh.receiveShadow),
    ).toBe(true);
    const freed = meshes.map((mesh) => vi.spyOn(mesh.geometry, 'dispose'));
    scene.destroy();
    for (const spy of freed) {
      expect(spy).toHaveBeenCalled();
    }
    expect(scene.ground.children).toHaveLength(0);
  });

  it('eases the lit field towards the requested rectangle in scene space', () => {
    const scene = createTerrainScene({ map, pack: pack() });

    scene.setFocus({ x: 0, y: 0, width: 1, height: 1 });
    for (let step = 0; step < 60; step += 1) {
      scene.update(0.1);
    }

    expect(scene.litField.x).toBeCloseTo(-0.5, 4);
    expect(scene.litField.y).toBeCloseTo(-0.5, 4);
    expect(scene.litField.z).toBeCloseTo(0.5, 4);
    expect(scene.litField.w).toBeCloseTo(0.5, 4);
    scene.destroy();
  });

  it('keeps the gate pulse inside its curve', () => {
    expect(gatePulse(0)).toBeCloseTo(0.134);
    expect(gatePulse(1)).toBeCloseTo(0.229);
  });
});
