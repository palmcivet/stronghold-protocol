import { unitSides, type CostPoolSpec, type UnitSide } from "#contract/spec.js"
import type { MissionModule } from "#port/content.js"
import { emit, type BattleState } from "#battle/state.js"
import { sessionOf } from "#battle/session.js"
import { TICK } from "#tick/index.js"

const COST_EPSILON = 1e-9

export function nonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0
  return value
}

export function poolCap(pool: CostPoolSpec): number {
  return nonNegative(pool.cap)
}

/** 开场费用。超过上限时夹到上限。 */
export function initialCost(pool: CostPoolSpec): number {
  return Math.min(poolCap(pool), nonNegative(pool.initial))
}

export function costOf(state: BattleState, side: UnitSide): number {
  return state.cost[side]
}

export function spendCost(state: BattleState, side: UnitSide, amount: number): boolean {
  if (!Number.isFinite(amount) || amount < 0) return false
  if (amount <= COST_EPSILON) return true
  if (state.cost[side] + COST_EPSILON < amount) return false
  const next = Math.max(0, state.cost[side] - amount)
  state.cost[side] = next
  emit(state, "cost", { side, value: next })
  return true
}

export function addCost(state: BattleState, side: UnitSide, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return
  const next = Math.min(poolCap(state.spec.cost[side]), state.cost[side] + amount)
  if (Math.abs(next - state.cost[side]) <= COST_EPSILON) return
  state.cost[side] = next
  emit(state, "cost", { side, value: next })
}

/** 按规格里的每秒回复走一拍，结果不超过上限。 */
export function regenerateCost(state: BattleState): void {
  for (const side of unitSides) {
    const regen = nonNegative(state.spec.cost[side].regen)
    if (regen <= 0) continue
    addCost(state, side, regen * TICK)
  }
}

export const costModule: MissionModule = {
  id: "cost",
  install(ctx) {
    ctx.registerSystem({
      id: "cost",
      slot: "cost",
      priority: 0,
      run(runCtx) {
        regenerateCost(sessionOf(runCtx).state)
      },
    })
  },
}
