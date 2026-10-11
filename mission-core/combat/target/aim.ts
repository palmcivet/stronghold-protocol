import { blockCount } from "#unit/block/index.js"
import type { ContentContext } from "#port/context.js"
import type { BattleRegistry } from "#port/definition.js"
import type { BattleWorld } from "#unit/record/index.js"
import { selectUnits, unitsInRange } from "#combat/target/selector.js"
import { maxHpOf } from "#ability/effect/attribute.js"
import { healBlocked } from "#combat/damage/heal.js"
import type { UnitState } from "#unit/record/index.js"
import { attackProfileOf } from "#combat/attack/profile.js"
import { routeHidden } from "#field/grid/route.js"
import { BLOCK_EPSILON } from "#kernel/math/epsilon.js"

const ALLY_QUERY = [
  "foe",
  "fly",
  "stealth",
  "sleep",
  "untargetable",
  "isolated",
  "range",
  "ally-target",
  "block",
  "priority",
  "taunt",
  "remaining",
  "distance",
  "spawn",
] as const

const ENEMY_QUERY = [
  "ally",
  "sleep",
  "stealth",
  "camouflage",
  "liftoff",
  "untargetable",
  "isolated",
  "range",
  "block",
  "priority",
  "taunt",
  "aggro",
  "distance",
] as const

/** 这一下攻击会打到的单位，和出手用的是同一份名单。 */
// TRACE: source/block-targets
export function attackTargetIds(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
): readonly string[] {
  const shape = attackProfileOf(state, unit.id).shape
  if (shape?.damage === "heal") return pickHeals(state, registry, ctx, unit)
  const base = unit.side === "enemy" ? ENEMY_QUERY : ALLY_QUERY
  const query = shape?.filters ? [...base, ...shape.filters] : base
  const found = unitsInRange(state, registry, ctx, unit.id, query)
  if (shape?.lockRange === true) return found
  if (shape?.blockTargets === true) return found.slice(0, Math.max(1, Math.floor(blockCount(unit, registry) + BLOCK_EPSILON)))
  return found.slice(0, 1)
}

export function attackHasTarget(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
): boolean {
  return attackTargetIds(state, registry, ctx, unit).length > 0
}

function pickHeals(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
): readonly string[] {
  const shape = attackProfileOf(state, unit.id).shape
  const query = [unit.side, "untargetable", "isolated", "range", "hp-ratio", "spawn", ...(shape?.filters ?? [])]
  const found = unitsInRange(state, registry, ctx, unit.id, query).filter((id) => healable(state, registry, ctx, unit, id))
  if (healable(state, registry, ctx, unit, unit.id)) found.push(unit.id)
  const ordered = selectUnits(registry, ctx, ["hp-ratio", "spawn"], found, { origin: null })
  if (shape?.lockRange === true) return ordered
  const count = shape?.healCount
  const limit = count === undefined ? 1 : Math.max(0, Math.floor(count))
  return ordered.slice(0, limit)
}

function healable(state: BattleWorld, registry: BattleRegistry, ctx: ContentContext, healer: UnitState, unitId: string): boolean {
  const unit = state.units.get(unitId)
  if (!unit || !unit.fielded || unit.downed || routeHidden(state, unitId) || (unit.attributes.hp ?? 0) <= 0) return false
  if (healBlocked(state, registry, ctx, healer.id, unit)) return false
  return (unit.attributes.hp ?? 0) + 1e-6 < maxHpOf(unit, registry)
}
