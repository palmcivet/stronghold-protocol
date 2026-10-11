import type { RouteSpec } from '#contract/spec.js';
import type { FieldGrid, FlowField, GridRect } from '#field/grid/index.js';
import type { GridPoint } from '#field/grid/sight.js';
import { SPATIAL_EPSILON } from '#kernel/math/epsilon.js';
import { hypot } from '#kernel/math/hypot.js';
import { READY_EPSILON } from '#kernel/tick/index.js';
import {
  type ComponentStore,
  defineComponent,
} from '#kernel/world/component.js';
import { blockerOf } from '#unit/block/hold.js';
import type { UnitState } from '#unit/record/index.js';

/** 每秒移动格数 = moveSpeed × MOVE_SCALE。 */
export const MOVE_SCALE = 0.5;

export interface RouteLeg {
  readonly t: 'move' | 'wait' | 'disappear' | 'appear';
  readonly x: number;
  readonly y: number;
  readonly time: number;
  readonly final: boolean;
}

export interface RouteRun {
  readonly legs: RouteLeg[];
  legIdx: number;
  pts: GridPoint[] | null;
  ptIdx: number;
  version: number;
  waitLeft: number | null;
}

/** 敌人的路线进度与路线消失。快照把消失写成 hidden 标签。 */
export interface RouteState {
  run: RouteRun | null;
  hidden: boolean;
}

export const ROUTE = defineComponent<RouteState>('grid:route', {
  create: () => ({ run: null, hidden: false }),
});

export function routeOf(
  world: { readonly components: ComponentStore },
  unitId: string,
): RouteState {
  return world.components.access(ROUTE).ensure(unitId);
}

/** 走到路线的消失段、还没到出现段。 */
export function routeHidden(
  world: { readonly components: ComponentStore },
  unitId: string,
): boolean {
  return world.components.access(ROUTE).get(unitId)?.hidden === true;
}

/** 路线改了，下一拍重新规划这一段。 */
export function replanRoute(
  world: { readonly components: ComponentStore },
  unitId: string,
): void {
  const run = world.components.access(ROUTE).get(unitId)?.run;
  if (run) {
    run.pts = null;
  }
}

export function compileRoute(
  route: RouteSpec | null,
  rect: GridRect,
): RouteRun | null {
  if (!route) {
    return null;
  }
  const clampX = (x: number): number => Math.max(rect.x0, Math.min(rect.x1, x));
  const clampY = (y: number): number => Math.max(rect.y0, Math.min(rect.y1, y));
  const legs: RouteLeg[] = [];
  for (const checkpoint of route.checkpoints) {
    if (checkpoint.type === 'move') {
      legs.push({
        t: 'move',
        x: clampX(checkpoint.x),
        y: clampY(checkpoint.y),
        time: 0,
        final: false,
      });
    } else if (checkpoint.type === 'wait') {
      const time = Number.isFinite(checkpoint.time)
        ? Math.max(0, checkpoint.time)
        : 0;
      legs.push({ t: 'wait', x: 0, y: 0, time, final: false });
    } else if (checkpoint.type === 'disappear') {
      legs.push({ t: 'disappear', x: 0, y: 0, time: 0, final: false });
    } else {
      legs.push({
        t: 'appear',
        x: clampX(checkpoint.x),
        y: clampY(checkpoint.y),
        time: 0,
        final: false,
      });
    }
  }
  if (route.end) {
    legs.push({
      t: 'move',
      x: clampX(route.end.x),
      y: clampY(route.end.y),
      time: 0,
      final: true,
    });
  }
  if (legs.length === 0) {
    return null;
  }
  return { legs, legIdx: 0, pts: null, ptIdx: 0, version: -1, waitLeft: null };
}

function legField(
  grid: FieldGrid,
  x: number,
  y: number,
  key: number,
): FlowField | null {
  const live = grid.flowField(x, y);
  if (key >= 0 && (live.dist[key] ?? -1) >= 0) {
    return live;
  }
  const open = grid.flowField(x, y, { ignoreObstacles: true });
  if (key >= 0 && (open.dist[key] ?? -1) >= 0) {
    return open;
  }
  return null;
}

function planLeg(
  grid: FieldGrid,
  unit: UnitState,
  route: RouteRun,
  leg: RouteLeg,
): void {
  let points: GridPoint[];
  if (unit.motion === 'FLY') {
    points = [{ x: leg.x, y: leg.y }];
  } else {
    const tileX = Math.max(
      grid.rect.x0,
      Math.min(grid.rect.x1, Math.round(unit.x)),
    );
    const tileY = Math.max(
      grid.rect.y0,
      Math.min(grid.rect.y1, Math.round(unit.y)),
    );
    const key = grid.inBounds(tileX, tileY) ? grid.key(tileX, tileY) : -1;
    const field = legField(grid, leg.x, leg.y, key);
    points = [];
    if (field && key >= 0) {
      let cursor = key;
      let guard = grid.cols * 32;
      while (cursor !== field.dest && guard > 0) {
        guard -= 1;
        cursor = field.next[cursor] ?? -1;
        if (cursor < 0) {
          break;
        }
        points.push(grid.point(cursor));
      }
    }
    const last = points[points.length - 1];
    if (!last || last.x !== leg.x || last.y !== leg.y) {
      points.push({ x: leg.x, y: leg.y });
    }
    const first = points[0];
    if (
      field &&
      first &&
      (unit.x !== tileX || unit.y !== tileY) &&
      !grid.straightClear(unit.x, unit.y, first)
    ) {
      points.unshift({ x: tileX, y: tileY });
    }
  }
  route.pts = points;
  route.ptIdx = 0;
  route.version = grid.version;
}

