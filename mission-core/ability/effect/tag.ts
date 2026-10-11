import { grantTag, revokeSources } from "#kernel/world/tag.js"
import type { BattleRegistry } from "#port/definition.js"
import type { UnitState } from "#unit/record/index.js"

/** 效果授予标签的来源前缀，后面接效果 id。 */
export const EFFECT_SOURCE = "status:"

/** 技能授予标签的来源前缀，后面接技能 id。 */
export const SKILL_SOURCE = "skill:"

function fromEffect(sourceId: string): boolean {
  return sourceId.startsWith(EFFECT_SOURCE) || sourceId.startsWith(SKILL_SOURCE)
}

/** 按身上的效果与正在生效的技能重新授予标签。规格与模块授予的标签不动。 */
export function refreshTags(registry: BattleRegistry, unit: UnitState): void {
  revokeSources(unit, fromEffect)
  for (const status of unit.effects) {
    if (status.dropped) continue
    for (const key of registry.requireEffect(status.id).grantsTags) grantTag(unit, key, `${EFFECT_SOURCE}${status.id}`)
  }
  for (const skill of unit.skills) {
    if (!skill.effectsApplied) continue
    for (const id of skill.skillFlags) grantTag(unit, registry.requireTag(id), `${SKILL_SOURCE}${skill.id}`)
  }
}

/** 取下一个效果并重新授予标签。 */
export function dropEffect(registry: BattleRegistry, unit: UnitState, statusId: string): void {
  const status = unit.effects.find((item) => item.id === statusId)
  if (!status || status.dropped) return
  status.dropped = true
  const index = unit.effects.indexOf(status)
  if (index >= 0) unit.effects.splice(index, 1)
  refreshTags(registry, unit)
}
