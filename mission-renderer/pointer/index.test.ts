import type { UnitSnapshot } from 'arknights-mission-core';
import { describe, expect, it } from 'vitest';
import { pickBoard } from '#pointer/index.js';
import type { MissionBoardTransform } from '#runtime/camera/index.js';
import {
  frameProjection,
  type MissionProjection,
  projectPoint,
  unprojectPoint,
} from '#runtime/camera/projection.js';
import { defined } from '#test/defined.js';

const transform: MissionBoardTransform = {
  x: 0,
  y: 0,
  scale: 1,
  worldX: 0,
  worldY: 0,
  worldWidth: 192,
  worldHeight: 64,
};

function unit(
  id: string,
  x: number,
  y: number,
  tags: readonly string[] = [],
  height = 0,
): UnitSnapshot {
  return {
    id,
    side: 'ally',
    kind: 'operator',
    x,
    y,
    facing: 'RIGHT',
    height,
    attributes: { hp: 1, maxHp: 1 },
    maxHp: 1,
    tags,
    attackRange: [],
    deployPositions: [],
    elements: {},
    blocking: [],
    blockedBy: null,
    skills: [],
    shield: 0,
    downed: false,
    redeploy: null,
    unbalanceUntil: null,
    components: {},
  };
}

const flat = () => 0;

function projectionOf(cols: number, rows: number): MissionProjection {
  const projection = frameProjection(cols, rows, null, 64);
  if (!projection) {
    throw new Error('no projection');
  }
  return projection;
}

/** The canvas pixel of a board point. */
function at(
  projection: MissionProjection,
  x: number,
  y: number,
  z = 0,
): [number, number] {
  const point = projectPoint(projection, x, y, z);
  if (!point) {
    throw new Error('behind the camera');
  }
  return [point.x, point.y];
}

describe('board picking', () => {
  it('picks a unit before its tile and ignores a hidden unit', () => {
    const projection = projectionOf(3, 1);
    const tiles = [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    const units = [unit('guard', 1, 0), unit('shade', 2, 0, ['hidden'])];
    const pick = (point: [number, number]) =>
      pickBoard(...point, transform, projection, flat, 3, 1, units, tiles);

    expect(pick(at(projection, 1, 0))).toEqual({
      type: 'unit',
      unitId: 'guard',
    });
    expect(pick(at(projection, 2, 0))).toEqual({ type: 'tile', x: 2, y: 0 });
    expect(pick(at(projection, 0, 0))).toEqual({ type: 'empty' });
    expect(pick(at(projection, 5, 0))).toEqual({ type: 'empty' });
    expect(pickBoard(8, 8, null, projection, flat, 3, 1, units, tiles)).toEqual(
      { type: 'empty' },
    );
    expect(pickBoard(8, 8, transform, null, flat, 3, 1, units, tiles)).toEqual({
      type: 'empty',
    });
  });

  it('reads the screen through the stage transform', () => {
    const projection = projectionOf(3, 1);
    const moved: MissionBoardTransform = {
      ...transform,
      x: 40,
      y: 10,
      scale: 2,
    };
    const [x, y] = at(projection, 2, 0);
    expect(
      pickBoard(
        40 + x * 2,
        10 + y * 2,
        moved,
        projection,
        flat,
        3,
        1,
        [],
        [{ x: 2, y: 0 }],
      ),
    ).toEqual({ type: 'tile', x: 2, y: 0 });
  });

  it('picks the nearest unit in reach, whatever the order of the units', () => {
    const projection = projectionOf(3, 1);
    const tiles = [{ x: 1, y: 0 }];
    const units = [unit('far', 1.3, 0), unit('near', 1.1, 0)];
    const point = at(projection, 1.15, 0);
    expect(
      pickBoard(...point, transform, projection, flat, 3, 1, units, tiles),
    ).toEqual({ type: 'unit', unitId: 'near' });
    expect(
      pickBoard(
        ...point,
        transform,
        projection,
        flat,
        3,
        1,
        [...units].reverse(),
        tiles,
      ),
    ).toEqual({ type: 'unit', unitId: 'near' });
  });

  it('breaks a tie in distance by the unit drawn on top: higher, then in the nearer row', () => {
    const projection = projectionOf(3, 2);
    const back = unit('back', 1, 0.7);
    const front = unit('front', 1, 0.3);
    expect(
      pickBoard(
        ...at(projection, 1, 0.5),
        transform,
        projection,
        flat,
        3,
        2,
        [back, front],
        [],
      ),
    ).toEqual({ type: 'unit', unitId: 'front' });
    // two units the screen point hits exactly, each on the plane at its own height: the higher wins
    const point = at(projection, 1, 0.5);
    const onRaised = defined(unprojectPoint(projection, ...point, 0.4));
    const low = unit('low', 1, 0.5);
    const high = unit('high', onRaised.x, onRaised.y, [], 0.4);
    expect(
      pickBoard(...point, transform, projection, flat, 3, 2, [low, high], []),
    ).toEqual({ type: 'unit', unitId: 'high' });
    expect(
      pickBoard(...point, transform, projection, flat, 3, 2, [high, low], []),
    ).toEqual({ type: 'unit', unitId: 'high' });
  });

  it('picks a raised tile on its own top, and the tile behind it where a ray misses the raised plane', () => {
    const projection = projectionOf(3, 3);
    const tiles = [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
    ];
    const heights = (x: number, y: number) => (x === 1 && y === 1 ? 0.42 : 0);
    const pick = (point: [number, number]) =>
      pickBoard(...point, transform, projection, heights, 3, 3, [], tiles);
    expect(pick(at(projection, 1, 1, 0.42))).toEqual({
      type: 'tile',
      x: 1,
      y: 1,
    });
    // the front edge of the raised top hides the ground just behind it: the ground point there belongs to the wall
    expect(pick(at(projection, 1, 0.6, 0.42))).toEqual({
      type: 'tile',
      x: 1,
      y: 1,
    });
    expect(pick(at(projection, 1, 2))).toEqual({ type: 'tile', x: 1, y: 2 });
    expect(pick(at(projection, 1, 0))).toEqual({ type: 'tile', x: 1, y: 0 });
  });
});
