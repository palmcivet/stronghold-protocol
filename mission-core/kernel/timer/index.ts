import type { PhaseSlot } from "#contract/phase.js"
import type { UnitSide } from "#contract/spec.js"
import { TICK } from "#kernel/tick/index.js"

export type TimerState = Record<string, string | number | boolean>

export type TimerView = Readonly<Record<string, string | number | boolean>>

/** 挂在实体上的计时器。C 是推进时交给计时器的上下文。 */
export interface TimerDefinition<C> {
  readonly id: string
  readonly slot: PhaseSlot
  /**
   * 这些阵营才会启动。没写时两边都可以。
   * 写了却对不上的阵营，启动直接跳过，计时器保持未开始。
   */
  readonly sides?: readonly UnitSide[]
  create(): TimerState
  /** 启动时在 create 之后调用一次。 */
  open?(state: TimerState, unitId: string): void
  advance(state: TimerState, unitId: string, ctx: C): void
  cancel(state: TimerState): void
  view(state: TimerState): TimerView
}

export interface TimerHost {
  readonly id: string
  readonly side: UnitSide
  readonly timers: Map<string, TimerState>
}

export function readTimer(host: TimerHost, timerId: string): TimerState | undefined {
  return host.timers.get(timerId)
}

/** 启动计时器。阵营不符或已经启动时什么也不做。 */
export function openTimer<C>(host: TimerHost, definition: TimerDefinition<C>): void {
  if (definition.sides && !definition.sides.includes(host.side)) return
  if (host.timers.has(definition.id)) return
  const timer = definition.create()
  host.timers.set(definition.id, timer)
  definition.open?.(timer, host.id)
}

export function viewTimer<C>(host: TimerHost, definition: TimerDefinition<C>): TimerView {
  const timer = host.timers.get(definition.id)
  if (!timer) return { started: false }
  return { ...definition.view(timer), started: true }
}

/** 每次推进把 field 加一。 */
export function counterTimer<C>(id: string, slot: PhaseSlot, field: string): TimerDefinition<C> {
  return {
    id,
    slot,
    create: () => ({ [field]: 0 }),
    advance(timer) {
      timer[field] = timerNumber(timer, field) + 1
    },
    cancel(timer) {
      timer[field] = 0
    },
    view(timer) {
      return { [field]: timerNumber(timer, field) }
    },
  }
}

/** 每次推进把 elapsed 加一拍的秒数。 */
export function elapsedTimer<C>(id: string, slot: PhaseSlot): TimerDefinition<C> {
  return {
    id,
    slot,
    create: () => ({ elapsed: 0 }),
    advance(timer) {
      timer.elapsed = timerNumber(timer, "elapsed") + TICK
    },
    cancel(timer) {
      timer.elapsed = 0
    },
    view(timer) {
      return { elapsed: timerNumber(timer, "elapsed") }
    },
  }
}

export function timerNumber(timer: TimerState, key: string): number {
  const value = timer[key]
  return typeof value === "number" ? value : 0
}

export function timerText(timer: TimerState, key: string, fallback: string): string {
  const value = timer[key]
  return typeof value === "string" ? value : fallback
}
