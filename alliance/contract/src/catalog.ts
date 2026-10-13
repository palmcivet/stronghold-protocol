import type { LoadoutOptions } from '#contract/message.js';

/** Rule-side view of a season the client reads. Display text is not part of it: names and descriptions come from `data:` keys. */

export interface CatalogChess {
  readonly id: string;
  readonly baseId: string;
  /** Operator the chess fields, the owner of its art and voice. */
  readonly charId: string | null;
  readonly goldenId: string | null;
  readonly golden: boolean;
  readonly tier: number;
  readonly rarity: number;
  readonly profession: string | null;
  readonly bondIds: readonly string[];
  /** Offered by the shop and the loadout list. */
  readonly visible: boolean;
  /** Loadout choices of a base chess. Empty for an elite one. */
  readonly loadout: LoadoutOptions | null;
  /** A base chess the player may mark as not owned; its stand-in takes the field (`room.ownership`). */
  readonly droppable?: boolean;
}

export interface CatalogBand {
  readonly id: string;
  readonly sortId: number;
  /** Mode types the strategy is offered in, empty for every mode. */
  readonly modeTypes: readonly string[];
  readonly totalHp: number;
}

export interface CatalogBond {
  readonly id: string;
  readonly thresholds: readonly number[];
}

export interface CatalogItem {
  readonly id: string;
  readonly tier: number;
  readonly kind: string | null;
}

export interface CatalogEnemy {
  readonly id: string;
  readonly rank: string | null;
  readonly fly: boolean;
}

/** A wave the season may send. The server picks the wave of a round. */
export interface CatalogWave {
  readonly id: string;
  readonly kind: string;
  readonly bossId: string | null;
  /** Enemies the wave spawns, each once. */
  readonly enemyIds: readonly string[];
}

/** An enemy leader; `enemyId` is the enemy it fields, the owner of its portrait. */
export interface CatalogBoss {
  readonly id: string;
  readonly enemyId: string | null;
}

/** A custom squad slot (`room.diy`): the tier it fills and the operators it may field. */
export interface CatalogDiySlot {
  readonly id: string;
  readonly tier: number;
  readonly candidates: readonly string[];
}

export interface CatalogMode {
  readonly id: string;
  readonly type: string;
  readonly difficulty: string;
}

export interface Catalog {
  readonly chess: Readonly<Record<string, CatalogChess>>;
  readonly bands: Readonly<Record<string, CatalogBand>>;
  readonly bonds: Readonly<Record<string, CatalogBond>>;
  readonly items: Readonly<Record<string, CatalogItem>>;
  readonly enemies: Readonly<Record<string, CatalogEnemy>>;
  readonly waves: Readonly<Record<string, CatalogWave>>;
  readonly modes: Readonly<Record<string, CatalogMode>>;
  readonly bosses?: Readonly<Record<string, CatalogBoss>>;
  readonly diySlots?: readonly CatalogDiySlot[];
}

/** Display text of a catalog, keyed by `data:` keys such as `data:chess.<id>.name`. */
export type CatalogText = Readonly<Record<string, string>>;

export const EMPTY_CATALOG: Catalog = Object.freeze({
  chess: {},
  bands: {},
  bonds: {},
  items: {},
  enemies: {},
  waves: {},
  modes: {},
});

/** Strategies offered in a mode type, in sort order. */
export function bandsForMode(
  catalog: Catalog,
  modeType: string | null,
): readonly CatalogBand[] {
  return Object.values(catalog.bands)
    .filter(
      (band) =>
        modeType === null ||
        band.modeTypes.length === 0 ||
        band.modeTypes.includes(modeType),
    )
    .sort(
      (left, right) =>
        left.sortId - right.sortId ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    );
}
