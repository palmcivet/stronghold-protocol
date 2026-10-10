import type { BattleRegistry } from "#kernel/registry/index.js"
import { skillFlagsOf } from "#ability/skill/modifier.js"
import type { UnitState } from "#unit/record/index.js"

export function writeFlags(registry: BattleRegistry, unit: UnitState): void {
  unit.flags.clear()
  for (const status of unit.statuses) {
    if (status.dropped) continue
    const definition = registry.requireStatus(status.id)
    for (const flag of definition.flags) unit.flags.add(flag)
  }
  for (const flag of skillFlagsOf(unit)) unit.flags.add(flag)
}

export function immuneTo(registry: BattleRegistry, unit: UnitState, statusId: string): boolean {
  const incoming = registry.requireStatus(statusId)
  const key = incoming.immune
  if (key && unit.immunity.has(key)) return true
  for (const status of unit.statuses) {
    if (status.dropped) continue
    const definition = registry.requireStatus(status.id)
    if (definition.immunity.includes(statusId)) return true
    if (key && definition.immunity.includes(key)) return true
  }
  return false
}

export function dropStatus(registry: BattleRegistry, unit: UnitState, statusId: string): void {
  const status = unit.statuses.find((item) => item.id === statusId)
  if (!status || status.dropped) return
  status.dropped = true
  const index = unit.statuses.indexOf(status)
  if (index >= 0) unit.statuses.splice(index, 1)
  writeFlags(registry, unit)
}
