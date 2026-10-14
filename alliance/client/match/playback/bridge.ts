import type { BattleStartMessage } from '@alliance/contract/server-message.js';
import type { Battle, BattleSpec, MissionModule } from 'arknights-mission-core';
import type { MissionMap } from 'arknights-mission-renderer';

/** A `b.start` message without its type. */
export type BattleStart = Omit<BattleStartMessage, 't'>;

/** Fields of a `b.progress` frame beside `battleId`. */
export interface BattleProgress {
  readonly gt: number;
  readonly killed: number;
  readonly total: number;
  /** Ally deploy-cost pool for the combat HUD COST readout. */
  readonly dp?: number;
  readonly done?: boolean;
}

/** What the backend's battle wire needs from the engine. A backend without one leaves its battles to the server. */
export interface BattleBridge {
  /** Engine spec, battle modules and map of a `b.start` spec, or null when the spec cannot be run here. */
  prepare(start: BattleStart): {
    readonly spec: BattleSpec;
    readonly modules: readonly MissionModule[];
    readonly map: MissionMap;
  } | null;
  progress(battle: Battle, start: BattleStart): BattleProgress;
  /** The `b.result` payload of a finished battle. */
  result(battle: Battle, start: BattleStart): unknown;
}
