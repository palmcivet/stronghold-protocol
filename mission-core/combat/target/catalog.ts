import type { BattleRegistry, SelectorDefinition, SelectorQuery } from "#port/definition.js"
import { CAMOU, CAN_HIT_FLY, ISOLATED, LIFTOFF, REVEAL, SLEEP, STEALTH, STEALTH_OFF, UNTARGETABLE } from "#port/tag.js"
import { hasTag } from "#kernel/world/tag.js"
import { bodyDist, bodyInKeys } from "#field/body/index.js"
import { gridOf } from "#field/grid/index.js"
import { remainingDistance, routeHidden } from "#field/grid/route.js"
import { blockerOf, blockingOf } from "#unit/block/hold.js"
import { targetPriorityOf } from "#combat/target/priority.js"
import { absoluteRangeTiles } from "#combat/target/selector.js"
import { attributeOf, maxHpOf } from "#ability/effect/attribute.js"
import { isFlying, type BattleWorld, type UnitState } from "#unit/record/index.js"

export function registerBuiltinSelectors(state: BattleWorld, registry: BattleRegistry): void {
  registry.registerSelector({
    id: "all",
    filter: () => true,
    compare: () => 0,
  })
  for (const definition of filters(state, registry)) registry.registerSelector(definition)
  for (const definition of sorts(state, registry)) registry.registerSelector(definition)
}

// MARK: filter

function filters(state: BattleWorld, registry: BattleRegistry): readonly SelectorDefinition[] {
  return [
    keep("enemy", (unitId, query) => sideOf(state, query, unitId, "enemy")),
    keep("ally", (unitId, query) => sideOf(state, query, unitId, "ally")),
    keep("fly", (unitId, query) => allowsFly(state, query, unitId)),
    keep("stealth", (unitId, query) => visible(state, query, unitId)),
    keep("camouflage", (unitId, query) => plainAttackSees(state, query, unitId)),
    keep("area", (unitId, query) => areaSees(state, query, unitId)),
    keep("liftoff", (unitId, query) => groundCanReach(state, query, unitId)),
    without("sleep", state, (unit) => hasTag(unit, SLEEP)),
    without("untargetable", state, (unit) => hasTag(unit, UNTARGETABLE)),
    keep("isolated", (unitId, query) => notIsolatedFromAlly(state, query, unitId)),
    keep("range", (unitId, query) => insideRange(state, registry, query, unitId)),
  ]
}

function sideOf(state: BattleWorld, query: SelectorQuery, unitId: string, side: UnitState["side"]): boolean {
  const unit = state.units.get(unitId)
  const source = attacker(state, query)
  if (!unit || !living(state, unit)) return false
  if (source && unit.id === source.id) return false
  return unit.side === side
}

function allowsFly(state: BattleWorld, query: SelectorQuery, unitId: string): boolean {
  const unit = state.units.get(unitId)
  if (!unit || !isFlying(unit)) return true
  const source = attacker(state, query)
  return source !== null && canHitFly(source)
}

/** 隐匿在被阻挡或显形之后可以打到。 */
function visible(state: BattleWorld, query: SelectorQuery, unitId: string): boolean {
  const unit = state.units.get(unitId)
  if (!unit || !hidden(unit)) return true
  const source = attacker(state, query)
  if (unit.side === "enemy") return blockerOf(state, unitId) !== null
  return source !== null && blockerOf(state, source.id) === unit.id
}

/** 迷彩挡住敌方普通攻击，挡不住正在挡这个敌人的干员。 */
function plainAttackSees(state: BattleWorld, query: SelectorQuery, unitId: string): boolean {
  const unit = state.units.get(unitId)
  if (!unit || !hasTag(unit, CAMOU)) return true
  const source = attacker(state, query)
  if (!source || source.side !== "enemy") return true
  return blockerOf(state, source.id) === unit.id
}

/** 范围效果不看迷彩，隐匿即使挡着施法者也不选。 */
function areaSees(state: BattleWorld, query: SelectorQuery, unitId: string): boolean {
  const unit = state.units.get(unitId)
  if (!unit || !living(state, unit)) return false
  if (hasTag(unit, UNTARGETABLE) || hasTag(unit, SLEEP)) return false
  if (hidden(unit)) return false
  return groundCanReach(state, query, unitId)
}

function groundCanReach(state: BattleWorld, query: SelectorQuery, unitId: string): boolean {
  const unit = state.units.get(unitId)
  if (!unit || !hasTag(unit, LIFTOFF)) return true
  const source = attacker(state, query)
  if (!source || source.side !== "enemy" || isFlying(source)) return true
  return false
}

function notIsolatedFromAlly(state: BattleWorld, query: SelectorQuery, unitId: string): boolean {
  const unit = state.units.get(unitId)
  if (!unit || !hasTag(unit, ISOLATED)) return true
  const source = attacker(state, query)
  if (!source) return false
  return source.side !== unit.side
}

function insideRange(state: BattleWorld, registry: BattleRegistry, query: SelectorQuery, unitId: string): boolean {
  const source = attacker(state, query)
  const unit = state.units.get(unitId)
  if (!source || !unit) return false
  if (blockingOf(state, source.id).includes(unitId) || blockerOf(state, unitId) === source.id) return true
  const grid = gridOf(state)
  return bodyInKeys(unit, absoluteRangeTiles(grid, source.id, state, registry), grid.rect)
}

// MARK: sort

