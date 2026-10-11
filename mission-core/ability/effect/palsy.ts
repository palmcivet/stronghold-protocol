import type { PalsyInterruptEvent } from "#contract/event.js"
import type { BattleRegistry } from "#port/definition.js"
import type { BattleWorld } from "#unit/record/index.js"
import { intercept } from "#kernel/event/index.js"
import { dropEffect } from "#ability/effect/tag.js"

/**
 * 敌人身上有麻痹时，这一次普攻被打断：先发可拦截的 palsy-interrupt，订阅者没有把 keep 改成 true 时用掉一层。
 * 订阅者里单位倒下或离场时这一层不再处理，普攻同样不打出。
 */
export function interruptEnemyAttack(state: BattleWorld, registry: BattleRegistry, unitId: string): boolean {
  const unit = state.units.get(unitId)
  if (!unit || unit.side !== "enemy") return false
  const palsy = unit.effects.find((effect) => effect.id === "palsy" && !effect.dropped)
  if (!palsy || !(palsy.stacks > 0)) return false
  const event: PalsyInterruptEvent = { unitId, stacks: palsy.stacks, keep: false }
  intercept(state, "palsy-interrupt", event)
  if (event.keep === true || palsy.dropped || unit.downed || unit.removed) return true
  palsy.stacks -= 1
  if (palsy.stacks <= 0) dropEffect(registry, unit, "palsy")
  return true
}
