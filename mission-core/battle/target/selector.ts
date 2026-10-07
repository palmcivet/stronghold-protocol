import type { TileCoord } from "#contract/spec.js"
import { rotateOffset } from "#battle/space/direction/index.js"
import type { FieldGrid } from "#battle/space/grid/index.js"
import { bodyInKeys, tileKey } from "#battle/space/body/index.js"
import type { ContentContext, SelectorDefinition } from "#port/content.js"
import type { BattleRegistry } from "#battle/registry.js"
import { requireUnit, type BattleState } from "#battle/state.js"
import { attributeOf } from "#battle/unit/attribute.js"
import type { UnitState } from "#battle/unit/index.js"

/** 按给出的顺序叠筛选和排序。单个字符串和一条只含它的名单相同。 */
export function selectUnits(
  registry: BattleRegistry,
  ctx: ContentContext,
  selectorId: string | readonly string[],
  unitIds: readonly string[],
): readonly string[] {
  const ids = typeof selectorId === "string" ? [selectorId] : selectorId
  let chosen = [...unitIds]
  const sorts: SelectorDefinition[] = []
  for (const id of ids) {
    const selector = registry.requireSelector(id)
    if (selector.kind !== "sort") chosen = chosen.filter((unitId) => selector.filter(unitId, ctx))
    if (selector.kind !== "filter") sorts.push(selector)
  }
  if (sorts.length === 0) return chosen
  chosen.sort((left, right) => {
    for (const selector of sorts) {
      const order = selector.compare(left, right, ctx)
      if (order !== 0) return order
    }
    return 0
  })
  return chosen
}

/** 面向 RIGHT 的范围格旋转后的绝对格子。越出棋盘的格子不算。 */
export function absoluteRangeTiles(
  grid: FieldGrid,
  unitId: string,
  state: BattleState,
  registry: BattleRegistry,
): ReadonlySet<string> {
  const origin = requireUnit(state, unitId)
  const originX = Math.round(origin.x)
  const originY = Math.round(origin.y)
  const keys = new Set<string>()
  if (!Number.isInteger(originX) || !Number.isInteger(originY)) return keys
  for (const cell of extendedRange(origin.attackRange, rangeExtendOf(origin, registry))) {
    if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) continue
    const [dRow, dCol] = rotateOffset(cell.y, cell.x, origin.facing)
    const x = originX + dCol
    const y = originY + dRow
    if (!grid.inBounds(x, y)) continue
    keys.add(tileKey(x, y))
  }
  return keys
}

export function unitsInRange(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  unitId: string,
  selectorId: string | readonly string[],
): readonly string[] {
  const origin = requireUnit(state, unitId)
  const keys = absoluteRangeTiles(state.grid, unitId, state, registry)
  const inside: string[] = []
  const seen = new Set<string>()
  const add = (id: string): void => {
    if (id === origin.id || seen.has(id) || !state.units.has(id)) return
    seen.add(id)
    inside.push(id)
  }
  for (const unit of state.units.values()) {
    if (unit.id === origin.id) continue
    if (bodyInKeys(unit, keys, state.grid.rect)) add(unit.id)
  }
  for (const id of origin.blocking) add(id)
  for (const unit of state.units.values()) {
    if (unit.blockedBy === origin.id) add(unit.id)
  }
  const previous = state.selectorOrigin
  state.selectorOrigin = unitId
  try {
    return selectUnits(registry, ctx, selectorId, inside)
  } finally {
    state.selectorOrigin = previous
  }
}

/** 属性 rangeExtend 把每一行再往面向 RIGHT 的列方向延伸这么多格，然后再旋转。 */
function rangeExtendOf(unit: UnitState, registry: BattleRegistry): number {
  const value = attributeOf(unit, registry, "rangeExtend")
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.min(32, Math.floor(value))
}

function extendedRange(range: readonly TileCoord[], extend: number): readonly TileCoord[] {
  if (!(extend > 0)) return range
  const maxByRow = new Map<number, number>()
  for (const cell of range) {
    if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) continue
    maxByRow.set(cell.y, Math.max(maxByRow.get(cell.y) ?? Number.NEGATIVE_INFINITY, cell.x))
  }
  const cells = [...range]
  for (const [row, maxCol] of maxByRow) {
    for (let step = 1; step <= extend; step += 1) cells.push({ x: maxCol + step, y: row })
  }
  return cells
}
