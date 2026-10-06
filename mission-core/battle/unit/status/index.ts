import type { ContentContext, StatusApplication, StatusDefinition, StatusIncoming } from "#port/content.js"
import type { BattleRegistry } from "#battle/registry.js"
import { requireUnit, type BattleState } from "#battle/state.js"
import { clearElements } from "#battle/unit/element.js"
import { refuseStatus, shortenControlled } from "#battle/unit/status/catalog.js"
import { immuneTo, writeFlags } from "#battle/unit/status/flags.js"
import { refreshOverlap } from "#battle/unit/status/overlap.js"
import { cancelTimer, startTimer } from "#battle/unit/timer.js"
import { TICK } from "#tick/index.js"
import type { StatusInstance } from "#battle/unit/index.js"

export function registerStatusTimer(registry: BattleRegistry, state: BattleState): void {
  registry.registerTimer({
    id: "status",
    slot: "status",
    create: () => ({ elapsed: 0 }),
    advance(timer, unitId, runCtx) {
      timer.elapsed = number(timer.elapsed) + 1
      tickStatuses(state, registry, runCtx, unitId)
    },
    cancel(timer) {
      timer.elapsed = 0
    },
    view(timer) {
      return { elapsed: number(timer.elapsed) }
    },
  })
}

export function applyStatus(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  unitId: string,
  statusId: string,
  application?: StatusApplication,
): void {
  const definition = registry.requireStatus(statusId)
  for (const timerId of definition.cancels) registry.requireTimer(timerId)
  const unit = requireUnit(state, unitId)
  if (immuneTo(registry, unit, statusId) || refuseStatus(unit, statusId)) return
  const span = spanOf(application?.duration, definition)
  if (!span) return
  const incoming: StatusIncoming = {
    ...span,
    value: application?.value ?? definition.valued ?? 0,
    at: state.tick,
  }
  const existing = unit.statuses.find((status) => status.id === statusId && !status.dropped)
  const overlap = definition.overlap ?? refreshOverlap
  const applied = overlap(unit.statuses, existing, incoming, definition) as StatusInstance | undefined
  if (!applied) return
  shortenControlled(unit, applied)
  writeFlags(registry, unit)
  for (const timerId of definition.cancels) cancelTimer(state, registry, unitId, timerId)
  startTimer(state, registry, unitId, "status")
  definition.onApply?.(unitId, applied.stacks, ctx)
}

function tickStatuses(state: BattleState, registry: BattleRegistry, ctx: ContentContext, unitId: string): void {
  const unit = requireUnit(state, unitId)
  const locked = unit.flags.has("burstLock")
  const current = unit.statuses.slice()
  const kept: StatusInstance[] = []
  for (const status of current) {
    if (status.dropped) continue
    const definition = registry.requireStatus(status.id)
    definition.onTick?.(unitId, status.stacks, ctx)
    if (status.dropped) continue
    if (!status.permanent) status.remaining -= 1
    if (status.permanent || status.remaining > 0) {
      kept.push(status)
      continue
    }
    if (resumeTail(status, definition, state.tick)) kept.push(status)
  }
  const arrived = unit.statuses.filter((status) => !current.includes(status) && !status.dropped)
  unit.statuses.length = 0
  unit.statuses.push(...kept.filter((status) => !status.dropped), ...arrived)
  writeFlags(registry, unit)
  if (locked && !unit.flags.has("burstLock")) clearElements(unit)
}

function resumeTail(status: StatusInstance, definition: StatusDefinition, tick: number): boolean {
  const tail = status.tail
  if (!tail || !(tail.until > tick)) return false
  status.strength = tail.value
  status.remaining = tail.until - tick
  status.permanent = false
  status.tail = null
  if (definition.scale) status.runtimeModifiers = [...definition.scale(tail.value)]
  return true
}

function spanOf(
  seconds: number | undefined,
  definition: StatusDefinition,
): { ticks: number; permanent: boolean } | null {
  if (seconds === undefined) {
    if (definition.duration <= 0) return { ticks: 0, permanent: true }
    return { ticks: definition.duration, permanent: false }
  }
  if (seconds === Number.POSITIVE_INFINITY) return { ticks: 0, permanent: true }
  if (!(seconds > 0) || !Number.isFinite(seconds)) return null
  return { ticks: Math.max(1, Math.round(seconds / TICK)), permanent: false }
}

function number(value: string | number | boolean | undefined): number {
  return typeof value === "number" ? value : 0
}
