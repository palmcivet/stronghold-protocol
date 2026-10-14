/**
 * Master's server-mode battle stream (`m.field`, `b.snap`, `b.ev`) mapped to neutral views the client draws. Only the
 * fields the stand-in battlefield shows are read; the rest of master's stream is ignored.
 */

/** Static unit info of master's `m.field.units` and `spawn` events. */
export interface MasterUnitInfo {
  readonly id: number | string;
  readonly name?: string;
  readonly side?: string;
  readonly kind?: string;
  readonly defId?: string;
  readonly dir?: string;
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
  /** Deploy cost the combat HUD shows (master's `b.snap.dp`). */
  readonly dp?: number;
}

/** The part of master's `m.field` the battlefield shows. */
export interface MasterFieldView {
  readonly units?: readonly MasterUnitInfo[];
}

export type StreamSide = 'ally' | 'enemy';

/** What a unit is: a deployed operator, an enemy, a summon, or a stage device (crate, turret). */
export type StreamUnitKind = 'operator' | 'enemy' | 'token' | 'device';

export type StreamFacing = 'UP' | 'RIGHT' | 'DOWN' | 'LEFT';

export interface StreamUnitInfo {
  readonly id: string;
  readonly name: string;
  readonly side: StreamSide;
  readonly kind: StreamUnitKind;
  /** Master's chess, enemy or device id, null when the stream gives none. */
  readonly defId: string | null;
  readonly facing: StreamFacing;
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
  /** Deploy cost the combat HUD shows when the stream carries it. */
  readonly dp?: number;
}

/** Damage kinds master stamps on a `dmg` tuple (`phys` → physical). */
export type StreamDamageKind = 'physical' | 'arts' | 'true';

export type StreamEvent =
  | { readonly kind: 'spawn'; readonly unit: StreamUnitInfo }
  | {
      readonly kind: 'damage';
      readonly unitId: string;
      readonly amount: number;
      readonly damageKind: StreamDamageKind;
      /** Master's red-integer mark (`dmg` tuple slot 4 === `'r'`). */
      readonly red?: true;
    }
  | {
      readonly kind: 'heal';
      readonly unitId: string;
      readonly amount: number;
    }
  | { readonly kind: 'death' | 'leak'; readonly unitId: string }
  | {
      readonly kind: 'skill';
      readonly unitId: string;
      /** True while the skill is on (`['skill', id, 1]`). */
      readonly active: boolean;
    }
  | {
      /** Master's `['fx', kind, x, y, extra]` as a kebab-case cue the renderer draws. */
      readonly kind: 'fx';
      readonly name: string;
      readonly x: number;
      readonly y: number;
      readonly data: Readonly<Record<string, unknown>>;
    };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isId = (value: unknown): value is number | string =>
  (typeof value === 'number' && Number.isFinite(value)) ||
  (typeof value === 'string' && value.length > 0);
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const FACINGS: readonly StreamFacing[] = ['UP', 'RIGHT', 'DOWN', 'LEFT'];

function kindOf(kind: unknown, side: StreamSide): StreamUnitKind {
  if (kind === 'device' || kind === 'enemy') {
    return kind;
  }
  if (kind === 'token' || kind === 'summon') {
    return 'token';
  }
  return side === 'enemy' ? 'enemy' : 'operator';
}

const count = (value: unknown): number =>
  Number.isInteger(value) && (value as number) >= 0 ? (value as number) : 0;

/** Unit info of a master `m.field` unit or `spawn` payload, or null when it has no id. */
export function streamUnitInfoOf(info: unknown): StreamUnitInfo | null {
  if (!isRecord(info) || !isId(info.id)) {
    return null;
  }
  const id = String(info.id);
  const side: StreamSide = info.side === 'ally' ? 'ally' : 'enemy';
  return {
    id,
    name: typeof info.name === 'string' && info.name ? info.name : id,
    side,
    kind: kindOf(info.kind, side),
    defId: typeof info.defId === 'string' && info.defId ? info.defId : null,
    facing: FACINGS.find((facing) => facing === info.dir) ?? 'RIGHT',
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
  return {
    units,
    killed: count(snap.killed),
    total: count(snap.total),
    ...(Number.isInteger(snap.dp) && (snap.dp as number) >= 0
      ? { dp: snap.dp as number }
      : {}),
  };
}

function damageKindOf(value: unknown): StreamDamageKind {
  if (value === 'arts' || value === 'true') {
    return value;
  }
  return 'physical';
}

/** Master's camelCase fx kind → the kebab-case cue name `OFFICIAL_FX` uses. */
export function fxCueNameOf(kind: string): string {
  return kind
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}

/** Events of a master `b.ev` list the battlefield shows: spawns, hits, skills, fx, deaths and leaks. */
export function streamEventsOf(events: readonly unknown[]): StreamEvent[] {
  return events.flatMap((event): StreamEvent[] => {
    if (!Array.isArray(event)) {
      return [];
    }
    const [type, a, b, c, d] = event as unknown[];
    if (type === 'spawn') {
      const unit = streamUnitInfoOf(a);
      return unit ? [{ kind: 'spawn', unit }] : [];
    }
    if (
      type === 'fx' &&
      typeof a === 'string' &&
      a &&
      isNumber(b) &&
      isNumber(c)
    ) {
      const extra = isRecord(d) ? d : {};
      const data: Record<string, unknown> = { ...extra, x: b, y: c };
      if (isId(extra.id)) {
        data.unitId = String(extra.id);
      }
      return [{ kind: 'fx', name: fxCueNameOf(a), x: b, y: c, data }];
    }
    if (!isId(a)) {
      return [];
    }
    const unitId = String(a);
    if (type === 'dmg' && isNumber(b)) {
      return [
        {
          kind: 'damage',
          unitId,
          amount: b,
          damageKind: damageKindOf(c),
          ...(d === 'r' ? { red: true as const } : {}),
        },
      ];
    }
    if (type === 'heal' && isNumber(b)) {
      return [{ kind: 'heal', unitId, amount: b }];
    }
    if (type === 'die') {
      return [{ kind: 'death', unitId }];
    }
    if (type === 'leak') {
      return [{ kind: 'leak', unitId }];
    }
    if (type === 'skill') {
      return [{ kind: 'skill', unitId, active: b === 1 || b === true }];
    }
    return [];
  });
}
