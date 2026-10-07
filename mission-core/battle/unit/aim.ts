import type { ContentContext } from "#port/content.js"
import type { BattleRegistry } from "#battle/registry.js"
import type { BattleState } from "#battle/state.js"
import { selectUnits, unitsInRange } from "#battle/target/selector.js"
import { maxHpOf } from "#battle/unit/attribute.js"
import type { UnitState } from "#battle/unit/index.js"

const ALLY_QUERY = [
  "enemy",
  "fly",
  "stealth",
  "sleep",
  "untargetable",
  "isolated",
  "range",
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
export function attackTargetIds(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
): readonly string[] {
  const shape = unit.attackShape
  if (shape?.damage === "heal") return pickHeals(state, registry, ctx, unit)
  const query = unit.side === "enemy" ? ENEMY_QUERY : ALLY_QUERY
  const found = unitsInRange(state, registry, ctx, unit.id, query)
  if (shape?.lockRange === true) return found
  return found.slice(0, 1)
}

export function attackHasTarget(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
): boolean {
  return attackTargetIds(state, registry, ctx, unit).length > 0
}

function pickHeals(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
): readonly string[] {
  const shape = unit.attackShape
  const query = [unit.side, "untargetable", "isolated", "range", "hp-ratio", "spawn"] as const
  const found = unitsInRange(state, registry, ctx, unit.id, query).filter((id) => healable(state, registry, unit, id))
  if (healable(state, registry, unit, unit.id)) found.push(unit.id)
  const ordered = selectUnits(registry, ctx, ["hp-ratio", "spawn"], found)
  if (shape?.lockRange === true) return ordered
  const count = shape?.healCount
  const limit = count === undefined ? 1 : Math.max(0, Math.floor(count))
  return ordered.slice(0, limit)
}

function healable(state: BattleState, registry: BattleRegistry, healer: UnitState, unitId: string): boolean {
  const unit = state.units.get(unitId)
  if (!unit || !unit.fielded || unit.downed || unit.routeHidden || (unit.attributes.hp ?? 0) <= 0) return false
  if (unit.id !== healer.id && unit.flags.has("noHeal")) return false
  return (unit.attributes.hp ?? 0) + 1e-6 < maxHpOf(unit, registry)
}
