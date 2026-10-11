import { createGrid, type TileSpec } from 'arknights-mission-core';
import { describe, expect, test } from 'vitest';
import { OBSTACLE_COST } from '#field/grid/field.js';
import { bresenhamTiles } from '#field/grid/sight.js';

/** 参考实现的平地关卡第 9–12 行、第 2–10 列：x 是列，y 是行；终点 (2, 9)，(2, 10)–(2, 12) 是高台。 */
function flat(): TileSpec[] {
  const tiles: TileSpec[] = [];
  for (let y = 9; y <= 12; y += 1) {
    for (let x = 2; x <= 10; x += 1) {
      const high = x === 2 && y > 9;
      tiles.push({
        x,
        y,
        height: high ? 1 : 0,
        deployable: true,
        walkableBy: high ? [] : ['ground'],
      });
    }
  }
  return tiles;
}

describe('流场与平滑', () => {
  test('流场只走四个方向，严格变短才更新，同样代价时保留最先到达的父格（行加一、列加一、行减一、列减一的顺序）', () => {
    const grid = createGrid(flat());
    const field = grid.flowField(2, 9);
    const at = (x: number, y: number) => field.dist[grid.key(x, y)];
    expect(at(2, 9)).toBe(0);
    expect(at(10, 9)).toBe(8);
    expect(at(10, 12)).toBe(11);
    for (let key = 0; key < field.dist.length; key += 1) {
      const dist = field.dist[key] ?? -1;
      if (dist <= 0) {
        continue;
      }
      const here = grid.point(key);
      const parent = grid.point(field.parent[key] ?? -1);
      expect(Math.abs(here.x - parent.x) + Math.abs(here.y - parent.y)).toBe(1);
      expect(field.dist[field.parent[key] ?? -1]).toBe(dist - 1);
    }
    expect(field.parent[grid.key(4, 10)]).toBe(grid.key(3, 10));
    expect(at(2, 11)).toBe(-1);
  });

  test('平滑跳到 Bresenham 视线里最远的祖先；斜走要两边的直格都能走；不许斜时只沿行或列跳', () => {
    const grid = createGrid(flat());
    expect(grid.waypoints(10, 9, 2, 9)).toEqual([
      { x: 10, y: 9 },
      { x: 2, y: 9 },
    ]);
    expect(grid.waypoints(10, 12, 2, 9)).toEqual([
      { x: 10, y: 12 },
      { x: 2, y: 9 },
    ]);
    const path = grid.findPath(10, 12, 2, 9) ?? [];
    expect(path).toEqual(bresenhamTiles({ x: 10, y: 12 }, { x: 2, y: 9 }));
    for (let index = 1; index < path.length; index += 1) {
      const from = path[index - 1];
      const to = path[index];
      if (!from || !to) {
        continue;
      }
      expect(Math.abs(to.x - from.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(to.y - from.y)).toBeLessThanOrEqual(1);
      if (to.x !== from.x && to.y !== from.y) {
        expect(grid.walkable(to.x, from.y, false)).toBe(true);
        expect(grid.walkable(from.x, to.y, false)).toBe(true);
      }
    }
    for (const y of [10, 11, 12]) {
      grid.setObstacle(6, y, true);
    }
    expect((grid.waypoints(10, 12, 2, 9) ?? []).length).toBeGreaterThan(2);
    for (const tile of grid.findPath(10, 12, 2, 9) ?? []) {
      expect(tile.x === 6 && tile.y >= 10).toBe(false);
    }
    const axis = grid.flowField(2, 9, { allowDiagonal: false });
    let key = grid.key(10, 12);
    while (key !== axis.dest) {
      const next = axis.next[key] ?? -1;
      const here = grid.point(key);
      const there = grid.point(next);
      expect(here.x === there.x || here.y === there.y).toBe(true);
      key = next;
    }
  });

  test('箱子能走但代价 1000、挡视线、不是放置与位移格；硬障碍走不过；两种各占一位', () => {
    const grid = createGrid(flat());
    const before = grid.version;
    grid.setObstacle(6, 9, true, 'crate');
    expect(grid.version).toBeGreaterThan(before);
    expect([
      grid.isObstacle(6, 9),
      grid.isCrate(6, 9),
      grid.isBlocked(6, 9),
    ]).toEqual([true, true, false]);
    expect(grid.groundPassable(6, 9)).toBe(false);
    expect(grid.walkable(6, 9, false)).toBe(true);
    expect(grid.flowField(2, 9).dist[grid.key(6, 9)]).toBe(3 + OBSTACLE_COST);
    expect(
      grid.findPath(10, 9, 2, 9)?.some((tile) => tile.x === 6 && tile.y === 9),
    ).toBe(false);
    for (const y of [10, 11, 12]) {
      grid.setObstacle(6, y, true);
    }
    expect(grid.flowField(2, 9).dist[grid.key(10, 9)]).toBeGreaterThan(
      OBSTACLE_COST,
    );
    expect(
      grid.findPath(10, 9, 2, 9)?.some((tile) => tile.x === 6 && tile.y === 9),
    ).toBe(true);
    grid.setObstacle(6, 9, true, 'block');
    grid.setObstacle(6, 9, false, 'crate');
    expect([grid.isBlocked(6, 9), grid.isCrate(6, 9)]).toEqual([true, false]);
    expect(grid.findPath(10, 9, 2, 9)).toBeNull();
    expect(
      grid.findPath(10, 9, 2, 9, { ignoreObstacles: true }),
    ).not.toBeNull();
  });

  test('流场按终点与网格版本缓存：障碍没变时不重建', () => {
    const grid = createGrid(flat());
    const first = grid.flowField(2, 9);
    expect(grid.flowField(2, 9)).toBe(first);
    expect(grid.flowField(3, 9)).not.toBe(first);
    grid.setObstacle(5, 10, true);
    expect(grid.flowField(2, 9)).not.toBe(first);
    const version = grid.version;
    grid.setObstacle(5, 10, true);
    expect(grid.version).toBe(version);
    const second = grid.flowField(2, 9);
    expect(grid.flowField(2, 9)).toBe(second);
  });
});
