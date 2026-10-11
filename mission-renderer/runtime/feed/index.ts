import { TICK, type BattleEvent, type BattleSnapshot, type UnitSnapshot } from "arknights-mission-core"

export interface LocalFeedOptions {
  /** Game seconds per real second: the battle's speed. */
  readonly speed?: number | undefined
  /** Real seconds the render clock trails the newest frame. */
  readonly delay?: number | undefined
  /** Real seconds of frames kept behind the render clock. */
  readonly keep?: number | undefined
}

export interface FeedSample {
  /** Game time of the render clock, in seconds. */
  readonly time: number
  /** The newer frame that brackets the render clock; flags and attributes come from it. */
  readonly snapshot: BattleSnapshot
  /** Units with positions interpolated to `time`. */
  readonly units: readonly UnitSnapshot[]
  /** Ids of units whose position differs between the two bracketing frames. */
  readonly moving: ReadonlySet<string>
}

export interface LocalFeed {
  readonly renderTime: number
  readonly newestTime: number
  push(snapshot: BattleSnapshot): void
  pushEvent(event: BattleEvent): void
  advance(deltaSeconds: number): void
  sample(): FeedSample | null
  takeEvents(): readonly BattleEvent[]
  reset(): void
}

interface Frame {
  readonly time: number
  readonly snapshot: BattleSnapshot
}

const MAX_EVENTS = 2000
const SNAP_SECONDS = 0.75
const MAX_FRAME_SECONDS = 0.25

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

function gameTimeOf(tick: number): number {
  return tick * TICK
}

/**
 * Snapshots fed every frame by a local simulation. The render clock advances at the battle's speed and trails the
 * newest frame by `delay` real seconds; units are interpolated between the two frames around the clock, and an event
 * is released once the clock reaches its tick (master client-side combat, render/interp.js).
 */
export function createLocalFeed(options: LocalFeedOptions = {}): LocalFeed {
  const speed = clamp(options.speed ?? 2, 0.05, 20)
  const delay = Math.max(0, options.delay ?? 0.034)
  const keep = Math.max(0.5, options.keep ?? 2.5)
  let frames: Frame[] = []
  let events: BattleEvent[] = []
  let renderTime = Number.NaN

  const newestTime = (): number => frames[frames.length - 1]?.time ?? Number.NaN
  const goalTime = (): number => newestTime() - delay * speed

  const clampToFrames = (): void => {
    const first = frames[0]
    const last = frames[frames.length - 1]
    if (!first || !last) return
    renderTime = clamp(renderTime, first.time, last.time)
  }

  const trim = (): void => {
    const horizon = newestTime() - keep * speed
    while (frames.length > 2 && frames[1]!.time <= renderTime) frames.shift()
    while (frames.length > 2 && frames[1]!.time < horizon) frames.shift()
  }

  return {
    get renderTime() {
      return renderTime
    },
    get newestTime() {
      return newestTime()
    },
    push(snapshot) {
      const last = frames[frames.length - 1]
      if (last && snapshot.tick < last.snapshot.tick) {
        frames = []
        events = []
        renderTime = Number.NaN
      }
      const time = gameTimeOf(snapshot.tick)
      const current = frames[frames.length - 1]
      if (current && current.time === time) frames[frames.length - 1] = { time, snapshot }
      else frames.push({ time, snapshot })
      if (!Number.isFinite(renderTime)) renderTime = goalTime()
      trim()
      clampToFrames()
    },
    pushEvent(event) {
      events.push(event)
      if (events.length > MAX_EVENTS) events = events.slice(events.length - MAX_EVENTS)
    },
    advance(deltaSeconds) {
      if (frames.length === 0) return
      const dt = clamp(deltaSeconds, 0, MAX_FRAME_SECONDS)
      if (!Number.isFinite(renderTime)) renderTime = goalTime()
      renderTime += dt * speed
      const goal = goalTime()
      const error = goal - renderTime
      if (Math.abs(error) > SNAP_SECONDS * speed) renderTime = goal
      else renderTime += error * Math.min(1, dt * 3)
      clampToFrames()
      trim()
    },
    sample() {
      if (frames.length === 0) return null
      const time = Number.isFinite(renderTime) ? renderTime : newestTime()
      let older = 0
      for (let index = 0; index < frames.length; index += 1) {
        if (frames[index]!.time <= time) older = index
      }
      const a = frames[older]!
      const b = frames[Math.min(older + 1, frames.length - 1)]!
      const span = b.time - a.time
      const alpha = span > 0 ? clamp((time - a.time) / span, 0, 1) : 0
      const before = new Map(a.snapshot.units.map((unit) => [unit.id, unit] as const))
      const moving = new Set<string>()
      const units: UnitSnapshot[] = []
      for (const unit of b.snapshot.units) {
        const previous = before.get(unit.id)
        if (!previous) {
          units.push(unit)
          continue
        }
        const x = previous.x + (unit.x - previous.x) * alpha
        const y = previous.y + (unit.y - previous.y) * alpha
        if (previous.x !== unit.x || previous.y !== unit.y) moving.add(unit.id)
        units.push({ ...unit, x, y })
      }
      if (alpha < 1) {
        const newer = new Set(b.snapshot.units.map((unit) => unit.id))
        for (const unit of a.snapshot.units) if (!newer.has(unit.id)) units.push(unit)
      }
      return { time, snapshot: b.snapshot, units, moving }
    },
    takeEvents() {
      const due: BattleEvent[] = []
      const later: BattleEvent[] = []
      for (const event of events) {
        if (gameTimeOf(event.tick) <= renderTime) due.push(event)
        else later.push(event)
      }
      events = later
      return due
    },
    reset() {
      frames = []
      events = []
      renderTime = Number.NaN
    },
  }
}
