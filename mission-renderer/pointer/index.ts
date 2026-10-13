import type { TileCoord, UnitSnapshot } from 'arknights-mission-core';
import type { MissionPointerHit } from '#contract/view.js';
import type { MissionBoardTransform } from '#runtime/camera/index.js';
import {
  type MissionProjection,
  unprojectPoint,
} from '#runtime/camera/projection.js';

const UNIT_REACH = 0.4;
const SAME_DISTANCE = 1e-6;
const SAME_HEIGHT = 1e-3;

function closer(
  unit: UnitSnapshot,
  distance: number,
  best: UnitSnapshot,
  bestDistance: number,
): boolean {
  if (Math.abs(distance - bestDistance) > SAME_DISTANCE) {
    return distance < bestDistance;
  }
  if (unit.height !== best.height) {
    return unit.height > best.height;
  }
  return unit.y < best.y;
}

/**
 * The unit or tile under a screen point, seen through the board's perspective projection. A unit within reach (on the
 * plane at its own height) is chosen before the tile it stands on; among several, the nearest wins, then the one drawn
 * on top: the higher, then the one in the nearer row. Tiles are tried from the highest surface down, and a hit on a
 * raised plane counts only where the tile really has that height (master `pickTile`).
 */
export function pickBoard(
  screenX: number,
  screenY: number,
  transform: MissionBoardTransform | null,
  projection: MissionProjection | null,
  heightAt: (x: number, y: number) => number,
  cols: number,
  rows: number,
  units: readonly UnitSnapshot[],
  tiles: readonly TileCoord[],
): MissionPointerHit {
  if (!transform || !projection || !(transform.scale > 0)) {
    return { type: 'empty' };
  }
  const localX = (screenX - transform.x) / transform.scale;
  const localY = (screenY - transform.y) / transform.scale;
  let picked: UnitSnapshot | null = null;
  let pickedDistance = Infinity;
  for (const unit of units) {
    if (unit.tags.includes('hidden')) {
      continue;
    }
    const point = unprojectPoint(projection, localX, localY, unit.height);
    if (!point) {
      continue;
    }
    const distance = Math.hypot(unit.x - point.x, unit.y - point.y);
    if (distance > UNIT_REACH) {
      continue;
    }
    if (picked && !closer(unit, distance, picked, pickedDistance)) {
      continue;
    }
    picked = unit;
    pickedDistance = distance;
  }
  if (picked) {
    return { type: 'unit', unitId: picked.id };
  }
  const levels = [
    ...new Set([0, ...tiles.map((tile) => heightAt(tile.x, tile.y))]),
  ].sort((a, b) => b - a);
  for (const level of levels) {
    const point = unprojectPoint(projection, localX, localY, level);
    if (!point) {
      continue;
    }
    // adding 0 turns a rounded −0 into 0
    const x = Math.round(point.x) + 0;
    const y = Math.round(point.y) + 0;
    if (x < 0 || y < 0 || x >= cols || y >= rows) {
      if (level === 0) {
        return { type: 'empty' };
      }
      continue;
    }
    if (level !== 0 && Math.abs(heightAt(x, y) - level) >= SAME_HEIGHT) {
      continue;
    }
    if (tiles.some((tile) => tile.x === x && tile.y === y)) {
      return { type: 'tile', x, y };
    }
    return { type: 'empty' };
  }
  return { type: 'empty' };
}
