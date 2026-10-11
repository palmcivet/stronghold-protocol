import type { UnitSnapshot } from 'arknights-mission-core';
import { createSealedRegistry } from '#runtime/registry/index.js';

/** A count out of a maximum. */
export interface MissionHudCount {
  readonly left: number;
  readonly max: number;
}

/** The readouts a unit's bar shows besides health and shield. */
export interface MissionHudReadouts {
  /** Rounds left of the running ammo skill, drawn as a strip under the health bar. Null without one. */
  readonly magazine: MissionHudCount | null;
  /** A stock drawn as a row of pips over the bar, lit while left. Null without one. */
  readonly pips: MissionHudCount | null;
  /** Share of its cap a negative health pool holds, 0 to 1, drawn over the health bar. 0 without one. */
  readonly negative: number;
}

/** Reads the pips or the negative health pool of a unit, usually from a component view; null when it has none. */
export type MissionHudReader =
  | {
      readonly id: `${string}:${string}`;
      readonly readout: 'pips';
      read(unit: UnitSnapshot): MissionHudCount | null;
    }
  | {
      readonly id: `${string}:${string}`;
      readonly readout: 'negative';
      read(unit: UnitSnapshot): number | null;
    };

/** HUD readers by namespaced id. Fixed once sealed; creating a stage seals it. */
export interface MissionHudReaderTable {
  register(reader: MissionHudReader): void;
  replace(reader: MissionHudReader): void;
  has(id: string): boolean;
  /** Readers in registration order; a replaced reader keeps its place. */
  values(): readonly MissionHudReader[];
  seal(): void;
  readonly sealed: boolean;
}

export function createMissionHudReaders(): MissionHudReaderTable {
  const readers = createSealedRegistry<MissionHudReader>('HUD reader');
  return {
    register: (reader) => readers.register(reader),
    replace: (reader) => readers.replace(reader),
    has: (id) => readers.has(id),
    values: () => readers.values(),
    seal: () => readers.seal(),
    get sealed() {
      return readers.sealed;
    },
  };
}

function count(
  value: MissionHudCount | null | undefined,
): MissionHudCount | null {
  if (!value || !(value.max > 0) || !Number.isFinite(value.left)) {
    return null;
  }
  return { left: Math.min(value.max, Math.max(0, value.left)), max: value.max };
}

/**
 * The readouts of a unit: the magazine from its skills, the pips and negative pool from the first reader of each that
 * reads a value. Enemies show no magazine.
 */
export function hudReadoutsOf(
  unit: UnitSnapshot,
  readers: readonly MissionHudReader[] = [],
): MissionHudReadouts {
  const ammo =
    unit.side === 'enemy'
      ? null
      : (unit.skills.find((skill) => skill.ammo)?.ammo ?? null);
  let pips: MissionHudCount | null = null;
  let negative = 0;
  for (const reader of readers) {
    if (reader.readout === 'pips') {
      pips ??= count(reader.read(unit));
    } else if (negative === 0) {
      const value = reader.read(unit);
      negative =
        value !== null && Number.isFinite(value)
          ? Math.min(1, Math.max(0, value))
          : 0;
    }
  }
  return { magazine: count(ammo), pips, negative };
}
