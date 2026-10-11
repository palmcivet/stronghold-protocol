import { dropEffectsOnDown } from "#ability/effect/index.js"
import type { ContentContext } from "#port/context.js"
import type { TileCoord } from "#contract/spec.js"
import type { CommandRefusal, RedeployOrder } from "#contract/input.js"
import { defineComponent } from "#kernel/world/component.js"
import { emit } from "#kernel/event/index.js"
import { readTimer } from "#kernel/timer/index.js"
import { endSkillsOnDown, resetSkills } from "#ability/skill/point.js"
import { attributeOf, maxHpOf } from "#ability/effect/attribute.js"
import { clearElements } from "#combat/element/index.js"
import { peekGauges } from "#combat/element/gauge.js"
import { landShift } from "#field/motion/index.js"
import { engineOf, markDeployed, markLatestDeployed, type UnitState } from "#unit/record/index.js"
import { startTimer } from "#unit/record/timer.js"
import type { BattleRegistry } from "#port/definition.js"

const READY_EPSILON = 1e-6

/** 再部署等待秒数乘上这个属性。缺省 1，走属性汇总。 */
export const REDEPLOY_MUL_ATTRIBUTE = "redeployMul"

/** 内容排下、还没执行的再部署。执行时取走。 */
interface RedeployPlan {
  delay: number | null
  tile: TileCoord | null
  cost: number | null
  keepSp: boolean
  /** 排下时的再部署计时，delay 从这里起算。 */
  from: number
}

export const REDEPLOY_PLAN = defineComponent<RedeployPlan>("deploy:redeploy-plan", {
  create: () => ({ delay: null, tile: null, cost: null, keepSp: false, from: 0 }),
})

/** 撤下在场的单位：结束技能、开始再部署计时，送出 retreat。不算倒下。 */
export function retreatUnit(ctx: ContentContext, unitId: string): CommandRefusal | null {
  const { world: state, registry } = engineOf(ctx)
  const unit = state.units.get(unitId)
  if (!unit || unit.removed) return "unknown-unit"
  if (!unit.fielded || unit.downed) return "not-fielded"
  endSkillsOnDown(registry, ctx, unit, "retreat")
  dropEffectsOnDown(state, registry, ctx, unit)
  landShift(state, unit)
  unit.downed = true
  unit.fielded = false
  startTimer(state, registry, unitId, "redeploy")
  const timer = readTimer(unit, "redeploy")
  if (timer) timer.elapsed = 0
  state.components.access(REDEPLOY_PLAN).delete(unitId)
  emit(state, "retreat", { unitId })
  return null
}

/**
 * 让等待再部署的单位回来。delay 为 0（或计时已经走完）时这一拍就回来，否则排下，由再部署系统到点执行。
 * 玩家输入走同一段：不带 delay、cost、keepSp，计时没走完就拒绝。
 */
export function orderRedeploy(ctx: ContentContext, unitId: string, order: RedeployOrder, fromInput: boolean): CommandRefusal | null {
  const { world: state } = engineOf(ctx)
  const unit = state.units.get(unitId)
  if (!unit || unit.removed) return "unknown-unit"
  if (!unit.downed) return "not-waiting"
  if (order.tile !== undefined && !(Number.isInteger(order.tile.x) && Number.isInteger(order.tile.y))) return "bad-order"
  if (order.delay !== undefined && !(order.delay >= 0 && Number.isFinite(order.delay))) return "bad-order"
  if (order.cost !== undefined && !(order.cost >= 0 && Number.isFinite(order.cost))) return "bad-order"
  const plan: RedeployPlan = {
    delay: order.delay ?? null,
    tile: order.tile ? { x: order.tile.x, y: order.tile.y } : null,
    cost: order.cost ?? null,
    keepSp: order.keepSp === true,
    from: waited(ctx, unit),
  }
  if (fromInput || plan.delay === 0) return deployBack(ctx, unit, plan, fromInput)
  if (!state.spec.modules.includes("redeploy")) return "no-redeploy"
  state.components.access(REDEPLOY_PLAN).set(unitId, plan)
  return null
}

/** 再部署系统每拍对等待中的单位调用：计时到点就按排下的计划或规则回来。 */
export function redeployWhenReady(ctx: ContentContext, unit: UnitState): void {
  const { world: state } = engineOf(ctx)
  const plan = state.components.access(REDEPLOY_PLAN).get(unit.id) ?? null
  advanceWait(ctx, unit, plan)
  deployBack(ctx, unit, plan, true)
}

/** 倒下或撤下之后要等的秒数：respawnTime 乘上再部署倍率。 */
export function redeployDuration(registry: BattleRegistry, unit: UnitState): number {
  return stat(unit, "respawnTime") * redeployMul(registry, unit)
}

// MARK: shared

function deployBack(ctx: ContentContext, unit: UnitState, plan: RedeployPlan | null, needReady: boolean): CommandRefusal | null {
  const { world: state, registry } = engineOf(ctx)
  if (needReady && waited(ctx, unit) + READY_EPSILON < need(ctx, unit, plan)) return "not-ready"
  const tile = plan?.tile ?? { x: Math.round(unit.x), y: Math.round(unit.y) }
  if (!tileOpen(ctx, unit, tile)) return "tile-blocked"
  if (!ctx.spendCost(unit.side, plan?.cost ?? stat(unit, "cost"))) return "no-cost"
  const kept = plan?.keepSp ? unit.skills.map((skill) => ({ sp: skill.sp, charges: skill.charges })) : null
  state.components.access(REDEPLOY_PLAN).delete(unit.id)
  if (plan?.tile) {
    unit.x = plan.tile.x
    unit.y = plan.tile.y
  }
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
  markLatestDeployed(state, unit)
  resetSkills(state, registry, ctx, unit)
  if (kept) {
    unit.skills.forEach((skill, index) => {
      const saved = kept[index]
      if (!saved) return
      skill.sp = saved.sp
      skill.charges = saved.charges
    })
  }
  emit(state, "deploy", { unitId: unit.id })
  return null
}

/** 计时走到要等的秒数为止，到点之后停住。 */
function advanceWait(ctx: ContentContext, unit: UnitState, plan: RedeployPlan | null): void {
  if (!ctx.timerView(unit.id, "redeploy").started) ctx.startTimer(unit.id, "redeploy")
  if (waited(ctx, unit) + READY_EPSILON < need(ctx, unit, plan)) ctx.advanceTimer(unit.id, "redeploy")
}

function need(ctx: ContentContext, unit: UnitState, plan: RedeployPlan | null): number {
  if (plan?.delay !== null && plan?.delay !== undefined) return plan.from + plan.delay
  return redeployDuration(engineOf(ctx).registry, unit)
}

function waited(ctx: ContentContext, unit: UnitState): number {
  const elapsed = ctx.timerView(unit.id, "redeploy").elapsed
  return typeof elapsed === "number" ? elapsed : 0
}

function tileOpen(ctx: ContentContext, unit: UnitState, tile: TileCoord): boolean {
  const { world: state, registry } = engineOf(ctx)
  const strategyId = state.spec.deployStrategy
  if (strategyId === null) return true
  return registry.requireDeployStrategy(strategyId).canStand(unit.id, tile, ctx)
}

function redeployMul(registry: BattleRegistry, unit: UnitState): number {
  const value = attributeOf(unit, registry, REDEPLOY_MUL_ATTRIBUTE, 1)
  if (!Number.isFinite(value) || value < 0) return 1
  return value
}

function stat(unit: UnitState, key: string): number {
  const value = unit.attributes[key]
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0
  return value
}
