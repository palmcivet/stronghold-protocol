import type { SelectorDefinition } from "#port/content.js"
import type { BattleRegistry } from "#battle/registry.js"
import { bodyDist, bodyInKeys } from "#battle/space/body/index.js"
import { remainingDistance } from "#battle/space/grid/route.js"
import type { BattleState } from "#battle/state.js"
import { absoluteRangeTiles } from "#battle/target/selector.js"
import { attributeOf, maxHpOf } from "#battle/unit/attribute.js"
import { isFlying, type UnitState } from "#battle/unit/index.js"

export function registerBuiltinSelectors(state: BattleState, registry: BattleRegistry): void {
  registry.registerSelector({
    id: "all",
    filter: () => true,
    compare: () => 0,
  })
  for (const definition of filters(state)) registry.registerSelector(definition)
  for (const definition of sorts(state, registry)) registry.registerSelector(definition)
}

// MARK: filter

function filters(state: BattleState): readonly SelectorDefinition[] {
  return [
    narrow("enemy", (unitId) => sideOf(state, unitId, "enemy")),
    narrow("ally", (unitId) => sideOf(state, unitId, "ally")),
    narrow("fly", (unitId) => allowsFly(state, unitId)),
    narrow("stealth", (unitId) => visible(state, unitId)),
    narrow("camouflage", (unitId) => plainAttackSees(state, unitId)),
    narrow("area", (unitId) => areaSees(state, unitId)),
    narrow("liftoff", (unitId) => groundCanReach(state, unitId)),
    narrow("sleep", (unitId) => !flag(state, unitId, "sleep")),
    narrow("untargetable", (unitId) => !flag(state, unitId, "untargetable")),
    narrow("isolated", (unitId) => notIsolatedFromAlly(state, unitId)),
    narrow("range", (unitId) => insideRange(state, unitId)),
  ]
}

function sideOf(state: BattleState, unitId: string, side: UnitState["side"]): boolean {
  const unit = state.units.get(unitId)
  const source = attacker(state)
  if (!unit || !living(unit)) return false
  if (source && unit.id === source.id) return false
  return unit.side === side
}

function allowsFly(state: BattleState, unitId: string): boolean {
  const unit = state.units.get(unitId)
  if (!unit || !isFlying(unit)) return true
  const source = attacker(state)
  return source !== null && canHitFly(source)
}

/** 隐匿在被阻挡或显形之后可以打到。 */
function visible(state: BattleState, unitId: string): boolean {
  const unit = state.units.get(unitId)
  if (!unit || !unit.flags.has("stealth") || unit.flags.has("reveal")) return true
  const source = attacker(state)
  if (unit.side === "enemy") return unit.blockedBy !== null
  return source !== null && source.blockedBy === unit.id
}

/** 迷彩挡住敌方普通攻击，挡不住正在挡这个敌人的干员。 */
function plainAttackSees(state: BattleState, unitId: string): boolean {
  const unit = state.units.get(unitId)
  if (!unit || !unit.flags.has("camou")) return true
  const source = attacker(state)
  if (!source || source.side !== "enemy") return true
  return source.blockedBy === unit.id
}

/** 范围效果不看迷彩，隐匿即使挡着施法者也不选。 */
function areaSees(state: BattleState, unitId: string): boolean {
  const unit = state.units.get(unitId)
  if (!unit || !living(unit)) return false
  if (unit.flags.has("untargetable") || unit.flags.has("sleep") || unit.flags.has("stealth")) return false
  return groundCanReach(state, unitId)
}

function groundCanReach(state: BattleState, unitId: string): boolean {
  const unit = state.units.get(unitId)
  if (!unit || !unit.flags.has("liftoff")) return true
  const source = attacker(state)
  if (!source || source.side !== "enemy" || isFlying(source)) return true
  return false
}

function notIsolatedFromAlly(state: BattleState, unitId: string): boolean {
  const unit = state.units.get(unitId)
  if (!unit || !unit.flags.has("isolated")) return true
  const source = attacker(state)
  if (!source) return false
  return source.side !== unit.side
}

function insideRange(state: BattleState, unitId: string): boolean {
  const source = attacker(state)
  const unit = state.units.get(unitId)
  if (!source || !unit) return false
  if (source.blocking.includes(unitId) || unit.blockedBy === source.id) return true
  return bodyInKeys(unit, absoluteRangeTiles(state.grid, source.id, state), state.grid.rect)
}

// MARK: sort

