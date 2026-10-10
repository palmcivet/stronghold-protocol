import type { PhaseSlot } from "#contract/phase.js"
import { openTimer, readTimer, viewTimer, type TimerView } from "#kernel/timer/index.js"
import type { ContentContext } from "#port/context.js"
import type { BattleRegistry } from "#port/definition.js"
import { requireUnit, type BattleWorld, type UnitState } from "#unit/record/index.js"

export function armListedTimers(world: BattleWorld, registry: BattleRegistry, unit: UnitState): void {
  for (const timerId of unit.listedTimers) startTimer(world, registry, unit.id, timerId)
}

export function startTimer(world: BattleWorld, registry: BattleRegistry, unitId: string, timerId: string): void {
  const definition = registry.requireTimer(timerId)
  openTimer(requireUnit(world, unitId), definition)
}

export function advanceTimer(
  world: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unitId: string,
  timerId: string,
): void {
  const definition = registry.requireTimer(timerId)
  const timer = readTimer(requireUnit(world, unitId), timerId)
  if (!timer) throw new Error(`计时器未开始: ${timerId}`)
  definition.advance(timer, unitId, ctx)
}

/** 按单位入场顺序，推进这个阶段槽里已经启动的计时器。己方槽只推进在场的己方单位，敌方槽同理。 */
export function advanceStartedTimers(world: BattleWorld, registry: BattleRegistry, ctx: ContentContext, slot: PhaseSlot): void {
  for (const unit of unitsInSlot(world, slot)) {
    for (const definition of registry.timersInSlot(slot)) {
      const timer = readTimer(unit, definition.id)
      if (!timer) continue
      definition.advance(timer, unit.id, ctx)
    }
  }
}

export function cancelTimer(world: BattleWorld, registry: BattleRegistry, unitId: string, timerId: string): void {
  const definition = registry.requireTimer(timerId)
  const timer = readTimer(requireUnit(world, unitId), timerId)
  if (!timer) return
  definition.cancel(timer)
}

export function timerView(world: BattleWorld, registry: BattleRegistry, unitId: string, timerId: string): TimerView {
  const definition = registry.requireTimer(timerId)
  return viewTimer(requireUnit(world, unitId), definition)
}

function unitsInSlot(world: BattleWorld, slot: PhaseSlot): readonly UnitState[] {
  const units = [...world.units.values()]
  if (slot === "ally") return units.filter((unit) => unit.side === "ally" && unit.fielded && !unit.downed)
  if (slot === "enemy") return units.filter((unit) => unit.side === "enemy" && unit.fielded && !unit.downed)
  return units
}
