import { attributeOf } from '#ability/effect/attribute.js';
import type { TileCoord } from '#contract/spec.js';
import { bodyInKeys, tileKey } from '#field/body/index.js';
import { rotateOffset } from '#field/direction/index.js';
import { type FieldGrid, gridOf } from '#field/grid/index.js';
import { defineComponent } from '#kernel/world/component.js';
import type { ContentContext } from '#port/context.js';
import type {
  BattleRegistry,
  SelectorDefinition,
  SelectorQuery,
} from '#port/definition.js';
import { BLOCK, blockerOf, blockingOf } from '#unit/block/hold.js';
import {
  type BattleWorld,
  requireUnit,
  type UnitState,
} from '#unit/record/index.js';

/** 按给出的顺序叠筛选和排序。单个字符串和一条只含它的名单相同。 */
export function selectUnits(
  registry: BattleRegistry,
  ctx: ContentContext,
  selectorId: string | readonly string[],
  unitIds: readonly string[],
  query: SelectorQuery,
): readonly string[] {
  const ids = typeof selectorId === 'string' ? [selectorId] : selectorId;
  let chosen = [...unitIds];
  const sorts: SelectorDefinition[] = [];
  for (const id of ids) {
    const selector = registry.requireSelector(id);
    if (selector.kind !== 'sort') {
      chosen = chosen.filter((unitId) => selector.filter(unitId, ctx, query));
    }
    if (selector.kind !== 'filter') {
      sorts.push(selector);
    }
  }
  if (sorts.length === 0) {
    return chosen;
  }
  chosen.sort((left, right) => {
    for (const selector of sorts) {
      const order = selector.compare(left, right, ctx, query);
      if (order !== 0) {
        return order;
      }
    }
    return 0;
  });
  return chosen;
}

/** 内容加进攻击范围的绝对格子，换范围、换位置之后都留着，直到内容重新设置。不进技能触发的初始范围。 */
// TRACE: source/extra-range
export const EXTRA_RANGE = defineComponent<TileCoord[]>('target:extra-range', {
  create: () => [],
});

/** 设置额外的绝对格子；null 或空名单清掉。非整数、越出棋盘的格子丢掉，重复的只留一个。 */
export function setExtraRange(
  state: BattleWorld,
  unitId: string,
  tiles: readonly TileCoord[] | null,
): void {
  const table = state.components.access(EXTRA_RANGE);
  const grid = gridOf(state);
  const seen = new Set<string>();
  const kept: TileCoord[] = [];
  for (const tile of tiles ?? []) {
    if (
      !Number.isInteger(tile.x) ||
      !Number.isInteger(tile.y) ||
      !grid.inBounds(tile.x, tile.y)
    ) {
      continue;
    }
    const key = tileKey(tile.x, tile.y);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    kept.push({ x: tile.x, y: tile.y });
  }
  if (kept.length === 0) {
    table.delete(unitId);
  } else {
    table.set(unitId, kept);
  }
}

/** 面向 RIGHT 的范围格旋转后的绝对格子，加上内容的额外格子。越出棋盘的格子不算。 */
export function absoluteRangeTiles(
  grid: FieldGrid,
  unitId: string,
  state: BattleWorld,
  registry: BattleRegistry,
): ReadonlySet<string> {
  const origin = requireUnit(state, unitId);
  const originX = Math.round(origin.x);
  const originY = Math.round(origin.y);
  const extend = rangeExtendOf(origin, registry);
  const extra = state.components.access(EXTRA_RANGE).get(unitId);
  // 结果只取决于所在格、朝向、延伸格数和额外格子；四样都没变就用上次算的。攻击范围本身建好后不再改，棋盘边界整场不变
  const cached = RANGE_CACHE.get(origin);
  if (
    cached &&
    cached.grid === grid &&
    cached.x === originX &&
    cached.y === originY &&
    cached.facing === origin.facing &&
    cached.extend === extend &&
    cached.extra === extra
  ) {
    return cached.keys;
  }
  const keys = new Set<string>();
  if (Number.isInteger(originX) && Number.isInteger(originY)) {
    for (const cell of extendedRange(origin.attackRange, extend)) {
      if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) {
        continue;
      }
      const [dRow, dCol] = rotateOffset(cell.y, cell.x, origin.facing);
      const x = originX + dCol;
      const y = originY + dRow;
      if (!grid.inBounds(x, y)) {
        continue;
      }
      keys.add(tileKey(x, y));
    }
    for (const tile of extra ?? []) {
      keys.add(tileKey(tile.x, tile.y));
    }
  }
  RANGE_CACHE.set(origin, {
    grid,
    x: originX,
    y: originY,
    facing: origin.facing,
    extend,
    extra,
    keys,
  });
  return keys;
}

