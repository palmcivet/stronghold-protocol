import type { UnitStatsEntry } from '@alliance/contract/message.js';
import { createStore } from 'zustand/vanilla';

/** Prep-time start-of-battle stats from `m.unitStats` (keyed by board piece uid). */
export interface UnitStatsState {
  readonly seq: number | null;
  readonly round: number | null;
  readonly byUid: ReadonlyMap<number, UnitStatsEntry>;
}

export function initialUnitStats(): UnitStatsState {
  return { seq: null, round: null, byUid: new Map() };
}

export const unitStatsStore = createStore<UnitStatsState>(() =>
  initialUnitStats(),
);

/** Apply a server `m.unitStats` frame. */
export function applyUnitStats(message: {
  readonly seq: number | null;
  readonly round: number;
  readonly units: readonly UnitStatsEntry[];
}): void {
  const byUid = new Map<number, UnitStatsEntry>();
  for (const unit of message.units) {
    if (unit && Number.isInteger(unit.uid) && unit.uid !== null) {
      byUid.set(unit.uid, unit);
    }
  }
  unitStatsStore.setState({
    seq: message.seq,
    round: message.round,
    byUid,
  });
}
