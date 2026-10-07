import type { ContentContext } from "#port/content.js"
import { landShift } from "#battle/behavior/action.js"
import type { BattleRegistry } from "#battle/registry.js"
import { emit, readTimer, requireUnit, type BattleState } from "#battle/state.js"
import { startTimer } from "#battle/unit/timer.js"

export function openBattle(state: BattleState, registry: BattleRegistry, ctx: ContentContext): void {
  const strategyId = state.spec.deployStrategy
  if (strategyId === null) return
  const strategy = registry.requireDeployStrategy(strategyId)
  const fielded = new Set<string>()
  for (const unitId of strategy.opening(ctx)) {
    if (fielded.has(unitId)) continue
    const unit = requireUnit(state, unitId)
    unit.fielded = true
    fielded.add(unitId)
    emit(state, "deploy", { unitId })
  }
}

export function knockDown(state: BattleState, registry: BattleRegistry, ctx: ContentContext, unitId: string): void {
  const unit = requireUnit(state, unitId)
  if (unit.downed) return
  landShift(unit)
  unit.downed = true
  unit.fielded = false
  startTimer(state, registry, unitId, "redeploy")
  const timer = readTimer(unit, "redeploy")
  if (timer) timer.elapsed = 0
  const strategyId = state.spec.deployStrategy
  if (strategyId === null) {
    emit(state, "downed", { unitId })
    return
  }
  const strategy = registry.requireDeployStrategy(strategyId)
  const tile = strategy.downedTile(unitId, ctx)
  const canStand = strategy.canStand(unitId, tile, ctx)
  unit.x = tile.x
  unit.y = tile.y
  emit(state, "downed", { unitId, x: tile.x, y: tile.y, canStand })
}
