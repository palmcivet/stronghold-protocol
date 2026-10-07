import type { ContentContext, MissionModule } from "#port/content.js"
import { emit } from "#battle/state.js"
import { sessionOf } from "#battle/session.js"
import { resetSkills } from "#battle/skill/point.js"
import { attributeOf, maxHpOf } from "#battle/unit/attribute.js"
import { clearElements } from "#battle/unit/element.js"
import type { UnitState } from "#battle/unit/index.js"

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
        const { state, registry } = sessionOf(runCtx)
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
          clearElements(unit)
          unit.bursting = false
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
  const need = stat(unit, "respawnTime") * redeployMul(ctx, unit)
  if (elapsed + READY_EPSILON < need) {
    ctx.advanceTimer(unit.id, "redeploy")
    elapsed = seconds(ctx.timerView(unit.id, "redeploy").elapsed)
  }
  return elapsed + READY_EPSILON >= need
}

function tileOpen(ctx: ContentContext, unit: UnitState): boolean {
  const { state, registry } = sessionOf(ctx)
  const strategyId = state.spec.deployStrategy
  if (strategyId === null) return true
  const strategy = registry.requireDeployStrategy(strategyId)
  return strategy.canStand(unit.id, { x: Math.round(unit.x), y: Math.round(unit.y) }, ctx)
}

function redeployMul(ctx: ContentContext, unit: UnitState): number {
  const { registry } = sessionOf(ctx)
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
