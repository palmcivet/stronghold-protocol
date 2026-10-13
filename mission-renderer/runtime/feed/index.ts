import {
  type BattleEvent,
  type BattleSnapshot,
  FREEZE,
  SLEEP,
  STUN,
  TICK,
  type UnitSnapshot,
} from 'arknights-mission-core';

export interface MissionFeedOptions {
  /** Game seconds per real second: the battle's speed. */
  readonly speed?: number | undefined;
  /** Real seconds the render clock trails the newest frame. */
  readonly delay?: number | undefined;
  /** Real seconds of frames kept behind the render clock. */
  readonly keep?: number | undefined;
  /** Real seconds the render clock may run past the newest frame, moving units along their last velocity. Defaults to 0.12. */
  readonly maxExtrapolate?: number | undefined;
}

export interface MissionFeedSample {
  /** Game time of the render clock, in seconds. */
  readonly time: number;
  /** The newer frame that brackets the render clock; flags and attributes come from it. */
  readonly snapshot: BattleSnapshot;
  /** Units with positions interpolated to `time`. */
  readonly units: readonly UnitSnapshot[];
  /** Ids of units whose position differs between the two bracketing frames. */
  readonly moving: ReadonlySet<string>;
}

export interface MissionFeed {
  readonly renderTime: number;
  readonly newestTime: number;
  readonly speed: number;
  readonly delay: number;
  /** Changes the speed or the delay; buffered frames and waiting events are kept. */
  configure(options: Pick<MissionFeedOptions, 'speed' | 'delay'>): void;
  /** Events not released yet, in push order. */
  pendingEvents(): readonly BattleEvent[];
  push(snapshot: BattleSnapshot): void;
  pushEvent(event: BattleEvent): void;
  advance(deltaSeconds: number): void;
  sample(): MissionFeedSample | null;
  takeEvents(): readonly BattleEvent[];
  reset(): void;
}

interface Frame {
  readonly time: number;
  readonly snapshot: BattleSnapshot;
}

const MAX_EVENTS = 2000;
const SNAP_SECONDS = 0.75;
const MAX_FRAME_SECONDS = 0.25;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function gameTimeOf(tick: number): number {
  return tick * TICK;
}

/** Real seconds the render clock may run past the newest frame by default. */
export const MISSION_FEED_EXTRAPOLATE = 0.12;

/** A step longer than this, in tiles, is a jump: it gives no velocity (master's `teleport`). */
const TELEPORT_TILES = 2.5;

const STILL_TAGS: readonly string[] = [STUN.id, FREEZE.id, SLEEP.id];

/** The newest frame cannot predict this unit's next step: it is down, held still, blocked, or standing after a strike. */
function heldStill(unit: UnitSnapshot): boolean {
  if (unit.downed || unit.blockedBy !== null) {
    return true;
  }
  if (unit.tags.some((tag) => STILL_TAGS.includes(tag))) {
    return true;
  }
  const stand = unit.components['attack:stand'] as
    | { readonly until: number | null }
    | undefined;
  return stand !== undefined && stand.until !== null;
}

/**
 * Game time a unit of the older frame starts moving towards the newer one: the end of its attack stand when that falls
 * inside the interval and no cut lands there, else the older frame's time. The stand holds the model still until then,
 * as master.
 */
export function moveStart(
  older: UnitSnapshot,
  olderTime: number,
  newerTime: number,
): number {
  const stand = older.components['attack:stand'] as
    | { readonly until: number | null; readonly cutAt: number | null }
    | undefined;
  if (!stand || stand.until === null || !Number.isFinite(stand.until)) {
    return olderTime;
  }
  const end = gameTimeOf(stand.until);
  const cut = stand.cutAt === null ? null : gameTimeOf(stand.cutAt);
  if (cut !== null && cut > olderTime && cut <= newerTime) {
    return olderTime;
  }
  return end > olderTime && end <= newerTime ? end : olderTime;
}

/**
 * Units of the newest frame moved along the velocity between the two newest frames, for the game seconds the clock
 * has run past it (the clock is already capped). A unit held still in the newest frame, or new in it, stays put.
 */
function extrapolated(
  previous: Frame,
  newest: Frame,
  time: number,
): MissionFeedSample {
  const span = newest.time - previous.time;
  const ahead = time - newest.time;
  const before = new Map(
    previous.snapshot.units.map((unit) => [unit.id, unit] as const),
  );
  const moving = new Set<string>();
  const units = newest.snapshot.units.map((unit) => {
    const old = before.get(unit.id);
    const moved = old
      ? newest.time - moveStart(old, previous.time, newest.time)
      : 0;
    if (!old || !(span > 0) || !(moved > 0) || heldStill(unit)) {
      return unit;
    }
    const dx = unit.x - old.x;
    const dy = unit.y - old.y;
    if (Math.hypot(dx, dy) > TELEPORT_TILES) {
      return unit;
    }
    // the velocity of the stretch actually moved: after an attack stand that is shorter than the interval
    const vx = dx / moved;
    const vy = dy / moved;
    if (vx === 0 && vy === 0) {
      return unit;
    }
    moving.add(unit.id);
    return { ...unit, x: unit.x + vx * ahead, y: unit.y + vy * ahead };
  });
  return { time, snapshot: newest.snapshot, units, moving };
}

/**
 * Snapshots fed every frame by a local simulation. The render clock advances at the battle's speed and trails the
 * newest frame by `delay` real seconds; units are interpolated between the two frames around the clock, and an event
 * is released once the clock reaches its tick.
 */
