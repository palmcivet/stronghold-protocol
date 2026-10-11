import type { ContentContext } from "#port/context.js"
import { landShift } from "#field/motion/index.js"
import type { BattleRegistry } from "#port/definition.js"
import { emit } from "#kernel/event/index.js"
import { readTimer } from "#kernel/timer/index.js"
import { markDeployed, requireUnit, type BattleWorld } from "#unit/record/index.js"
import { startTimer } from "#unit/record/timer.js"

export function openBattle(state: BattleWorld, registry: BattleRegistry, ctx: ContentContext): void {
  const strategyId = state.spec.deployStrategy
  if (strategyId === null) return
  const strategy = registry.requireDeployStrategy(strategyId)
  const fielded = new Set<string>()
  for (const unitId of strategy.opening(ctx)) {
    if (fielded.has(unitId)) continue
    const unit = requireUnit(state, unitId)
    unit.fielded = true
    markDeployed(unit)
    fielded.add(unitId)
    emit(state, "deploy", { unitId })
  }
}

export function knockDown(state: BattleWorld, registry: BattleRegistry, ctx: ContentContext, unitId: string): void {
  const unit = requireUnit(state, unitId)
  if (unit.downed) return
  landShift(state, unit)
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
