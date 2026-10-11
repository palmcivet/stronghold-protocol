import type { ContentContext } from "#port/context.js"
import type { MissionModule } from "#port/module.js"
import { emit } from "#kernel/event/index.js"
import { resetSkills } from "#ability/skill/point.js"
import { attributeOf, maxHpOf } from "#ability/effect/attribute.js"
import { clearElements } from "#combat/element/index.js"
import { peekGauges } from "#combat/element/gauge.js"
import { engineOf, markDeployed, type UnitState } from "#unit/record/index.js"
import type { BattleRegistry } from "#port/definition.js"

const READY_EPSILON = 1e-6

/** 再部署等待秒数乘上这个属性。缺省 1，走属性汇总。 */
export const REDEPLOY_MUL_ATTRIBUTE = "redeployMul"

export const redeployModule: MissionModule = {
  id: "redeploy",
  install(ctx) {
    ctx.registerSystem({
      id: "redeploy",
      slot: "redeploy",
      priority: 0,
      run(runCtx) {
        const { world: state, registry } = engineOf(runCtx)
        for (const unit of state.units.values()) {
          if (!unit.downed) continue
          if (!countdownFinished(runCtx, unit)) continue
          if (!tileOpen(runCtx, unit)) continue
          if (!runCtx.spendCost(unit.side, stat(unit, "cost"))) continue
          unit.downed = false
          unit.fielded = true
          unit.attributes.hp = maxHpOf(unit, registry)
          const timer = unit.timers.get("redeploy")
          if (timer) timer.elapsed = 0
          clearElements(state, unit.id)
          const gauges = peekGauges(state, unit.id)
          if (gauges) gauges.bursting = false
          state.components.reset(unit.id)
          markDeployed(unit)
          resetSkills(state, registry, runCtx, unit)
          emit(state, "deploy", { unitId: unit.id })
        }
      },
    })
  },
}

/** 倒地期间按秒累加。到点之后停住，费用不够就留在这一拍继续等。 */
function countdownFinished(ctx: ContentContext, unit: UnitState): boolean {
  if (!ctx.timerView(unit.id, "redeploy").started) ctx.startTimer(unit.id, "redeploy")
  let elapsed = seconds(ctx.timerView(unit.id, "redeploy").elapsed)
  const need = redeployDuration(engineOf(ctx).registry, unit)
  if (elapsed + READY_EPSILON < need) {
    ctx.advanceTimer(unit.id, "redeploy")
    elapsed = seconds(ctx.timerView(unit.id, "redeploy").elapsed)
  }
  return elapsed + READY_EPSILON >= need
}

function tileOpen(ctx: ContentContext, unit: UnitState): boolean {
  const { world: state, registry } = engineOf(ctx)
  const strategyId = state.spec.deployStrategy
  if (strategyId === null) return true
  const strategy = registry.requireDeployStrategy(strategyId)
  return strategy.canStand(unit.id, { x: Math.round(unit.x), y: Math.round(unit.y) }, ctx)
}

/** 倒下之后要等的秒数：respawnTime 乘上再部署倍率。 */
export function redeployDuration(registry: BattleRegistry, unit: UnitState): number {
  return stat(unit, "respawnTime") * redeployMul(registry, unit)
}

function redeployMul(registry: BattleRegistry, unit: UnitState): number {
  const assumed = unit.base[REDEPLOY_MUL_ATTRIBUTE] === undefined
  if (assumed) unit.base[REDEPLOY_MUL_ATTRIBUTE] = 1
  const value = attributeOf(unit, registry, REDEPLOY_MUL_ATTRIBUTE)
  if (assumed) delete unit.base[REDEPLOY_MUL_ATTRIBUTE]
  if (!Number.isFinite(value) || value < 0) return 1
  return value
}

function stat(unit: UnitState, key: string): number {
  const value = unit.attributes[key]
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0
  return value
}

function seconds(value: string | number | boolean | undefined): number {
  return typeof value === "number" ? value : 0
}
