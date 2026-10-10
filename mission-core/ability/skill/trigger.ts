import type { ContentContext } from "#port/content.js"
import type { BattleRegistry } from "#kernel/registry/index.js"
import { rotateOffset } from "#field/direction/index.js"
import { bodyInKeys, tileKey } from "#field/body/index.js"
import { requireUnit, type BattleState } from "#battle/state.js"
import { maxHpOf } from "#ability/effect/attribute.js"
import { isFlying, type SkillInstance, type UnitState } from "#unit/record/index.js"

export function registerBuiltinSkillTriggers(state: BattleState, registry: BattleRegistry): void {
  registry.registerSkillTrigger({
    id: "DEFAULT",
    shouldCast: (unitId, skillId) => defaultCondition(state, registry, unitId, skillId),
  })
  registry.registerSkillTrigger({
    id: "SKILL_RANGE",
    shouldCast: (unitId, skillId) => skillRange(state, registry, unitId, skillId),
  })
  registry.registerSkillTrigger({
    id: "TAKE_DAMAGE",
    shouldCast: (unitId, skillId) => skillOf(state, unitId, skillId).hurtPending,
  })
  registry.registerSkillTrigger({
    id: "SP_FULL",
    shouldCast: () => true,
  })
  registry.registerSkillTrigger({
    id: "CUSTOM_RANGE",
    shouldCast: (unitId, skillId) => customRange(state, registry, unitId, skillId),
  })
  registry.registerSkillTrigger({
    id: "SEARCH",
    shouldCast: (unitId, skillId) => defaultCondition(state, registry, unitId, skillId),
  })
  registry.registerSkillTrigger({
    id: "GDGLOW_SKILL_2",
    shouldCast: (unitId, skillId) => fieldTarget(state, registry, unitId, skillId),
  })
  registry.registerSkillTrigger({
    id: "NEVER",
    shouldCast: () => false,
  })
}

export function shouldCast(
  state: BattleState,
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
export function allyTriggerMet(state: BattleState, registry: BattleRegistry, unitId: string, skillId: string): boolean {
  const unit = requireUnit(state, unitId)
  const skill = skillOf(state, unitId, skillId)
  return injuredIn(state, registry, unit, allyKeys(state, unit, skill), skill.triggerHpAtMost)
}

// MARK: rules

function defaultCondition(state: BattleState, registry: BattleRegistry, unitId: string, skillId: string): boolean {
  const unit = requireUnit(state, unitId)
  const skill = skillOf(state, unitId, skillId)
  const keys = rotatedKeys(state, unit, unit.attackRange)
  if (skill.heal) return injuredIn(state, registry, unit, keys, 1)
  return enemyIn(state, unit, keys, false, hitsFly(unit))
}

function skillRange(state: BattleState, registry: BattleRegistry, unitId: string, skillId: string): boolean {
  const unit = requireUnit(state, unitId)
  const skill = skillOf(state, unitId, skillId)
  if (skill.triggerAllies) return allyTriggerMet(state, registry, unitId, skillId)
  if (skill.triggerRange.length === 0) return defaultCondition(state, registry, unitId, skillId)
  return enemyIn(state, unit, rotatedKeys(state, unit, skill.triggerRange), true, true)
}

function customRange(state: BattleState, registry: BattleRegistry, unitId: string, skillId: string): boolean {
  const unit = requireUnit(state, unitId)
  const skill = skillOf(state, unitId, skillId)
  if (skill.triggerRange.length === 0) return defaultCondition(state, registry, unitId, skillId)
  return enemyIn(state, unit, rotatedKeys(state, unit, skill.triggerRange), false, true)
}

function fieldTarget(state: BattleState, registry: BattleRegistry, unitId: string, skillId: string): boolean {
  const unit = requireUnit(state, unitId)
  const skill = skillOf(state, unitId, skillId)
  if (skill.heal) return injuredIn(state, registry, unit, null, 1)
  return enemyIn(state, unit, null, false, true)
}

// MARK: query

function skillOf(state: BattleState, unitId: string, skillId: string): SkillInstance {
  const unit = requireUnit(state, unitId)
  const skill = unit.skills.find((item) => item.id === skillId)
  if (!skill) throw new Error(`技能不存在: ${skillId}`)
  return skill
}

function allyKeys(state: BattleState, unit: UnitState, skill: SkillInstance): ReadonlySet<string> | null {
  const cells = skill.triggerRange.length > 0 ? skill.triggerRange : unit.attackRange
  return rotatedKeys(state, unit, cells)
}

function rotatedKeys(
  state: BattleState,
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
    if (!state.grid.inBounds(x, y)) continue
    keys.add(tileKey(x, y))
  }
  return keys
}

function enemyIn(
  state: BattleState,
  attacker: UnitState,
  keys: ReadonlySet<string> | null,
  ignoreUntargetable: boolean,
  fly: boolean,
): boolean {
  for (const unit of state.units.values()) {
    if (unit.side !== "enemy" || unit.id === attacker.id || !alive(unit)) continue
    if (!ignoreUntargetable && !selectable(unit)) continue
    if (!fly && flyingBlocked(attacker, unit)) continue
    if (keys && !bodyInKeys(unit, keys, state.grid.rect)) continue
    return true
  }
  return false
}

function injuredIn(
  state: BattleState,
  registry: BattleRegistry,
  owner: UnitState,
  keys: ReadonlySet<string> | null,
  hpAtMost: number,
): boolean {
  for (const unit of state.units.values()) {
    if (unit.id === owner.id || unit.side !== owner.side || !alive(unit)) continue
    if (keys && !bodyInKeys(unit, keys, state.grid.rect)) continue
    const max = maxHpOf(unit, registry)
    const hp = unit.attributes.hp ?? 0
    if (!(hp < max - 1e-9)) continue
    if (hp / max <= hpAtMost + 1e-9) return true
  }
  return false
}

function alive(unit: UnitState): boolean {
  return unit.fielded && !unit.downed && (unit.attributes.hp ?? 0) > 0
}

function selectable(unit: UnitState): boolean {
  if (unit.flags.has("untargetable")) return false
  if (unit.flags.has("stealth") && !unit.flags.has("reveal") && !unit.flags.has("stealthOff")) return false
  return true
}

function hitsFly(unit: UnitState): boolean {
  return unit.tags.includes("canHitFly") || (unit.attributes.canHitFly ?? 0) > 0
}

function flyingBlocked(attacker: UnitState, target: UnitState): boolean {
  return isFlying(target) && !hitsFly(attacker)
}
