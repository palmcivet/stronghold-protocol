import type { BattleSnapshot, RedeploySnapshot, SkillSnapshot, UnitSnapshot } from "#contract/snapshot.js"
import type { BattleRegistry } from "#port/definition.js"
import { overlaySkillAttributes } from "#ability/skill/modifier.js"
import { sortedTagIds, type BattleWorld, type SkillInstance, type UnitState } from "#unit/record/index.js"
import { HIDDEN } from "#port/tag.js"
import { gridOf } from "#field/grid/index.js"
import { routeHidden } from "#field/grid/route.js"
import { peekGauges } from "#combat/element/gauge.js"
import { blockerOf, blockingOf } from "#unit/block/hold.js"
import { redeployDuration } from "#unit/deploy/redeploy.js"

/** 抄出每个单位的核心字段、标签、属性、元素槽、阻挡、技能读数与再部署计时，再加上组件给画面的显示值。按单位 id 排序。 */
export function readSnapshot(world: BattleWorld, registry: BattleRegistry): BattleSnapshot {
  const snapshots: UnitSnapshot[] = []
  for (const unit of world.units.values()) snapshots.push(readUnit(world, registry, unit))
  snapshots.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
  return { tick: world.tick, units: snapshots }
}

function readUnit(world: BattleWorld, registry: BattleRegistry, unit: UnitState): UnitSnapshot {
  const attributes: Record<string, number> = {}
  for (const [key, value] of Object.entries(unit.attributes)) attributes[key] = value
  overlaySkillAttributes(unit, attributes)
  const elements: Record<string, number> = {}
  const gauges = peekGauges(world, unit.id)
  if (gauges) for (const [id, slot] of gauges.slots) elements[id] = slot.value
  const held = sortedTagIds(unit)
  const tags = routeHidden(world, unit.id) && !held.includes(HIDDEN.id) ? [...held, HIDDEN.id].sort() : [...held]
  return {
    id: unit.id,
    side: unit.side,
    kind: unit.kind,
    x: unit.x,
    y: unit.y,
    facing: unit.facing,
    height: gridOf(world).at(Math.round(unit.x), Math.round(unit.y))?.height ?? 0,
    attributes,
    tags,
    attackRange: unit.attackRange.map((cell) => ({ x: cell.x, y: cell.y })),
    deployPositions: [...unit.deployPositions],
    elements,
    blocking: [...blockingOf(world, unit.id)],
    blockedBy: blockerOf(world, unit.id),
    skills: unit.skills.map((skill) => readSkill(unit, skill)),
    shield: shieldOf(unit),
    downed: unit.downed,
    redeploy: unit.downed ? readRedeploy(registry, unit) : null,
    components: world.components.views(unit.id),
  }
}

function readSkill(unit: UnitState, skill: SkillInstance): SkillSnapshot {
  const counting = skill.body === "ammo" && skill.active && unit.fielded && !unit.downed
  return {
    id: skill.id,
    sp: skill.sp,
    spCost: skill.spCost,
    charges: skill.charges,
    active: skill.active,
    ammo: counting ? { left: Math.ceil(skill.ammo), max: skill.ammoSpec } : null,
  }
}

function shieldOf(unit: UnitState): number {
  let total = unit.attributes.shield ?? 0
  for (const status of unit.statuses) if (!status.dropped && status.shield > 0) total += status.shield
  return total
}

function readRedeploy(registry: BattleRegistry, unit: UnitState): RedeploySnapshot {
  const timer = unit.timers.get("redeploy")
  const elapsed = typeof timer?.elapsed === "number" ? timer.elapsed : 0
  return { elapsed, duration: redeployDuration(registry, unit) }
}
