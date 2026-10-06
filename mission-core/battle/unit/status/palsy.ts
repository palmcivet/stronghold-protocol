import type { BattleRegistry } from "#battle/registry.js"
import type { BattleState } from "#battle/state.js"
import { dropStatus } from "#battle/unit/status/flags.js"

/** 敌人身上有麻痹时，这一次普攻被取消并消耗一层。 */
export function interruptEnemyAttack(state: BattleState, registry: BattleRegistry, unitId: string): boolean {
  const unit = state.units.get(unitId)
  if (!unit || unit.side !== "enemy") return false
  const palsy = unit.statuses.find((status) => status.id === "palsy" && !status.dropped)
  if (!palsy || !(palsy.stacks > 0)) return false
  palsy.stacks -= 1
  if (palsy.stacks <= 0) dropStatus(registry, unit, "palsy")
  return true
}