function sorts(state: BattleState, registry: BattleRegistry): readonly SelectorDefinition[] {
  return [
    order("block", (left, right) => blockRank(state, left) - blockRank(state, right)),
    order("priority", (left, right) => priorityRank(state, registry, left) - priorityRank(state, registry, right)),
    order("taunt", (left, right) => tauntOf(state, registry, right) - tauntOf(state, registry, left)),
    order("aggro", (left, right) => aggroOf(state, right) - aggroOf(state, left)),
    order("remaining", (left, right) => pathOf(state, left) - pathOf(state, right)),
    order("hp-ratio", (left, right) => ratioOf(state, registry, left) - ratioOf(state, registry, right)),
    order("defense", (left, right) => defenseOf(state, registry, left) - defenseOf(state, registry, right)),
    order("distance", (left, right) => distanceOf(state, left) - distanceOf(state, right)),
    order("spawn", (left, right) => spawnOf(state, left) - spawnOf(state, right)),
  ]
}

function blockRank(state: BattleState, unitId: string): number {
  const source = attacker(state)
  const unit = state.units.get(unitId)
  if (!source || !unit) return 1
  if (source.side === "ally") return unit.blockedBy === source.id ? 0 : 1
  return source.blockedBy === unit.id ? 0 : 1
}

function priorityRank(state: BattleState, registry: BattleRegistry, unitId: string): number {
  const source = attacker(state)
  const unit = state.units.get(unitId)
  if (!source || !unit || source.targetPriority === "") return 0
  return priorityValue(state, registry, unit, source.targetPriority)
}

function priorityValue(state: BattleState, registry: BattleRegistry, unit: UnitState, priority: string): number {
  if (priority === "fly") return isFlying(unit) ? 0 : 1
  if (priority === "ground") return isFlying(unit) ? 1 : 0
  if (priority === "defense") return defenseOf(state, registry, unit.id)
  if (priority === "high-defense") return -defenseOf(state, registry, unit.id)
  if (priority === "hp-ratio") return ratioOf(state, registry, unit.id)
  if (priority === "distance") return distanceOf(state, unit.id)
  if (priority === "farthest") return -distanceOf(state, unit.id)
  return 0
}

function tauntOf(state: BattleState, registry: BattleRegistry, unitId: string): number {
  const unit = state.units.get(unitId)
  if (!unit) return 0
  return attributeOf(unit, registry, "taunt")
}

function aggroOf(state: BattleState, unitId: string): number {
  return state.units.get(unitId)?.aggroSeq ?? 0
}

function pathOf(state: BattleState, unitId: string): number {
  const unit = state.units.get(unitId)
  if (!unit) return 0
  return remainingDistance(unit)
}

function ratioOf(state: BattleState, registry: BattleRegistry, unitId: string): number {
  const unit = state.units.get(unitId)
  if (!unit) return 0
  const max = maxHpOf(unit, registry)
  if (!(max > 0)) return 0
  return (unit.attributes.hp ?? 0) / max
}

function defenseOf(state: BattleState, registry: BattleRegistry, unitId: string): number {
  const unit = state.units.get(unitId)
  if (!unit) return 0
  return attributeOf(unit, registry, "def")
}

function distanceOf(state: BattleState, unitId: string): number {
  const source = attacker(state)
  const unit = state.units.get(unitId)
  if (!source || !unit) return 0
  return bodyDist(unit, source.x, source.y)
}

function spawnOf(state: BattleState, unitId: string): number {
  return state.units.get(unitId)?.spawnSeq ?? 0
}

// MARK: unit

function attacker(state: BattleState): UnitState | null {
  if (!state.selectorOrigin) return null
  return state.units.get(state.selectorOrigin) ?? null
}

function living(unit: UnitState): boolean {
  return unit.fielded && !unit.downed && !unit.routeHidden && (unit.attributes.hp ?? 0) > 0
}

function flag(state: BattleState, unitId: string, name: string): boolean {
  return state.units.get(unitId)?.flags.has(name) ?? false
}

function canHitFly(unit: UnitState): boolean {
  return unit.tags.includes("canHitFly") || (unit.attributes.canHitFly ?? 0) > 0
}

function narrow(id: string, filter: SelectorDefinition["filter"]): SelectorDefinition {
  return { id, kind: "filter", filter, compare: () => 0 }
}

function order(id: string, compare: SelectorDefinition["compare"]): SelectorDefinition {
  return { id, kind: "sort", filter: () => true, compare }
}
