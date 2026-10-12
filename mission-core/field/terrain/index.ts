import { defineCondition } from '#ability/effect/condition.js';
import { holdConditionalEffect, sustainEffect } from '#ability/effect/index.js';
import type { TileCoord } from '#contract/spec.js';
import { type FieldGrid, gridOf } from '#field/grid/index.js';
import { routeHidden } from '#field/grid/route.js';
import { emit } from '#kernel/event/index.js';
import { defineExtensible } from '#kernel/registry/extensible.js';
import { TICK } from '#kernel/tick/index.js';
import { defineComponent } from '#kernel/world/component.js';
import type { ContentContext } from '#port/context.js';
import type { BattleRegistry, TerrainDefinition } from '#port/definition.js';
import {
  type BattleWorld,
  isFlying,
  type UnitState,
} from '#unit/record/index.js';

/** 单位当前所站的地形：地形 id、进入的拍、这次停留里 onStay 触发的次数。 */
export interface TerrainStanding {
  readonly terrain: string;
  readonly since: number;
  readonly count: number;
}

/** 站位。只记站在地形上的单位；再部署时清掉。 */
export const TERRAIN_STANDING = defineComponent<TerrainStanding>(
  'terrain:standing',
  {
    create: () => ({ terrain: '', since: 0, count: 0 }),
    reset: 'clear',
  },
);

/** 地形施加的效果记在这个来源名下。 */
export function terrainSource(id: string): string {
  return `terrain:${id}`;
}

/** 写出一种地形的定义。 */
export function defineTerrain(
  id: string,
  definition: Omit<TerrainDefinition, 'id'>,
): TerrainDefinition {
  checkTerrain(id, definition);
  return Object.freeze({ id, ...definition });
}

function checkTerrain(
  id: string,
  definition: Omit<TerrainDefinition, 'id'>,
): void {
  const { pathCost, tieBreak, period, linger } = definition;
  if (
    pathCost !== undefined &&
    !(Number.isInteger(pathCost) && pathCost >= 1)
  ) {
    throw new RangeError(`terrain ${id}: pathCost must be a positive integer`);
  }
  if (
    tieBreak !== undefined &&
    !(Number.isInteger(tieBreak) && tieBreak >= 0)
  ) {
    throw new RangeError(
      `terrain ${id}: tieBreak must be a non-negative integer`,
    );
  }
  if (period !== undefined && !(period > 0)) {
    throw new RangeError(`terrain ${id}: period must be positive`);
  }
  if (typeof linger === 'number' && !(linger > 0)) {
    throw new RangeError(`terrain ${id}: linger must be positive`);
  }
}

/** 接上地形定义：规格与改过的地形 id 都要已注册。建战斗与导入之后各调一次。 */
export function bindTerrains(
  state: BattleWorld,
  registry: BattleRegistry,
): void {
  gridOf(state).attachTerrains((id) => registry.requireTerrain(id));
}

function standingTile(unit: UnitState): TileCoord {
  return { x: Math.round(unit.x), y: Math.round(unit.y) };
}

/** 单位这一拍受哪种地形影响。不在场、倒下、路线隐藏、装置与不在 affects 里的单位没有。 */
function terrainOf(
  state: BattleWorld,
  registry: BattleRegistry,
  grid: FieldGrid,
  unit: UnitState,
  tile: TileCoord,
): TerrainDefinition | null {
  if (
    !unit.fielded ||
    unit.downed ||
    unit.kind === 'device' ||
    (unit.attributes.hp ?? 0) <= 0 ||
    routeHidden(state, unit.id)
  ) {
    return null;
  }
  const id = grid.terrainAt(tile.x, tile.y);
  if (id === null) {
    return null;
  }
  const definition = registry.requireTerrain(id);
  const affects = definition.affects;
  if (affects?.sides && !affects.sides.includes(unit.side)) {
    return null;
  }
  if (isFlying(unit) && affects?.airborne !== true) {
    return null;
  }
  return definition;
}

function periodTicks(definition: TerrainDefinition): number {
  return Math.max(1, Math.round((definition.period ?? 0) / TICK));
}

