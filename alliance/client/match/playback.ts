import type { ServerMessage } from '@alliance/contract/server-message.js';
import type { Battle } from 'arknights-mission-core';
import type { MissionMap } from 'arknights-mission-renderer';
import type { BattleStart } from '#match/playback/bridge.js';

export interface LocalBattle {
  readonly start: BattleStart;
  readonly battle: Battle;
  readonly map: MissionMap;
}

export interface Playback {
  /** The battle this client runs, for the field to draw. */
  readonly local: () => LocalBattle | null;
  /** Handles `b.start`, `b.end` and `m.public`. */
  readonly onFrame: (frame: ServerMessage) => void;
  /** Advances the local battle by real seconds. */
  readonly advance: (seconds: number) => void;
  readonly subscribe: (listener: () => void) => () => void;
  readonly stop: () => void;
}
