import type { AssetKey, SchemaIssue } from 'arknights-assets-catalog';
import {
  checkShape,
  fields,
  KEY,
  KEY_MAP,
  KEYS,
  map,
  type Shape,
} from '#schema/shape.js';

/** Keys by domain id or by name. */
export type KeyMap = { readonly [name: string]: AssetKey };

export type CharSpineRefs = {
  readonly front?: AssetKey;
  readonly back?: AssetKey;
};

export type CharRefs = {
  readonly avatar?: AssetKey;
  /** Elite 2 avatar; the pack gives it a fallback to `avatar`. */
  readonly avatarElite?: AssetKey;
  readonly portrait?: AssetKey;
  readonly portraitElite?: AssetKey;
  readonly spine?: CharSpineRefs;
};

export type SkinRefs = {
  readonly spine?: CharSpineRefs;
};

export type EnemyRefs = {
  readonly icon?: AssetKey;
  readonly spine?: AssetKey;
};

export type TokenRefs = {
  readonly icon?: AssetKey;
  readonly spine?: AssetKey;
  /** Skin variants of the battle Spine by variant name. */
  readonly spineVariants?: KeyMap;
};

export type ProfRefs = {
  /** Profession badges by profession id. */
  readonly icon?: KeyMap;
  readonly large?: KeyMap;
  readonly card?: KeyMap;
  /** Sub-profession icons by sub-profession id. */
  readonly sub?: KeyMap;
};

/** Voice lines of one operator: slot name to the keys of its lines. */
export type VoiceSlots = { readonly [slot: string]: readonly AssetKey[] };

/** Sound effects by group (`battle`, `ui`, `autochess`) and sound name. */
export type SfxRefs = { readonly [group: string]: KeyMap };

/** Fonts by family and weight. */
export type FontRefs = { readonly [family: string]: KeyMap };

/** `refs` of the base pack: mappings that do not depend on a mode. */
export type BaseRefs = {
  readonly chars?: { readonly [charId: string]: CharRefs };
  /** Operator skins by the safe name of the skin model. */
  readonly skins?: { readonly [skinId: string]: SkinRefs };
  readonly enemies?: { readonly [enemyId: string]: EnemyRefs };
  readonly tokens?: { readonly [tokenId: string]: TokenRefs };
  /** Skill icons by icon id. */
  readonly skills?: KeyMap;
  readonly prof?: ProfRefs;
  /** Faction logos by faction id. */
  readonly camp?: KeyMap;
  readonly voice?: { readonly [charId: string]: VoiceSlots };
  readonly sfx?: SfxRefs;
  readonly fonts?: FontRefs;
};

export type BoardRefs = {
  /** Derived board tiles. */
  readonly theme?: AssetKey;
};

/** `refs` of a season pack: mappings that belong to the mode. */
export type SeasonRefs = {
  readonly bgm?: KeyMap;
  readonly sfx?: SfxRefs;
  readonly bands?: KeyMap;
  readonly bonds?: KeyMap;
  /** Trap item images by item id. */
  readonly items?: KeyMap;
  /** Animation role table of the season. */
  readonly animRoles?: AssetKey;
  /** Full-viewport plate behind every page. */
  readonly backdrop?: AssetKey;
  readonly board?: BoardRefs;
};

/** `refs` after the layers are merged: base names and season names side by side. */
export type ResourceRefs = BaseRefs & SeasonRefs;

const BASE_FIELDS: Readonly<Record<keyof BaseRefs, Shape>> = {
  chars: map(
    fields({
      avatar: KEY,
      avatarElite: KEY,
      portrait: KEY,
      portraitElite: KEY,
      spine: fields({ front: KEY, back: KEY }),
    }),
  ),
  skins: map(fields({ spine: fields({ front: KEY, back: KEY }) })),
  enemies: map(fields({ icon: KEY, spine: KEY })),
  tokens: map(fields({ icon: KEY, spine: KEY, spineVariants: KEY_MAP })),
  skills: KEY_MAP,
  prof: fields({ icon: KEY_MAP, large: KEY_MAP, card: KEY_MAP, sub: KEY_MAP }),
  camp: KEY_MAP,
  voice: map(map(KEYS)),
  sfx: map(KEY_MAP),
  fonts: map(KEY_MAP),
};

const SEASON_FIELDS: Readonly<Record<keyof SeasonRefs, Shape>> = {
  bgm: KEY_MAP,
  sfx: map(KEY_MAP),
  bands: KEY_MAP,
  bonds: KEY_MAP,
  items: KEY_MAP,
  animRoles: KEY,
  backdrop: KEY,
  board: fields({ theme: KEY }),
};

/** Top-level `refs` names of the base pack. */
export const BASE_REF_NAMES: readonly (keyof BaseRefs)[] = Object.freeze(
  Object.keys(BASE_FIELDS) as (keyof BaseRefs)[],
);

/** Top-level `refs` names of a season pack. */
export const SEASON_REF_NAMES: readonly (keyof SeasonRefs)[] = Object.freeze(
  Object.keys(SEASON_FIELDS) as (keyof SeasonRefs)[],
);

function refsIssues(
  value: unknown,
  shape: Readonly<Record<string, Shape>>,
  path: string,
): readonly SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  checkShape(issues, value, fields(shape), path);
  return issues;
}

// MARK: guards

/** Checks the base pack `refs`: only base names, each with its shape, every leaf a key. */
export function baseRefsIssues(
  value: unknown,
  path = 'refs',
): readonly SchemaIssue[] {
  return refsIssues(value, BASE_FIELDS, path);
}

/** Checks a season pack `refs`: only season names, each with its shape, every leaf a key. */
export function seasonRefsIssues(
  value: unknown,
  path = 'refs',
): readonly SchemaIssue[] {
  return refsIssues(value, SEASON_FIELDS, path);
}

/** Checks merged `refs`. A name both packs use, such as `sfx`, has the same shape in both. */
export function resourceRefsIssues(
  value: unknown,
  path = 'refs',
): readonly SchemaIssue[] {
  return refsIssues(value, { ...BASE_FIELDS, ...SEASON_FIELDS }, path);
}

export function isBaseRefs(value: unknown): value is BaseRefs {
  return baseRefsIssues(value).length === 0;
}

export function isSeasonRefs(value: unknown): value is SeasonRefs {
  return seasonRefsIssues(value).length === 0;
}

export function isResourceRefs(value: unknown): value is ResourceRefs {
  return resourceRefsIssues(value).length === 0;
}