interface RangeEntry {
  readonly grid: FieldGrid;
  readonly x: number;
  readonly y: number;
  readonly facing: UnitState['facing'];
  readonly extend: number;
  readonly extra: readonly TileCoord[] | undefined;
  readonly keys: ReadonlySet<string>;
}

/** 每个单位上一次算出的攻击范围格子。只是缓存，不进状态与快照。 */
const RANGE_CACHE = new WeakMap<UnitState, RangeEntry>();

export function unitsInRange(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unitId: string,
  selectorId: string | readonly string[],
): readonly string[] {
  const origin = requireUnit(state, unitId);
  const grid = gridOf(state);
  const keys = absoluteRangeTiles(grid, unitId, state, registry);
  const inside: string[] = [];
  const seen = new Set<string>();
  const add = (id: string): void => {
    if (id === origin.id || seen.has(id) || !state.units.has(id)) {
      return;
    }
    seen.add(id);
    inside.push(id);
  };
  for (const unit of state.units.values()) {
    if (unit.id === origin.id) {
      continue;
    }
    if (bodyInKeys(unit, keys, grid.rect)) {
      add(unit.id);
    }
  }
  for (const id of blockingOf(state, origin.id)) {
    add(id);
  }
  const blocker = blockerOf(state, origin.id);
  if (blocker !== null) {
    add(blocker);
  }
  const blocks = state.components.access(BLOCK);
  for (const unit of state.units.values()) {
    if (blocks.get(unit.id)?.blockedBy === origin.id) {
      add(unit.id);
    }
  }
  return selectUnits(registry, ctx, selectorId, inside, { origin: unitId });
}

/**
 * 攻击范围的延伸：rangeExtend（随技能、限时效果结束的）加 rangeExtendBase（永久的）。
 * 把每一行再往面向 RIGHT 的列方向延伸这么多格，然后再旋转。
 */
function rangeExtendOf(unit: UnitState, registry: BattleRegistry): number {
  return extendCells(
    attributeOf(unit, registry, 'rangeExtend') +
      attributeOf(unit, registry, RANGE_EXTEND_BASE),
  );
}

/** 永久的攻击距离：整场部署期间一直在、不随技能或限时效果结束的延伸（模组、天赋、常驻增益）。技能触发只看它。 */
// TRACE: source/range-extend-base
export const RANGE_EXTEND_BASE = 'rangeExtendBase';

/** 只算永久延伸的攻击范围格子（面向 RIGHT），给技能触发的初始范围用。 */
export function baseRange(
  unit: UnitState,
  registry: BattleRegistry,
): readonly TileCoord[] {
  return extendedRange(
    unit.attackRange,
    extendCells(attributeOf(unit, registry, RANGE_EXTEND_BASE)),
  );
}

/** 只算永久延伸地延伸给定的格子。 */
export function baseExtended(
  cells: readonly TileCoord[],
  unit: UnitState,
  registry: BattleRegistry,
): readonly TileCoord[] {
  return extendedRange(
    cells,
    extendCells(attributeOf(unit, registry, RANGE_EXTEND_BASE)),
  );
}

function extendCells(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.min(32, Math.floor(value));
}

function extendedRange(
  range: readonly TileCoord[],
  extend: number,
): readonly TileCoord[] {
  if (!(extend > 0)) {
    return range;
  }
  const maxByRow = new Map<number, number>();
  for (const cell of range) {
    if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) {
      continue;
    }
    maxByRow.set(
      cell.y,
      Math.max(maxByRow.get(cell.y) ?? Number.NEGATIVE_INFINITY, cell.x),
    );
  }
  const cells = [...range];
  for (const [row, maxCol] of maxByRow) {
    for (let step = 1; step <= extend; step += 1) {
      cells.push({ x: maxCol + step, y: row });
    }
  }
  return cells;
}
