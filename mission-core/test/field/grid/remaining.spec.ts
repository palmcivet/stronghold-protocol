import {
  createBattle,
  createGrid,
  type MissionModule,
  type RouteSpec,
  type TileSpec,
} from 'arknights-mission-core';
import { expect, test } from 'vitest';
import { gridOf } from '#field/grid/index.js';
import { remainingDistance } from '#field/grid/route.js';
import { ally, spec } from '#test/fixture.js';
import { engineOf } from '#unit/record/index.js';

/** 7 × 3 的场地，(3, 0)、(3, 1) 是墙，地面只能从 y = 2 绕过去。 */
const tiles: TileSpec[] = [0, 1, 2].flatMap((y) =>
  Array.from({ length: 7 }, (_, x) => {
    const wall = x === 3 && y < 2;
    return {
      x,
      y,
      height: 0,
      deployable: true,
      walkableBy: wall ? [] : ['ground'],
    };
  }),
);

function remainingAfterOneTick(
  route: RouteSpec,
  motion: 'WALK' | 'FLY' = 'WALK',
): { remaining: number; x: number; y: number } {
  const seen: { remaining: number; x: number; y: number }[] = [];
  const module: MissionModule = {
    id: 'case',
    install(ctx) {
      ctx.registerSystem({
        id: 'case-read',
        slot: 'finale',
        priority: 0,
        run: (runCtx) => {
          const { world } = engineOf(runCtx);
          const unit = world.units.get('e');
          if (unit) {
            seen.push({
              remaining: remainingDistance(world, unit, gridOf(world)),
              x: unit.x,
              y: unit.y,
            });
          }
        },
      });
    },
  };
  const battle = createBattle(
    spec({
      modules: ['case'],
      tiles,
      units: [
        ally('e', {
          side: 'enemy',
          x: 0,
          y: 0,
          motion,
          attributes: { hp: 100, atk: 0, def: 0, moveSpeed: 2 },
          route,
        }),
      ],
    }),
    [module],
  );
  battle.step();
  const first = seen[0];
  if (!first) {
    throw new Error('no reading');
  }
  return first;
}

function smoothed(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): number {
  const grid = createGrid(tiles);
  return grid.fieldLength(grid.flowField(toX, toY), grid.key(fromX, fromY));
}

test('剩余路程：这一段按路点量，之后的地面段按平滑流场的长度，不是直线', () => {
  const read = remainingAfterOneTick({
    checkpoints: [{ type: 'move', x: 1, y: 0 }],
    end: { x: 6, y: 0 },
  });
  const tail = smoothed(1, 0, 6, 0);
  expect(tail).toBeGreaterThan(5);
  expect(read.remaining).toBeCloseTo(1 - read.x + tail, 9);
});

test('剩余路程：出现段把起点挪到出现的位置；飞行段量直线', () => {
  const route: RouteSpec = {
    checkpoints: [
      { type: 'move', x: 1, y: 0 },
      { type: 'disappear' },
      { type: 'appear', x: 5, y: 2 },
    ],
    end: { x: 6, y: 0 },
  };
  const walk = remainingAfterOneTick(route);
  expect(walk.remaining).toBeCloseTo(1 - walk.x + smoothed(5, 2, 6, 0), 9);
  const fly = remainingAfterOneTick(
    { checkpoints: [{ type: 'move', x: 1, y: 0 }], end: { x: 6, y: 0 } },
    'FLY',
  );
  expect(fly.remaining).toBeCloseTo(1 - fly.x + 5, 9);
});

test('被推离格子中心的地面敌人从格子中心重新规划：一路不踩走不了的格子', () => {
  // (3, 1) 与 (4, 2) 是只许飞行的围栏；从这些偏离中心的位置直奔下一个路点会切过围栏的角
  const fenced: TileSpec[] = [0, 1, 2, 3].flatMap((y) =>
    Array.from({ length: 7 }, (_, x) => {
      const fence = (x === 3 && y === 1) || (x === 4 && y === 2);
      return {
        x,
        y,
        height: 0,
        deployable: true,
        walkableBy: fence ? ['fly'] : ['ground'],
      };
    }),
  );
  const grid = createGrid(fenced);
  let checked = 0;
  const cases = [
    [4.6, 2.1, 0, 0],
    [4.6, 2.3, 0, 0],
    [3.8, 2.6, 6, 0],
    [4.2, 2.55, 6, 0],
    [3.9, 2.7, 6, 0],
  ] as const;
  for (const [x, y, endX, endY] of cases) {
    const first = grid.waypoints(Math.round(x), Math.round(y), endX, endY)?.[1];
    expect(
      first && grid.straightClear(x, y, first),
      `${x},${y} cuts a corner`,
    ).toBe(false);
    const off: string[] = [];
    const module: MissionModule = {
      id: 'case',
      install(ctx) {
        ctx.registerSystem({
          id: 'case-read',
          slot: 'finale',
          priority: 0,
          run: (runCtx) => {
            const unit = engineOf(runCtx).world.units.get('e');
            if (
              unit?.fielded &&
              !grid.walkable(Math.round(unit.x), Math.round(unit.y), true)
            ) {
              off.push(`${unit.x.toFixed(2)},${unit.y.toFixed(2)}`);
            }
          },
        });
      },
    };
    const route: RouteSpec = { checkpoints: [], end: { x: endX, y: endY } };
    const battle = createBattle(
      spec({
        modules: ['case'],
        tiles: fenced,
        units: [
          ally('e', {
            side: 'enemy',
            x,
            y,
            attributes: { hp: 100, atk: 0, def: 0, moveSpeed: 2 },
            route,
          }),
        ],
      }),
      [module],
    );
    for (let tick = 0; tick < 400; tick += 1) {
      battle.step();
    }
    expect(off, `${x},${y}`).toEqual([]);
    checked += 1;
  }
  expect(checked).toBe(5);
});
