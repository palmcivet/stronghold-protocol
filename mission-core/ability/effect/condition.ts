import { defineExtensible } from "#kernel/registry/extensible.js"
import type { BattleRegistry, ConditionDefinition } from "#port/definition.js"
import type { BattleWorld } from "#unit/record/index.js"
import { holdConditionalEffect } from "#ability/effect/index.js"

/** 写出一份条件定义。 */
export function defineCondition(id: string, evaluate: ConditionDefinition["evaluate"]): ConditionDefinition {
  return { id, evaluate }
}

/** 攻击范围内的敌方不少于 params.count（缺省 1）。 */
export const ENEMIES_IN_RANGE: ConditionDefinition = defineCondition("enemies-in-range", (unitId, params, ctx) => {
  const count = typeof params.count === "number" && Number.isFinite(params.count) ? params.count : 1
  return ctx.unitsInRange(unitId, ["enemy", "range"]).length >= count
})

export function registerBuiltinConditions(registry: BattleRegistry): void {
  registry.registerCondition(ENEMIES_IN_RANGE)
  registry.markExtensible(defineExtensible(ENEMIES_IN_RANGE.id, { version: 1, contract: "condition" }))
}

/** 每拍在效果计时器之前，按条件挂上或取下规格里的条件效果。不在场或已倒下的单位全部取下。 */
// TRACE: assumed/condition-every-tick
export function registerConditionSystem(registry: BattleRegistry, state: BattleWorld): void {
  registry.registerSystem({
    id: "engine:conditional-effects",
    slot: "status",
    priority: 0,
    before: ["engine:status-timers"],
    run(ctx) {
      for (const unit of state.units.values()) {
        if (unit.conditionalEffects.length === 0) continue
        const present = unit.fielded && !unit.downed && !unit.removed
        unit.conditionalEffects.forEach((entry, index) => {
          const held = present && registry.requireCondition(entry.condition).evaluate(unit.id, entry.params ?? {}, ctx)
          holdConditionalEffect(state, registry, ctx, unit, `condition:${index}`, entry.effect, entry.value, held)
        })
      }
    },
  })
}
