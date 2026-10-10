import type { BattleSnapshot, UnitSnapshot } from "#contract/snapshot.js"
import { overlaySkillAttributes } from "#ability/skill/modifier.js"
import { grantedTagIds, specTagIds, type UnitState } from "#unit/record/index.js"
import { HIDDEN } from "#port/tag.js"

/** 把单位持有的标签、路线消失、属性和元素槽抄成快照。flags 是规格以外来源授予的标签，tags 是规格写的标签。 */
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
  const flags = new Set(grantedTagIds(unit))
  if (unit.routeHidden) flags.add(HIDDEN.id)
  return {
    id: unit.id,
    side: unit.side,
    kind: unit.kind,
    x: unit.x,
    y: unit.y,
    attributes,
    flags: [...flags].sort(),
    attackRange: unit.attackRange.map((cell) => ({ x: cell.x, y: cell.y })),
    tags: [...specTagIds(unit)],
    deployPositions: [...unit.deployPositions],
    elements,
    blocking: [...unit.blocking],
    blockedBy: unit.blockedBy,
    boomerangsOut: unit.boomerangsOut,
  }
}
