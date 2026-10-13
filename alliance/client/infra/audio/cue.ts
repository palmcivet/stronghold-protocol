import { PHASE } from '@alliance/contract/match.js';
import type {
  LayerMessage,
  PublicView,
} from '@alliance/contract/server-message.js';
import type {
  BgmTrack,
  CueRole,
  CueTable,
  RoundTrack,
} from '@alliance/data/pack-app';
import { type AssetKey, assetKindOf } from 'arknights-assets-catalog';

export type { CueRole };

/** A music track by its role: `lobby`, `prep`, `combat`, `unite`, `boss`, or `boss:<bossId>`. */
export type TrackRole = string;

/** Keys of a music track: an optional intro played once, then the loop. */
export interface TrackKeys {
  readonly intro: AssetKey | null;
  readonly loop: AssetKey;
}

const audioOnly = (key: AssetKey | undefined): AssetKey | null =>
  key !== undefined && assetKindOf(key) === 'audio' ? key : null;

/** `audio:` key of a cue role, or null when the cue table gives it no sound. */
export function cueKey(cues: CueTable, role: CueRole): AssetKey | null {
  const dot = role.indexOf('.');
  const group = cues[role.slice(0, dot) as 'ui' | 'bond' | 'battle'];
  const names = group as Readonly<Record<string, AssetKey>> | undefined;
  return audioOnly(names?.[role.slice(dot + 1)]);
}

/** The combat track whose rounds hold the round. */
function roundTrack(
  combat: readonly RoundTrack[] | undefined,
  round: number | null,
): BgmTrack | undefined {
  if (!combat || round === null) {
    return undefined;
  }
  return combat.find(
    ({ rounds }) =>
      rounds.from <= round && (rounds.to === undefined || round <= rounds.to),
  );
}

/**
 * Keys of a track role. `combat` takes the track of the cue table's `combat` whose rounds hold the round when there is one, `boss:<id>` falls back
 * to `boss`, `unite` to `combat`. Null when the packs give the track no loop.
 */
export function trackKeys(
  cues: CueTable,
  role: TrackRole,
  round: number | null = null,
): TrackKeys | null {
  const bgm = cues.bgm;
  const chain = role.startsWith('boss:')
    ? [cues.bossBgm?.[role.slice('boss:'.length)], bgm?.boss]
    : role === 'unite'
      ? [bgm?.unite, bgm?.combat]
      : role === 'combat'
        ? [roundTrack(cues.combat, round), bgm?.combat]
        : [bgm?.[role]];
  for (const track of chain) {
    const loop = audioOnly(track?.loop);
    if (track && loop) {
      return { intro: audioOnly(track.intro), loop };
    }
  }
  return null;
}

/** Track role of the screen: the lobby outside a match, else by the phase of the match. */
export function trackFor(
  inMatch: boolean,
  view: Pick<PublicView, 'phase' | 'bossId' | 'hiddenBossId'> | null,
): TrackRole {
  if (!inMatch || !view) {
    return 'lobby';
  }
  switch (view.phase) {
    case PHASE.LOBBY:
    case PHASE.INFO_CHECK:
    case PHASE.BAND_DRAFT:
    case PHASE.BATTLE_CHECK:
    case PHASE.RESULT:
      return 'lobby';
    case PHASE.UNITE:
      return 'unite';
    case PHASE.COMBAT:
      return 'combat';
    case PHASE.FINAL_ASSAULT:
      return view.bossId ? `boss:${view.bossId}` : 'boss';
    case PHASE.HIDDEN_CORE: {
      const boss = view.hiddenBossId ?? view.bossId;
      return boss ? `boss:${boss}` : 'boss';
    }
    default:
      return 'prep';
  }
}

/** Cue of a bond layer gain: one per gain of the player's own bonds, none for another player or no gain. */
export function layerCue(
  message: LayerMessage,
  playerId: string | null,
): CueRole | null {
  return message.playerId === playerId && message.bondId && message.add > 0
    ? 'bond.levelUp'
    : null;
}
