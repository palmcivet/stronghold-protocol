import { UNIT_SIDES, type CostPoolSpec, type UnitSide } from "#contract/spec.js"
import type { MissionModule } from "#port/module.js"
import { emit } from "#kernel/event/index.js"
import { engineOf, type BattleWorld } from "#unit/record/index.js"
import { defineResource } from "#kernel/world/resource.js"
import { TICK } from "#kernel/tick/index.js"

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

/** 两边当前的费用。 */
export const COST = defineResource<Record<UnitSide, number>>("economy:cost", (spec) => ({
  ally: initialCost(spec.cost.ally),
  enemy: initialCost(spec.cost.enemy),
}))

function pools(state: BattleWorld): Record<UnitSide, number> {
  return state.resources.access(COST).ensure()
}

export function costOf(state: BattleWorld, side: UnitSide): number {
  return pools(state)[side]
}

export function spendCost(state: BattleWorld, side: UnitSide, amount: number): boolean {
  if (!Number.isFinite(amount) || amount < 0) return false
  if (amount <= COST_EPSILON) return true
  const cost = pools(state)
  if (cost[side] + COST_EPSILON < amount) return false
  const next = Math.max(0, cost[side] - amount)
  cost[side] = next
  emit(state, "cost", { side, value: next })
  return true
}

export function addCost(state: BattleWorld, side: UnitSide, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return
  const cost = pools(state)
  const next = Math.min(poolCap(state.spec.cost[side]), cost[side] + amount)
  if (Math.abs(next - cost[side]) <= COST_EPSILON) return
  cost[side] = next
  emit(state, "cost", { side, value: next })
}

/** 按规格里的每秒回复走一拍，结果不超过上限。 */
export function regenerateCost(state: BattleWorld): void {
  for (const side of UNIT_SIDES) {
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
        regenerateCost(engineOf(runCtx).world)
      },
    })
  },
}
