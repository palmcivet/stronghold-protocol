import type { PhaseSlot } from "#contract/phase.js"
import type { ContentContext, TimerDefinition, TimerState, TimerView } from "#port/content.js"
import type { BattleRegistry } from "#battle/registry.js"
import { readTimer, requireUnit, type BattleState } from "#battle/state.js"
import type { UnitState } from "#battle/unit/index.js"
import { advanceAttack } from "#battle/unit/attack.js"
import { advanceSkillBody, advanceSkillPoint } from "#battle/skill/point.js"

export function registerBuiltinTimers(registry: BattleRegistry, state: BattleState): void {
  registry.registerTimer(skillBodyTimer(state, registry))
  registry.registerTimer(skillPointTimer(state, registry))
  registry.registerTimer(counterTimer("trait", "ally", "count"))
  registry.registerTimer(counterTimer("redeploy", "redeploy", "elapsed"))
  registry.registerTimer(attackTimer(state, registry))
}

export function startTimer(state: BattleState, registry: BattleRegistry, unitId: string, timerId: string): void {
  const definition = registry.requireTimer(timerId)
  const unit = requireUnit(state, unitId)
  if (unit.timers.has(timerId)) return
  unit.timers.set(timerId, definition.create())
}

export function advanceTimer(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  unitId: string,
  timerId: string,
): void {
  const definition = registry.requireTimer(timerId)
  const unit = requireUnit(state, unitId)
  const timer = readTimer(unit, timerId)
  if (!timer) throw new Error(`计时器未开始: ${timerId}`)
  definition.advance(timer, unitId, ctx)
}

export function advanceStartedTimers(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  slot: PhaseSlot,
): void {
  for (const unit of unitsInSlot(state, slot)) {
    for (const definition of registry.timersInSlot(slot)) {
      const timer = readTimer(unit, definition.id)
      if (!timer) continue
      definition.advance(timer, unit.id, ctx)
    }
  }
}

export function cancelTimer(state: BattleState, registry: BattleRegistry, unitId: string, timerId: string): void {
  const definition = registry.requireTimer(timerId)
  const unit = requireUnit(state, unitId)
  const timer = readTimer(unit, timerId)
  if (!timer) return
  definition.cancel(timer)
}

export function timerView(state: BattleState, registry: BattleRegistry, unitId: string, timerId: string): TimerView {
  const definition = registry.requireTimer(timerId)
  const unit = requireUnit(state, unitId)
  const timer = readTimer(unit, timerId)
  if (!timer) return { started: false }
  return { ...definition.view(timer), started: true }
}

function unitsInSlot(state: BattleState, slot: PhaseSlot): readonly UnitState[] {
  const units = [...state.units.values()]
  if (slot === "ally") return units.filter((unit) => unit.side === "ally" && unit.fielded && !unit.downed)
  if (slot === "enemy") return units.filter((unit) => unit.side === "enemy" && unit.fielded && !unit.downed)
  return units
}

function attackTimer(state: BattleState, registry: BattleRegistry): TimerDefinition {
  return {
    id: "attack",
    slot: "ally",
    create: () => ({ phase: "idle", elapsed: 0, cooldown: 0, rest: 0, lead: 0 }),
    advance(timer, unitId, ctx) {
      advanceAttack(state, registry, ctx, unitId, timer)
    },
    cancel(timer) {
      timer.phase = "idle"
      timer.elapsed = 0
      timer.lead = 0
    },
    view(timer) {
      return { phase: text(timer, "phase", "idle"), elapsed: number(timer, "elapsed") }
    },
  }
}

function counterTimer(id: string, slot: PhaseSlot, field: string): TimerDefinition {
  return {
    id,
    slot,
    create: () => ({ [field]: 0 }),
    advance(timer) {
      timer[field] = number(timer, field) + 1
    },
    cancel(timer) {
      timer[field] = 0
    },
    view(timer) {
      return { [field]: number(timer, field) }
    },
  }
}

function skillPointTimer(state: BattleState, registry: BattleRegistry): TimerDefinition {
  return {
    id: "skill-point",
    slot: "ally",
    create: () => ({ phase: "recover", elapsed: 0, sp: 0, charges: 0, active: 0, activations: 0 }),
    advance(timer, unitId, ctx) {
      advanceSkillPoint(state, registry, ctx, unitId, timer)
    },
    cancel(_timer) {},
    view(timer) {
      return {
        phase: text(timer, "phase", "recover"),
        elapsed: number(timer, "elapsed"),
        sp: number(timer, "sp"),
        charges: number(timer, "charges"),
        active: number(timer, "active"),
        activations: number(timer, "activations"),
      }
    },
  }
}

function skillBodyTimer(state: BattleState, registry: BattleRegistry): TimerDefinition {
  return {
    id: "skill-body",
    slot: "ally",
    create: () => ({ elapsed: 0 }),
    advance(timer, unitId, ctx) {
      timer.elapsed = number(timer, "elapsed") + 1
      advanceSkillBody(state, registry, ctx, unitId)
    },
    cancel(timer) {
      timer.elapsed = 0
    },
    view(timer) {
      return { elapsed: number(timer, "elapsed") }
    },
  }
}

function number(timer: TimerState, key: string): number {
  const value = timer[key]
  return typeof value === "number" ? value : 0
}

function text(timer: TimerState, key: string, fallback: string): string {
  const value = timer[key]
  return typeof value === "string" ? value : fallback
}
