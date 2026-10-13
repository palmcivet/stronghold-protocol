/**
 * Master's server-mode battle stream (`m.field`, `b.snap`, `b.ev`) mapped to neutral views the client draws. Only the
 * fields the stand-in battlefield shows are read; the rest of master's stream is ignored.
 */

/** Static unit info of master's `m.field.units` and `spawn` events. */
export interface MasterUnitInfo {
  readonly id: number | string;
  readonly name?: string;
  readonly side?: string;
  readonly maxHp?: number;
  readonly x?: number;
  readonly y?: number;
}

/** A master `b.snap` unit tuple: `[id, x, y, hp, maxHp, sp, spMax, flags, anim]`. */
export type MasterUnitTuple = readonly unknown[];

/** The part of master's `b.snap` the battlefield shows. */
export interface MasterSnapView {
  readonly units?: readonly MasterUnitTuple[];
  readonly killed?: number;
  readonly total?: number;
}

/** The part of master's `m.field` the battlefield shows. */
export interface MasterFieldView {
  readonly units?: readonly MasterUnitInfo[];
}

export type StreamSide = 'ally' | 'enemy';

export interface StreamUnitInfo {
  readonly id: string;
  readonly name: string;
  readonly side: StreamSide;
}

/** A unit as the latest snapshot places it. */
export interface StreamUnit {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly alive: boolean;
}

export interface StreamSnapshot {
  readonly units: readonly StreamUnit[];
  readonly killed: number;
  readonly total: number;
}

export type StreamEvent =
  | { readonly kind: 'spawn'; readonly unit: StreamUnitInfo }
  | {
      readonly kind: 'damage' | 'heal';
      readonly unitId: string;
      readonly amount: number;
    }
  | { readonly kind: 'death' | 'leak'; readonly unitId: string };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isId = (value: unknown): value is number | string =>
  (typeof value === 'number' && Number.isFinite(value)) ||
  (typeof value === 'string' && value.length > 0);
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const count = (value: unknown): number =>
  Number.isInteger(value) && (value as number) >= 0 ? (value as number) : 0;

/** Unit info of a master `m.field` unit or `spawn` payload, or null when it has no id. */
export function streamUnitInfoOf(info: unknown): StreamUnitInfo | null {
  if (!isRecord(info) || !isId(info.id)) {
    return null;
  }
  const id = String(info.id);
  return {
    id,
    name: typeof info.name === 'string' && info.name ? info.name : id,
    side: info.side === 'ally' ? 'ally' : 'enemy',
  };
}

/** Unit info of a master `m.field`. */
export function streamFieldUnitsOf(field: MasterFieldView): StreamUnitInfo[] {
  const units: unknown = field.units;
  if (!Array.isArray(units)) {
    return [];
  }
  return units.flatMap((unit) => {
    const info = streamUnitInfoOf(unit);
    return info ? [info] : [];
  });
}

/** Snapshot of a master `b.snap`. Tuples without an id, a position or HP are dropped. */
export function streamSnapshotOf(snap: MasterSnapView): StreamSnapshot {
  const tuples: unknown = snap.units;
  const units = (Array.isArray(tuples) ? tuples : []).flatMap(
    (tuple): StreamUnit[] => {
      if (!Array.isArray(tuple)) {
        return [];
      }
      const [id, x, y, hp, maxHp] = tuple as unknown[];
      if (
        !isId(id) ||
        !isNumber(x) ||
        !isNumber(y) ||
        !isNumber(hp) ||
        !isNumber(maxHp)
      ) {
        return [];
      }
      return [
        {
          id: String(id),
          x,
          y,
          hp: Math.max(0, hp),
          maxHp: Math.max(1, maxHp),
          alive: hp > 0,
        },
      ];
    },
  );
  return { units, killed: count(snap.killed), total: count(snap.total) };
}

/** Events of a master `b.ev` list the battlefield shows: spawns, damage, heals, deaths and leaks. */
export function streamEventsOf(events: readonly unknown[]): StreamEvent[] {
  return events.flatMap((event): StreamEvent[] => {
    if (!Array.isArray(event)) {
      return [];
    }
    const [type, target, amount] = event as unknown[];
    if (type === 'spawn') {
      const unit = streamUnitInfoOf(target);
      return unit ? [{ kind: 'spawn', unit }] : [];
    }
    if (!isId(target)) {
      return [];
    }
    const unitId = String(target);
    if ((type === 'dmg' || type === 'heal') && isNumber(amount)) {
      return [{ kind: type === 'dmg' ? 'damage' : 'heal', unitId, amount }];
    }
    if (type === 'die') {
      return [{ kind: 'death', unitId }];
    }
    if (type === 'leak') {
      return [{ kind: 'leak', unitId }];
    }
    return [];
  });
}
