import type { BattleSnapshot, UnitSnapshot } from "#contract/snapshot.js"
import { overlaySkillAttributes } from "#battle/skill/modifier.js"
import type { UnitState } from "#battle/unit/index.js"

/** 把单位上已经写好的标志、路线消失、属性和元素槽抄成快照。 */
export function readSnapshot(tick: number, units: Iterable<UnitState>): BattleSnapshot {
  const snapshots: UnitSnapshot[] = []
  for (const unit of units) snapshots.push(readUnit(unit))
  snapshots.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
  return { tick, units: snapshots }
}

function readUnit(unit: UnitState): UnitSnapshot {
  const attributes: Record<string, number> = {}
  for (const [key, value] of Object.entries(unit.attributes)) attributes[key] = value
  overlaySkillAttributes(unit, attributes)
  const elements: Record<string, number> = {}
  for (const [id, slot] of unit.elements) elements[id] = slot.value
  const flags = new Set(unit.flags)
  if (unit.routeHidden) flags.add("hidden")
  return {
    id: unit.id,
    side: unit.side,
    x: unit.x,
    y: unit.y,
    attributes,
    flags: [...flags].sort(),
    attackRange: unit.attackRange.map((cell) => ({ x: cell.x, y: cell.y })),
    tags: [...unit.tags],
    deployPositions: [...unit.deployPositions],
    elements,
  }
}