export function createMissionFeed(
  options: MissionFeedOptions = {},
): MissionFeed {
  let speed = clamp(options.speed ?? 2, 0.05, 20);
  let delay = Math.max(0, options.delay ?? 0.034);
  const keep = Math.max(0.5, options.keep ?? 2.5);
  const maxExtrapolate = Math.max(
    0,
    options.maxExtrapolate ?? MISSION_FEED_EXTRAPOLATE,
  );
  let frames: Frame[] = [];
  let events: BattleEvent[] = [];
  let renderTime = Number.NaN;

  const newestTime = (): number =>
    frames[frames.length - 1]?.time ?? Number.NaN;
  const goalTime = (): number => newestTime() - delay * speed;

  const clampToFrames = (): void => {
    const first = frames[0];
    const last = frames[frames.length - 1];
    if (!first || !last) {
      return;
    }
    renderTime = clamp(
      renderTime,
      first.time,
      last.time + maxExtrapolate * speed,
    );
  };

  const trim = (): void => {
    const horizon = newestTime() - keep * speed;
    while (
      frames.length > 2 &&
      (frames[1]?.time ?? Number.POSITIVE_INFINITY) <= renderTime
    ) {
      frames.shift();
    }
    while (
      frames.length > 2 &&
      (frames[1]?.time ?? Number.POSITIVE_INFINITY) < horizon
    ) {
      frames.shift();
    }
  };

  return {
    get renderTime() {
      return renderTime;
    },
    get newestTime() {
      return newestTime();
    },
    get speed() {
      return speed;
    },
    get delay() {
      return delay;
    },
    configure(next) {
      if (next.speed !== undefined) {
        speed = clamp(next.speed, 0.05, 20);
      }
      if (next.delay !== undefined) {
        delay = Math.max(0, next.delay);
      }
    },
    pendingEvents() {
      return events;
    },
    push(snapshot) {
      const last = frames[frames.length - 1];
      if (last && snapshot.tick < last.snapshot.tick) {
        frames = [];
        events = [];
        renderTime = Number.NaN;
      }
      const time = gameTimeOf(snapshot.tick);
      const current = frames[frames.length - 1];
      if (current && current.time === time) {
        frames[frames.length - 1] = { time, snapshot };
      } else {
        frames.push({ time, snapshot });
      }
      if (!Number.isFinite(renderTime)) {
        renderTime = goalTime();
      }
      trim();
      clampToFrames();
    },
    pushEvent(event) {
      events.push(event);
      if (events.length > MAX_EVENTS) {
        events = events.slice(events.length - MAX_EVENTS);
      }
    },
    advance(deltaSeconds) {
      if (frames.length === 0) {
        return;
      }
      const dt = clamp(deltaSeconds, 0, MAX_FRAME_SECONDS);
      if (!Number.isFinite(renderTime)) {
        renderTime = goalTime();
      }
      renderTime += dt * speed;
      const goal = goalTime();
      const error = goal - renderTime;
      if (Math.abs(error) > SNAP_SECONDS * speed) {
        renderTime = goal;
      } else {
        renderTime += error * Math.min(1, dt * 3);
      }
      clampToFrames();
      trim();
    },
    sample() {
      if (frames.length === 0) {
        return null;
      }
      const time = Number.isFinite(renderTime) ? renderTime : newestTime();
      let older = 0;
      for (const [index, frame] of frames.entries()) {
        if (frame.time <= time) {
          older = index;
        }
      }
      const a = frames[older];
      const b = frames[Math.min(older + 1, frames.length - 1)];
      if (!a || !b) {
        return null;
      }
      const previous = frames[older - 1];
      if (a === b && time > a.time && previous) {
        return extrapolated(previous, a, time);
      }
      const span = b.time - a.time;
      const alpha = span > 0 ? clamp((time - a.time) / span, 0, 1) : 0;
      const before = new Map(
        a.snapshot.units.map((unit) => [unit.id, unit] as const),
      );
      const moving = new Set<string>();
      const units: UnitSnapshot[] = [];
      for (const unit of b.snapshot.units) {
        const previous = before.get(unit.id);
        if (!previous) {
          units.push(unit);
          continue;
        }
        const start = moveStart(previous, a.time, b.time);
        const along =
          start > a.time
            ? b.time > start
              ? clamp((time - start) / (b.time - start), 0, 1)
              : time >= b.time
                ? 1
                : 0
            : alpha;
        const x = previous.x + (unit.x - previous.x) * along;
        const y = previous.y + (unit.y - previous.y) * along;
        if (previous.x !== unit.x || previous.y !== unit.y) {
          moving.add(unit.id);
        }
        units.push({ ...unit, x, y });
      }
      if (alpha < 1) {
        const newer = new Set(b.snapshot.units.map((unit) => unit.id));
        for (const unit of a.snapshot.units) {
          if (!newer.has(unit.id)) {
            units.push(unit);
          }
        }
      }
      return { time, snapshot: b.snapshot, units, moving };
    },
    takeEvents() {
      const due: BattleEvent[] = [];
      const later: BattleEvent[] = [];
      for (const event of events) {
        if (gameTimeOf(event.tick) <= renderTime) {
          due.push(event);
        } else {
          later.push(event);
        }
      }
      events = later;
      return due;
    },
    reset() {
      frames = [];
      events = [];
      renderTime = Number.NaN;
    },
  };
}