/** 敌人沿路线推进 dt 秒。飞行直飞检查点，地面走平滑流场。已经有阻挡者时这一拍停住。 */
export function advanceRoute(
  world: { readonly components: ComponentStore },
  grid: FieldGrid,
  unit: UnitState,
  dt: number,
  tilesPerSecond?: number,
  standing = false,
): void {
  if (unit.side !== 'enemy' || !unit.fielded || unit.downed) {
    return;
  }
  const state = world.components.access(ROUTE).get(unit.id);
  const route = state?.run;
  if (!state || !route || blockerOf(world, unit.id)) {
    return;
  }
  let budget = dt;
  let guard = 16;
  while (budget > READY_EPSILON && guard > 0) {
    guard -= 1;
    const leg = route.legs[route.legIdx];
    if (!leg) {
      return;
    }
    if (leg.t === 'wait') {
      if (route.waitLeft === null) {
        route.waitLeft = leg.time;
      }
      const use = Math.min(budget, route.waitLeft);
      route.waitLeft -= use;
      budget -= use;
      if (route.waitLeft <= READY_EPSILON) {
        route.waitLeft = null;
        route.legIdx += 1;
        route.pts = null;
      }
      continue;
    }
    if (leg.t === 'disappear') {
      state.hidden = true;
      route.legIdx += 1;
      route.pts = null;
      continue;
    }
    if (leg.t === 'appear') {
      unit.x = leg.x;
      unit.y = leg.y;
      state.hidden = false;
      // 出现是强制切换状态机，结束失衡
      unit.unbalanceUntil = null;
      route.legIdx += 1;
      route.pts = null;
      continue;
    }
    if (standing) {
      return;
    }
    if (!route.pts || route.version !== grid.version) {
      planLeg(grid, unit, route, leg);
    }
    const speed =
      tilesPerSecond ?? (unit.attributes.moveSpeed ?? 0) * MOVE_SCALE;
    if (!(speed > 0)) {
      return;
    }
    let distance = speed * budget;
    let steps = 64;
    while (distance > SPATIAL_EPSILON && steps > 0) {
      steps -= 1;
      if (!route.pts || route.version !== grid.version) {
        planLeg(grid, unit, route, leg);
      }
      if (!route.pts || route.ptIdx >= route.pts.length) {
        break;
      }
      const point = route.pts[route.ptIdx];
      if (!point) {
        break;
      }
      const dx = point.x - unit.x;
      const dy = point.y - unit.y;
      const length = hypot(dx, dy);
      if (length <= distance) {
        unit.x = point.x;
        unit.y = point.y;
        distance -= length;
        route.ptIdx += 1;
      } else {
        unit.x += (dx / length) * distance;
        unit.y += (dy / length) * distance;
        distance = 0;
      }
    }
    budget = distance / speed;
    if (route.pts && route.ptIdx >= route.pts.length) {
      if (leg.final) {
        route.legIdx = route.legs.length;
        return;
      }
      route.legIdx += 1;
      route.pts = null;
    }
  }
}

/**
 * 沿还没走完的移动段量到终点的路程。这一段按已经规划的路点量；之后的地面段按平滑流场的长度，飞行段量直线；
 * 出现段把起点挪到出现的位置。没有路线时是 0。
 */
export function remainingDistance(
  world: { readonly components: ComponentStore },
  unit: UnitState,
  grid: FieldGrid,
): number {
  const route = world.components.access(ROUTE).get(unit.id)?.run;
  if (!route) {
    return 0;
  }
  let total = 0;
  let x = unit.x;
  let y = unit.y;
  for (let index = route.legIdx; index < route.legs.length; index += 1) {
    const leg = route.legs[index];
    if (!leg) {
      continue;
    }
    if (leg.t === 'appear') {
      x = leg.x;
      y = leg.y;
      continue;
    }
    if (leg.t !== 'move') {
      continue;
    }
    if (index === route.legIdx && route.pts && route.ptIdx < route.pts.length) {
      for (
        let pointIndex = route.ptIdx;
        pointIndex < route.pts.length;
        pointIndex += 1
      ) {
        const point = route.pts[pointIndex];
        if (!point) {
          continue;
        }
        total += hypot(point.x - x, point.y - y);
        x = point.x;
        y = point.y;
      }
      continue;
    }
    total +=
      index === route.legIdx
        ? hypot(leg.x - x, leg.y - y)
        : legLength(grid, unit, x, y, leg);
    x = leg.x;
    y = leg.y;
  }
  return total;
}

/** 从路点 (x, y) 走到这一段终点的长度：地面按平滑流场，飞行或起点在格子外时量直线。 */
function legLength(
  grid: FieldGrid,
  unit: UnitState,
  x: number,
  y: number,
  leg: RouteLeg,
): number {
  const straight = hypot(leg.x - x, leg.y - y);
  if (unit.motion === 'FLY') {
    return straight;
  }
  const tileX = Math.round(x);
  const tileY = Math.round(y);
  if (!grid.inBounds(tileX, tileY)) {
    return straight;
  }
  const key = grid.key(tileX, tileY);
  const field = legField(grid, leg.x, leg.y, key);
  const length = field ? grid.fieldLength(field, key) : Infinity;
  return Number.isFinite(length) ? length : straight;
}
