import { defineExtensible } from "#kernel/registry/extensible.js"
import type { ContentContext } from "#port/context.js"
import type { BattleRegistry, SkillTriggerDefinition } from "#port/definition.js"
import { rotateOffset } from "#field/direction/index.js"
import { bodyInKeys, tileKey } from "#field/body/index.js"
import { requireUnit, type BattleWorld } from "#unit/record/index.js"
import { maxHpOf } from "#ability/effect/attribute.js"
import { gridOf } from "#field/grid/index.js"
import { hasTag } from "#kernel/world/tag.js"
import { blockingOf } from "#unit/block/hold.js"
import { absoluteRangeTiles, baseExtended, baseRange } from "#combat/target/selector.js"
import { defineComponent } from "#kernel/world/component.js"
import type { TriggerArea } from "#contract/input.js"
import type { TileCoord } from "#contract/spec.js"
import { CAN_HIT_FLY, NO_RANGE_EXTEND, REVEAL, STEALTH, STEALTH_OFF, UNTARGETABLE } from "#port/tag.js"
import { isFlying, type SkillInstance, type UnitState } from "#unit/record/index.js"
import { attackProfileOf } from "#combat/attack/profile.js"
import { HEALTH_EPSILON } from "#kernel/math/epsilon.js"

export function registerBuiltinSkillTriggers(state: BattleWorld, registry: BattleRegistry): void {
  openTrigger(registry, {
    id: "DEFAULT",
    shouldCast: (unitId, skillId, ctx) => defaultCondition(state, registry, unitId, skillId, ctx),
  })
  openTrigger(registry, {
    id: "SKILL_RANGE",
    shouldCast: (unitId, skillId) => skillRange(state, registry, unitId, skillId),
  })
  openTrigger(registry, {
    id: "ACTIVE_RANGE",
    shouldCast: (unitId, skillId, ctx) => activeRange(state, registry, unitId, skillId, ctx),
  })
  openTrigger(registry, {
    id: "TAKE_DAMAGE",
    shouldCast: (unitId, skillId) => skillOf(state, unitId, skillId).hurtPending,
  })
  openTrigger(registry, {
    id: "SP_FULL",
    shouldCast: () => true,
  })
  openTrigger(registry, {
    id: "CUSTOM_RANGE",
    shouldCast: (unitId, skillId) => customRange(state, registry, unitId, skillId),
  })
  openTrigger(registry, {
    id: "SEARCH",
    shouldCast: (unitId, skillId, ctx) => defaultCondition(state, registry, unitId, skillId, ctx),
  })
  openTrigger(registry, {
    id: "GDGLOW_SKILL_2",
    shouldCast: (unitId, skillId) => fieldTarget(state, registry, unitId, skillId),
  })
  openTrigger(registry, {
    id: "NEVER",
    shouldCast: () => false,
  })
}

/** 注册内置技能触发并标成可扩展。 */
function openTrigger(registry: BattleRegistry, definition: SkillTriggerDefinition): void {
  registry.registerSkillTrigger(definition)
  registry.markExtensible(defineExtensible(definition.id, { version: 1, contract: "skill-trigger" }))
}

export function shouldCast(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unitId: string,
  skillId: string,
): boolean {
  const skill = skillOf(state, unitId, skillId)
  const trigger = registry.requireSkillTrigger(skill.trigger)
  return trigger.shouldCast(unitId, skillId, ctx)
}

/** DEFAULT 的友方附加条件：触发范围内有一名受伤友方，生命比例不超过 hpAtMost。 */
export function allyTriggerMet(state: BattleWorld, registry: BattleRegistry, unitId: string, skillId: string): boolean {
  const unit = requireUnit(state, unitId)
  const skill = skillOf(state, unitId, skillId)
  return injuredIn(state, registry, unit, allyKeys(state, registry, unit, skill), skill.triggerHpAtMost)
}

// MARK: rules

function defaultCondition(state: BattleWorld, registry: BattleRegistry, unitId: string, skillId: string, ctx?: ContentContext): boolean {
  const unit = requireUnit(state, unitId)
  return basicCondition(state, registry, unit, skillOf(state, unitId, skillId), baseRange(unit, registry), ctx)
}

