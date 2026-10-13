import {
  type AssetKey,
  fieldPath,
  indexPath,
  type PackManifest,
  type SchemaIssue,
} from 'arknights-assets-catalog';
import {
  AUDIO,
  COUNT,
  checkShape,
  fields,
  isObject,
  list,
  map,
  roles,
  type Shape,
} from '#schema/shape.js';

/** App sections of a pack manifest: owned and checked by alliance/data, beside the catalog fields the catalog reads. */

/** Interface sound roles. */
export const UI_CUES = [
  'click',
  'back',
  'confirm',
  'tab',
  'pick',
  'drop',
  'error',
  'buy',
  'sell',
  'income',
  'refresh',
  'freeze',
  'levelup',
  'merge',
  'equip',
  'itemMerge',
  'artPlace',
  'ready',
  'timer',
  'draft',
  'yourTurn',
  'yourTurnCircle',
  'target',
  'broadcast',
  'danger',
  'emote',
  'roundStart',
  'rest',
  'battleStart',
  'battleStartBoss',
  'bossRoundTeam',
  'bossRoundSingle',
  'bossRoundSecret',
  'killBoss',
  'killBossAll',
  'killBossNormal',
  'defenceStart',
  'defenceUnite',
  'battleOverReduce',
  'battleOverNoReduce',
  'battleOverNormal',
  'goFirst',
  'disconnect',
  'settlementSucceed',
  'settlementFail',
  'settlementTeam',
  'settlementBossSign',
  'goodEvaluation',
  'load',
  'start',
  'matchSucceed',
  'matchFail',
  'matchCancel',
  'joinRoom',
] as const;

/** Bond sound roles. */
export const BOND_CUES = ['levelUp'] as const;

/** Battle sound roles shared by every unit. */
export const BATTLE_CUES = [
  'deploy',
  'tokenDeploy',
  'charDie',
  'tokenDie',
  'enemyDie',
  'enemyDieHeavy',
  'enemyHit',
  'heal',
  'leak',
  'win',
  'lose',
  'killCoin',
] as const;

/** Music tracks by screen or phase. */
export const BGM_TRACKS = ['lobby', 'prep', 'combat', 'unite', 'boss'] as const;

export type UiCue = (typeof UI_CUES)[number];
export type BondCue = (typeof BOND_CUES)[number];
export type BattleCue = (typeof BATTLE_CUES)[number];

/** A sound by its role, e.g. `ui.click`, `bond.levelUp`, `battle.deploy`. */
export type CueRole = `ui.${UiCue}` | `bond.${BondCue}` | `battle.${BattleCue}`;

/** Rounds a combat track plays in, both ends included; no `to` means every round from `from` on. */
export interface RoundRange {
  readonly from: number;
  readonly to?: number;
}

const isBgmTrack = (name: string): boolean =>
  (BGM_TRACKS as readonly string[]).includes(name);

/** A music track: an optional intro played once, then the loop. */
export type BgmTrack = {
  readonly intro?: AssetKey;
  readonly loop?: AssetKey;
};

/** A combat track for some rounds. It replaces `bgm.combat` in its rounds. */
export type RoundTrack = BgmTrack & { readonly rounds: RoundRange };

/**
 * Cue table: sounds by cue role. Players and mods address a sound by its role, never by its file. `ui`, `bond` and `battle` map
 * role names to keys. `bgm` holds the tracks of `BGM_TRACKS`; `combat` the combat tracks by rounds, which must not
 * overlap. `bossBgm` holds the tracks by boss id.
 */
export type CueTable = {
  readonly ui?: { readonly [name in UiCue]?: AssetKey };
  readonly bond?: { readonly [name in BondCue]?: AssetKey };
  readonly battle?: { readonly [name in BattleCue]?: AssetKey };
  readonly bgm?: { readonly [track: string]: BgmTrack };
  readonly combat?: readonly RoundTrack[];
  readonly bossBgm?: { readonly [bossId: string]: BgmTrack };
};

/** App sections of a pack manifest. They sit beside the catalog fields; the catalog does not read them. */
export type PackApp = {
  readonly cues?: CueTable;
};

/** A pack manifest with its app sections. */
export type AppPackManifest = PackManifest & { readonly app?: PackApp };

const TRACK = fields({ intro: AUDIO, loop: AUDIO });