/** 有 linger 时补时或施加计时效果；没有时按地形来源挂上或取下一条条件效果。 */
function holdTerrainEffect(
  state: BattleWorld,
  registry: BattleRegistry,
  definition: TerrainDefinition,
  unit: UnitState,
  ctx: ContentContext,
  held: boolean,
): void {
  const effect = definition.effect;
  if (effect === undefined) {
    return;
  }
  const linger = definition.linger;
  if (linger === undefined) {
    holdConditionalEffect(
      state,
      registry,
      ctx,
      unit,
      terrainSource(definition.id),
      effect,
      undefined,
      held,
    );
    return;
  }
  if (!held) {
    return;
  }
  const seconds = typeof linger === 'number' ? linger : linger(ctx);
  if (!(seconds > 0)) {
    return;
  }
  const ticks = Math.max(1, Math.round(seconds / TICK));
  if (sustainEffect(unit, effect, ticks)) {
    return;
  }
  ctx.applyEffect(unit.id, effect, {
    duration: seconds,
    sourceId: terrainSource(definition.id),
  });
}

/**
 * 站位系统：按单位所站的格子（四舍五入到格）判定地形。地形变了时先离开旧的（送 terrain-leave，没有 linger 时取下
 * 这块地形挂的那条效果，调 onLeave），再进入新的（送 terrain-enter，挂上效果，调 onEnter）；有 period 时进入那一拍与
 * 之后每个周期调 onStay。有 linger 时站在上面每拍把效果补满时长。规格里没有地形、也没改过地形时什么都不做。
 */
export function registerTerrainSystem(
  registry: BattleRegistry,
  state: BattleWorld,
): void {
  registry.registerSystem({
    id: 'engine:terrain',
    slot: 'status',
    priority: 0,
    before: ['engine:conditional-effects'],
    run(ctx) {
      const grid = gridOf(state);
      if (!grid.terrained()) {
        return;
      }
      const standing = state.components.access(TERRAIN_STANDING);
      for (const unit of [...state.units.values()]) {
        const tile = standingTile(unit);
        const current = standing.get(unit.id);
        const next = terrainOf(state, registry, grid, unit, tile);
        if (current && current.terrain !== next?.id) {
          const left = registry.requireTerrain(current.terrain);
          standing.delete(unit.id);
          emit(state, 'terrain-leave', {
            unitId: unit.id,
            terrain: left.id,
            x: tile.x,
            y: tile.y,
          });
          holdTerrainEffect(state, registry, left, unit, ctx, false);
          left.onLeave?.(unit.id, ctx);
        }
        if (!next) {
          continue;
        }
        const held = standing.get(unit.id);
        if (!held) {
          standing.set(unit.id, {
            terrain: next.id,
            since: state.tick,
            count: 0,
          });
          emit(state, 'terrain-enter', {
            unitId: unit.id,
            terrain: next.id,
            x: tile.x,
            y: tile.y,
          });
          holdTerrainEffect(state, registry, next, unit, ctx, true);
          next.onEnter?.(unit.id, ctx);
        } else if (next.linger !== undefined) {
          holdTerrainEffect(state, registry, next, unit, ctx, true);
        }
        if (next.period === undefined) {
          continue;
        }
        const now = standing.get(unit.id);
        if (!now || now.terrain !== next.id) {
          continue;
        }
        const due =
          1 + Math.floor((state.tick - now.since) / periodTicks(next));
        if (due > now.count) {
          standing.set(unit.id, { ...now, count: due });
          next.onStay?.(unit.id, ctx, due);
        }
      }
    },
  });
}

/** 条件 `on-terrain`：单位正受某种地形影响。params.terrain 写地形 id，缺省任一地形。 */
export function registerTerrainCondition(
  registry: BattleRegistry,
  state: BattleWorld,
): void {
  registry.registerCondition(
    defineCondition('on-terrain', (unitId, params) => {
      const standing = state.components.access(TERRAIN_STANDING).get(unitId);
      if (!standing) {
        return false;
      }
      return (
        typeof params.terrain !== 'string' ||
        params.terrain === standing.terrain
      );
    }),
  );
  registry.markExtensible(
    defineExtensible('on-terrain', { version: 1, contract: 'condition' }),
  );
}