/** 基础策略的条件放到 cells 上：治疗技能找受伤友方；否则找可选的敌人，自己挡着的敌人在不在范围里都算。 */
function basicCondition(
  state: BattleWorld,
  registry: BattleRegistry,
  unit: UnitState,
  skill: SkillInstance,
  cells: readonly { readonly x: number; readonly y: number }[],
  ctx?: ContentContext,
): boolean {
  const keys = rotatedKeys(state, unit, cells)
  if (skill.heal) return injuredIn(state, registry, unit, keys, 1)
  const accept = attackFilter(state, registry, unit, ctx)
  return enemyIn(state, unit, keys, false, hitsFly(unit), accept) || holdsEnemy(state, unit, accept)
}

/** 普攻追加的筛选器同样管基础策略：不过筛的敌人不让技能触发。 */
function attackFilter(state: BattleWorld, registry: BattleRegistry, unit: UnitState, ctx: ContentContext | undefined): ((id: string) => boolean) | null {
  const filters = attackProfileOf(state, unit.id).shape?.filters
  if (!filters || !ctx) return null
  const query = { origin: unit.id }
  return (id) => filters.every((filterId) => registry.requireSelector(filterId).filter(id, ctx, query))
}

/** 持续时的攻击范围比自身范围大的技能：基础策略的条件放到触发范围（持续时的范围）上，每拍都问。 */
// TRACE: source/active-range
function activeRange(state: BattleWorld, registry: BattleRegistry, unitId: string, skillId: string, ctx: ContentContext): boolean {
  const unit = requireUnit(state, unitId)
  const skill = skillOf(state, unitId, skillId)
  if (skill.triggerRange.length === 0) return basicCondition(state, registry, unit, skill, baseRange(unit, registry), ctx)
  const cells = skill.skillFlags.includes(NO_RANGE_EXTEND.id) ? skill.triggerRange : baseExtended(skill.triggerRange, unit, registry)
  return basicCondition(state, registry, unit, skill, cells, ctx)
}

function skillRange(state: BattleWorld, registry: BattleRegistry, unitId: string, skillId: string): boolean {
  const unit = requireUnit(state, unitId)
  const skill = skillOf(state, unitId, skillId)
  if (skill.triggerAllies) return allyTriggerMet(state, registry, unitId, skillId)
  if (skill.triggerRange.length === 0) return defaultCondition(state, registry, unitId, skillId)
  return enemyIn(state, unit, rotatedKeys(state, unit, skill.triggerRange), true, true)
}

function customRange(state: BattleWorld, registry: BattleRegistry, unitId: string, skillId: string): boolean {
  const unit = requireUnit(state, unitId)
  const skill = skillOf(state, unitId, skillId)
  if (skill.triggerRange.length === 0) return defaultCondition(state, registry, unitId, skillId)
  return enemyIn(state, unit, rotatedKeys(state, unit, skill.triggerRange), false, true)
}

function fieldTarget(state: BattleWorld, registry: BattleRegistry, unitId: string, skillId: string): boolean {
  const unit = requireUnit(state, unitId)
  const skill = skillOf(state, unitId, skillId)
  if (skill.heal) return injuredIn(state, registry, unit, null, 1)
  return enemyIn(state, unit, null, false, true)
}

// MARK: query

function skillOf(state: BattleWorld, unitId: string, skillId: string): SkillInstance {
  const unit = requireUnit(state, unitId)
  const skill = unit.skills.find((item) => item.id === skillId)
  if (!skill) throw new Error(`技能不存在: ${skillId}`)
  return skill
}

function allyKeys(state: BattleWorld, registry: BattleRegistry, unit: UnitState, skill: SkillInstance): ReadonlySet<string> | null {
  const cells = skill.triggerRange.length > 0 ? skill.triggerRange : baseRange(unit, registry)
  return rotatedKeys(state, unit, cells)
}

function rotatedKeys(
  state: BattleWorld,
  unit: UnitState,
  cells: readonly { readonly x: number; readonly y: number }[],
): Set<string> {
  const originX = Math.round(unit.x)
  const originY = Math.round(unit.y)
  const keys = new Set<string>()
  if (!Number.isInteger(originX) || !Number.isInteger(originY)) return keys
  for (const cell of cells) {
    if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) continue
    const [dRow, dCol] = rotateOffset(cell.y, cell.x, unit.facing)
    const x = originX + dCol
    const y = originY + dRow
    if (!gridOf(state).inBounds(x, y)) continue
    keys.add(tileKey(x, y))
  }
  return keys
}