const CUE_FIELDS: Readonly<Record<keyof CueTable, Shape>> = {
  ui: map(AUDIO, roles(UI_CUES)),
  bond: map(AUDIO, roles(BOND_CUES)),
  battle: map(AUDIO, roles(BATTLE_CUES)),
  bgm: map(TRACK, isBgmTrack),
  combat: list({
    type: 'fields',
    fields: {
      rounds: {
        type: 'fields',
        fields: { from: COUNT, to: COUNT },
        required: ['from'],
      },
      intro: AUDIO,
      loop: AUDIO,
    },
    required: ['rounds'],
  }),
  bossBgm: map(TRACK),
};

/** Combat tracks whose rounds are reversed or overlap an earlier track. Runs after the shape check passed. */
function roundRangeIssues(
  issues: SchemaIssue[],
  cues: unknown,
  path: string,
): void {
  const combat = isObject(cues) ? cues.combat : undefined;
  if (!Array.isArray(combat)) {
    return;
  }
  const seen: { readonly index: number; readonly range: RoundRange }[] = [];
  (combat as readonly RoundTrack[]).forEach((track, index) => {
    const at = indexPath(fieldPath(path, 'combat'), index);
    const { from, to } = track.rounds;
    const end = to ?? Number.POSITIVE_INFINITY;
    if (end < from) {
      issues.push({ path: at, message: 'rounds end before they start' });
      return;
    }
    const other = seen.find(
      ({ range }) =>
        range.from <= end && from <= (range.to ?? Number.POSITIVE_INFINITY),
    );
    if (other) {
      issues.push({
        path: at,
        message: `rounds overlap combat track ${other.index}`,
      });
    }
    seen.push({ index, range: track.rounds });
  });
}

/** Checks a cue table: known roles, `audio` keys, and combat rounds from 1 that are not reversed and do not overlap. */
export function cueTableIssues(
  value: unknown,
  path = 'app.cues',
): readonly SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  checkShape(issues, value, fields(CUE_FIELDS), path);
  if (issues.length === 0) {
    roundRangeIssues(issues, value, path);
  }
  return issues;
}

/** Checks the app sections of a pack manifest. */
export function packAppIssues(
  value: unknown,
  path = 'app',
): readonly SchemaIssue[] {
  if (!isObject(value)) {
    return [{ path, message: 'expected an object' }];
  }
  return Object.entries(value).flatMap(([name, item]) =>
    name === 'cues'
      ? cueTableIssues(item, fieldPath(path, name))
      : [
          {
            path: fieldPath(path, name),
            message: `unknown name ${JSON.stringify(name)}`,
          },
        ],
  );
}

export function isPackApp(value: unknown): value is PackApp {
  return packAppIssues(value).length === 0;
}

/** Every key a cue table names, sorted. */
export function cueKeysOf(cues: CueTable): readonly AssetKey[] {
  const keys = new Set<AssetKey>();
  const track = (value: BgmTrack | undefined): void => {
    for (const key of [value?.intro, value?.loop]) {
      if (key) {
        keys.add(key);
      }
    }
  };
  for (const group of [cues.ui, cues.bond, cues.battle]) {
    for (const key of Object.values(group ?? {})) {
      if (key) {
        keys.add(key);
      }
    }
  }
  for (const value of [
    ...Object.values(cues.bgm ?? {}),
    ...(cues.combat ?? []),
    ...Object.values(cues.bossBgm ?? {}),
  ]) {
    track(value);
  }
  return [...keys].sort();
}

/** Keys of a cue table that `has` does not know. App data checks with it that every cue names a published asset. */
export function missingCueKeys(
  cues: CueTable,
  has: (key: AssetKey) => boolean,
): readonly AssetKey[] {
  return cueKeysOf(cues).filter((key) => !has(key));
}

/** Cue tables of the layers merged in order: a later layer replaces a role or a track by name, and the whole `combat` list. */
export function mergeCueTables(tables: readonly CueTable[]): CueTable {
  const merged: Record<string, unknown> = {};
  for (const table of tables) {
    for (const [name, value] of Object.entries(table)) {
      merged[name] =
        name === 'combat'
          ? value
          : { ...(merged[name] as object | undefined), ...value };
    }
  }
  return merged as CueTable;
}
