import { absoluteRangeTiles } from '#combat/target/selector.js';
import type { Direction } from '#contract/spec.js';
import { tileKey } from '#field/body/index.js';
import { gridOf } from '#field/grid/index.js';
import { routeHidden } from '#field/grid/route.js';
import { defineComponent } from '#kernel/world/component.js';
import { hasTag } from '#kernel/world/tag.js';
import type { BattleRegistry, ZoneDefinition } from '#port/definition.js';
import type { BattleWorld, UnitState } from '#unit/record/index.js';

/** 单位上一拍的坐标，与它所在的各作用区（作用区 id → 装置 id）。 */
export interface ZoneStanding {
  readonly x: number;
  readonly y: number;
  readonly zones: Readonly<Record<string, string>>;
}

/** 作用区站位。只在场上有作用区装置时记；再部署时清掉。 */
export const ZONE_STANDING = defineComponent<ZoneStanding>('zone:standing', {
  create: () => ({ x: 0, y: 0, zones: {} }),
  reset: 'clear',
});

/** 写出一种装置作用区。 */
export function defineZone(
  id: string,
  definition: Omit<ZoneDefinition, 'id'>,
): ZoneDefinition {
  return Object.freeze({ id, ...definition });
}

interface Cover {
  readonly deviceId: string;
  readonly facing: Direction;
}

function emits(unit: UnitState): boolean {
  return unit.fielded && !unit.downed && (unit.attributes.hp ?? 0) > 0;
}

function visitor(state: BattleWorld, unit: UnitState): boolean {
  return emits(unit) && unit.kind !== 'device' && !routeHidden(state, unit.id);
}

/** 每种作用区：格子 → 覆盖它的装置。入场晚的装置盖过早的。 */
function covers(
  state: BattleWorld,
  registry: BattleRegistry,
  zones: readonly ZoneDefinition[],
): Map<string, Map<string, Cover>> | null {
  let found: Map<string, Map<string, Cover>> | null = null;
  const grid = gridOf(state);
  for (const zone of zones) {
    for (const unit of state.units.values()) {
      if (!emits(unit) || !hasTag(unit, zone.source)) {
        continue;
      }
      found ??= new Map();
      let tiles = found.get(zone.id);
      if (!tiles) {
        tiles = new Map();
        found.set(zone.id, tiles);
      }
      for (const key of absoluteRangeTiles(grid, unit.id, state, registry)) {
        tiles.set(key, { deviceId: unit.id, facing: unit.facing });
      }
    }
  }
  return found;
}

/**
 * 作用区系统：带作用区标签的在场单位按攻击范围与朝向圈出格子。单位所站的格子（四舍五入）在里面时每拍调 onStay，
 * 离开、倒下或作用区消失时调 onLeave。场上从没有过作用区装置时什么都不做。
 */
export function registerZoneSystem(
  registry: BattleRegistry,
  state: BattleWorld,
): void {
  // 用过站位表的战斗。没用过时不碰组件表，导出不变
  const touched = new WeakMap<BattleWorld, boolean>();
  const used = (): boolean => {
    let known = touched.get(state);
    if (known === undefined) {
      known = ZONE_STANDING.id in state.components.export();
      touched.set(state, known);
    }
    return known;
  };
  registry.registerSystem({
    id: 'engine:zones',
    slot: 'status',
    priority: 0,
    after: ['engine:terrain'],
    before: ['engine:conditional-effects'],
    run(ctx) {
      const zones = registry.zones();
      if (zones.length === 0) {
        return;
      }
      const found = covers(state, registry, zones);
      if (!found && !used()) {
        return;
      }
      touched.set(state, true);
      const standing = state.components.access(ZONE_STANDING);
      for (const unit of [...state.units.values()]) {
        const before = standing.get(unit.id);
        if (!visitor(state, unit)) {
          if (before) {
            standing.delete(unit.id);
            for (const id of Object.keys(before.zones)) {
              registry.requireZone(id).onLeave?.(unit.id, ctx);
            }
          }
          continue;
        }
        const key = tileKey(Math.round(unit.x), Math.round(unit.y));
        const moved = before
          ? { dx: unit.x - before.x, dy: unit.y - before.y }
          : null;
        const inside: Record<string, string> = {};
        for (const zone of zones) {
          const cover = found?.get(zone.id)?.get(key);
          if (cover) {
            inside[zone.id] = cover.deviceId;
          }
        }
        standing.set(unit.id, { x: unit.x, y: unit.y, zones: inside });
        for (const id of Object.keys(before?.zones ?? {})) {
          if (!(id in inside)) {
            registry.requireZone(id).onLeave?.(unit.id, ctx);
          }
        }
        for (const zone of zones) {
          const cover = found?.get(zone.id)?.get(key);
          if (cover) {
            zone.onStay(unit.id, ctx, {
              deviceId: cover.deviceId,
              facing: cover.facing,
              moved,
            });
          }
        }
      }
    },
  });
}
