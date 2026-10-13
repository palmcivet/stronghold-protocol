import type { AssetKey } from 'arknights-assets-catalog';
import type { BattleEventType } from 'arknights-mission-core';
import type { MissionCueKind } from '#contract/cue.js';

export type MissionAudioCueType =
  | 'attack'
  | 'hit'
  | 'skill'
  | 'damage'
  | 'heal'
  | 'downed'
  | 'break'
  | 'deploy'
  | 'leak'
  | 'element'
  | 'status'
  | 'projectile';

export interface MissionAudioCue {
  readonly type: MissionAudioCueType;
  readonly eventType: BattleEventType;
  /** Kind of a `cue` event. */
  readonly kind?: MissionCueKind;
  readonly unitId?: string;
  readonly targetId?: string;
  /** Index of the active skill in the unit's skill list, from 0, carried by `attack-hit` and `hit`. */
  readonly skillSlot?: number;
  readonly asset?: AssetKey;
}
