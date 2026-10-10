import type { BattleRegistry } from "#port/definition.js"
import type { BattleWorld } from "#unit/record/index.js"
import { dropStatus } from "#ability/effect/tag.js"

/** 敌人身上有麻痹时，这一次普攻被取消并消耗一层。 */
export function interruptEnemyAttack(state: BattleWorld, registry: BattleRegistry, unitId: string): boolean {
  const unit = state.units.get(unitId)
  if (!unit || unit.side !== "enemy") return false
  const palsy = unit.statuses.find((status) => status.id === "palsy" && !status.dropped)
  if (!palsy || !(palsy.stacks > 0)) return false
  palsy.stacks -= 1
  if (palsy.stacks <= 0) dropStatus(registry, unit, "palsy")
  return true
}