function sorts(state: BattleWorld, registry: BattleRegistry): readonly SelectorDefinition[] {
  return [
    order("block", (left, right, query) => blockRank(state, query, left) - blockRank(state, query, right)),
    order("priority", (left, right, query) => priorityRank(state, registry, query, left) - priorityRank(state, registry, query, right)),
    order("taunt", (left, right) => tauntOf(state, registry, right) - tauntOf(state, registry, left)),
    order("aggro", (left, right) => aggroOf(state, right) - aggroOf(state, left)),
    order("remaining", (left, right) => pathOf(state, left) - pathOf(state, right)),
    order("hp-ratio", (left, right) => ratioOf(state, registry, left) - ratioOf(state, registry, right)),
    order("defense", (left, right) => defenseOf(state, registry, left) - defenseOf(state, registry, right)),
    order("distance", (left, right, query) => distanceOf(state, query, left) - distanceOf(state, query, right)),
    order("spawn", (left, right) => spawnOf(state, left) - spawnOf(state, right)),
  ]
}

function blockRank(state: BattleWorld, query: SelectorQuery, unitId: string): number {
  const source = attacker(state, query)
  const unit = state.units.get(unitId)
  if (!source || !unit) return 1
  if (source.side === "ally") return blockerOf(state, unitId) === source.id ? 0 : 1
  return blockerOf(state, source.id) === unit.id ? 0 : 1
}

function priorityRank(state: BattleWorld, registry: BattleRegistry, query: SelectorQuery, unitId: string): number {
  const source = attacker(state, query)
  const unit = state.units.get(unitId)
  if (!source || !unit) return 0
  const priority = targetPriorityOf(state, source.id)
  if (priority === "") return 0
  return priorityValue(state, registry, query, unit, priority)
}

function priorityValue(
  state: BattleWorld,
  registry: BattleRegistry,
  query: SelectorQuery,
  unit: UnitState,
  priority: string,
): number {
  if (priority === "fly") return isFlying(unit) ? 0 : 1
  if (priority === "ground") return isFlying(unit) ? 1 : 0
  if (priority === "defense") return defenseOf(state, registry, unit.id)
  if (priority === "high-defense") return -defenseOf(state, registry, unit.id)
  if (priority === "hp-ratio") return ratioOf(state, registry, unit.id)
  if (priority === "distance") return distanceOf(state, query, unit.id)
  if (priority === "farthest") return -distanceOf(state, query, unit.id)
  if (priority === "ranged") return Number(unit.script.attackReach ?? 0) > 1 ? 0 : 1
  return 0
}

function tauntOf(state: BattleWorld, registry: BattleRegistry, unitId: string): number {
  const unit = state.units.get(unitId)
  if (!unit) return 0
  return attributeOf(unit, registry, "taunt")
}

function aggroOf(state: BattleWorld, unitId: string): number {
  return state.units.get(unitId)?.aggroSeq ?? 0
}

function pathOf(state: BattleWorld, unitId: string): number {
  const unit = state.units.get(unitId)
  if (!unit) return 0
  return remainingDistance(state, unit)
}

function ratioOf(state: BattleWorld, registry: BattleRegistry, unitId: string): number {
  const unit = state.units.get(unitId)
  if (!unit) return 0
  const max = maxHpOf(unit, registry)
  if (!(max > 0)) return 0
  return (unit.attributes.hp ?? 0) / max
}

function defenseOf(state: BattleWorld, registry: BattleRegistry, unitId: string): number {
  const unit = state.units.get(unitId)
  if (!unit) return 0
  return attributeOf(unit, registry, "def")
}

function distanceOf(state: BattleWorld, query: SelectorQuery, unitId: string): number {
  const source = attacker(state, query)
  const unit = state.units.get(unitId)
  if (!source || !unit) return 0
  return bodyDist(unit, source.x, source.y)
}

function spawnOf(state: BattleWorld, unitId: string): number {
  return state.units.get(unitId)?.spawnSeq ?? 0
}

// MARK: unit

function attacker(state: BattleWorld, query: SelectorQuery): UnitState | null {
  if (!query.origin) return null
  return state.units.get(query.origin) ?? null
}

function living(state: BattleWorld, unit: UnitState): boolean {
  return unit.fielded && !unit.downed && !routeHidden(state, unit.id) && (unit.attributes.hp ?? 0) > 0
}

/** 隐匿且没有显形、没有在破隐期。 */
function hidden(unit: UnitState): boolean {
  return hasTag(unit, STEALTH) && !hasTag(unit, REVEAL) && !hasTag(unit, STEALTH_OFF)
}

function canHitFly(unit: UnitState): boolean {
  return hasTag(unit, CAN_HIT_FLY) || (unit.attributes.canHitFly ?? 0) > 0
}

function keep(id: string, filter: (unitId: string, query: SelectorQuery) => boolean): SelectorDefinition {
  return { id, kind: "filter", filter: (unitId, _ctx, query) => filter(unitId, query), compare: () => 0 }
}

/** 去掉满足条件的单位。 */
function without(id: string, state: BattleWorld, excluded: (unit: UnitState) => boolean): SelectorDefinition {
  return keep(id, (unitId) => {
    const unit = state.units.get(unitId)
    return !unit || !excluded(unit)
  })
}

function order(id: string, compare: (left: string, right: string, query: SelectorQuery) => number): SelectorDefinition {
  return { id, kind: "sort", filter: () => true, compare: (left, right, _ctx, query) => compare(left, right, query) }
}