function enemyIn(
  state: BattleWorld,
  attacker: UnitState,
  keys: ReadonlySet<string> | null,
  ignoreUntargetable: boolean,
  fly: boolean,
  accept: ((id: string) => boolean) | null = null,
): boolean {
  for (const unit of state.units.values()) {
    if (unit.side !== "enemy" || unit.id === attacker.id || !alive(unit)) continue
    if (!ignoreUntargetable && !selectable(unit)) continue
    if (!fly && flyingBlocked(attacker, unit)) continue
    if (keys && !bodyInKeys(unit, keys, gridOf(state).rect)) continue
    if (accept && !accept(unit.id)) continue
    return true
  }
  return false
}

function injuredIn(
  state: BattleWorld,
  registry: BattleRegistry,
  owner: UnitState,
  keys: ReadonlySet<string> | null,
  hpAtMost: number,
): boolean {
  for (const unit of state.units.values()) {
    if (unit.id === owner.id || unit.side !== owner.side || !alive(unit)) continue
    if (keys && !bodyInKeys(unit, keys, gridOf(state).rect)) continue
    const max = maxHpOf(unit, registry)
    const hp = unit.attributes.hp ?? 0
    if (!(hp < max - HEALTH_EPSILON)) continue
    if (hp / max <= hpAtMost + HEALTH_EPSILON) return true
  }
  return false
}

/** 自己挡着的、还活着且打得到的敌人。被阻挡的敌人总是阻挡者的目标，在不在范围里都算。 */
// TRACE: source/blocked-first
function holdsEnemy(state: BattleWorld, unit: UnitState, accept: ((id: string) => boolean) | null = null): boolean {
  for (const id of blockingOf(state, unit.id)) {
    const enemy = state.units.get(id)
    if (enemy && alive(enemy) && !flyingBlocked(unit, enemy) && (!accept || accept(id))) return true
  }
  return false
}

function alive(unit: UnitState): boolean {
  return unit.fielded && !unit.downed && (unit.attributes.hp ?? 0) > 0
}

function selectable(unit: UnitState): boolean {
  if (hasTag(unit, UNTARGETABLE)) return false
  if (hasTag(unit, STEALTH) && !hasTag(unit, REVEAL) && !hasTag(unit, STEALTH_OFF)) return false
  return true
}

function hitsFly(unit: UnitState): boolean {
  return hasTag(unit, CAN_HIT_FLY) || (unit.attributes.canHitFly ?? 0) > 0
}

function flyingBlocked(attacker: UnitState, target: UnitState): boolean {
  return isFlying(target) && !hitsFly(attacker)
}

/** 内容登记的技能触发区域，按登记的键。 */
// TRACE: source/trigger-area
export const TRIGGER_AREAS = defineComponent<Record<string, TriggerArea>>("skill:trigger-areas", { create: () => ({}) })

/** 登记或撤下（null）一块触发区域。 */
export function setTriggerArea(state: BattleWorld, unitId: string, key: string, area: TriggerArea | null): void {
  const table = state.components.access(TRIGGER_AREAS)
  if (area === null) {
    const areas = table.get(unitId)
    if (!areas) return
    delete areas[key]
    if (Object.keys(areas).length === 0) table.delete(unitId)
    return
  }
  table.ensure(unitId)[key] = Array.isArray(area) ? area.map((tile: TileCoord) => ({ x: tile.x, y: tile.y })) : { unitId: (area as { unitId: string }).unitId }
}

/** 内容的触发区域里有敌人（飞行的也算）。治疗技能不看这一条。 */
export function areaTriggerMet(state: BattleWorld, registry: BattleRegistry, unit: UnitState): boolean {
  const areas = state.components.access(TRIGGER_AREAS).get(unit.id)
  if (!areas) return false
  const grid = gridOf(state)
  for (const area of Object.values(areas)) {
    let keys: ReadonlySet<string>
    if (Array.isArray(area)) {
      keys = new Set(area.filter((tile: TileCoord) => grid.inBounds(tile.x, tile.y)).map((tile: TileCoord) => tileKey(tile.x, tile.y)))
    } else {
      const owner = state.units.get((area as { unitId: string }).unitId)
      if (!owner || !owner.fielded || owner.downed || owner.removed) continue
      keys = absoluteRangeTiles(grid, owner.id, state, registry)
    }
    if (keys.size > 0 && enemyIn(state, unit, keys, false, true)) return true
  }
  return false
}
