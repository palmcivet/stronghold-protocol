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
  /** Skill details by skill index; names and descriptions are `data:chess.<id>.skill.<index>.name` / `.desc`. */
  readonly skills?: readonly CatalogSkill[];
  /** Operator 特质 (garrisons.json); text at `data:garrison.<id>.desc` / `.eventType`. */
  readonly garrisonIds?: readonly string[];
  /** A base chess the player may mark as not owned; its stand-in takes the field (`room.ownership`). */
  readonly droppable?: boolean;
}

export interface CatalogSkill {
  readonly index: number;
  /** Master's `spType`, such as `INCREASE_WITH_TIME`. */
  readonly spType: string | null;
  readonly spCost: number | null;
}

export interface CatalogBand {
  readonly id: string;
  readonly sortId: number;
  /** Mode types the strategy is offered in, empty for every mode. */
  readonly modeTypes: readonly string[];
  readonly totalHp: number;
  /** Bonds the strategy is built around; a mode that switches one off marks the strategy. */
  readonly bondIds?: readonly string[];
}

export interface CatalogBond {
  readonly id: string;
  readonly thresholds: readonly number[];
  /** A core bond; the others are add-ons. */
  readonly core?: boolean;
  /** Where the briefing lists it. */
  readonly order?: number;
  /** The chess shown as its members. */
  readonly members?: readonly string[];
  /** The game never shows its layers. */
  readonly noStack?: boolean;
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
  /** Official battle-prefab scale over the standard 0.27; 1 when the record has none. */
  readonly modelScale: number;
  /** Vertical stretch of the model (Graphic sy/sx); 1 when the record has none. */
  readonly modelScaleY: number;
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
  /** How many abilities `data:boss.<id>.abilities` lists, one per line. */
  readonly abilities?: number;
}

/** A special-enemy type; `icon` is the image key of its badge. */
export interface CatalogFaction {
  readonly id: string;
  readonly icon?: string;
}

/** A custom squad slot (`room.diy`): the tier it fills and the operators it may field. */
export interface CatalogDiySlot {
  readonly id: string;
  readonly tier: number;
  readonly candidates: readonly string[];
  /** What each candidate may carry in this slot, by charId: master's `pickChoices`. */
  readonly choices?: Readonly<Record<string, CatalogDiyChoice>>;
}

/** A custom squad candidate's skills and modules (`room.diy` `skillIndex` and `uniEquipId`); a prototype's are locked. */
export interface CatalogDiyChoice {
  /** Skill indexes of the slot's normal form, in data order. */
  readonly skills: readonly number[];
  /** Modules of the elite form, other game modes' ones left out. */
  readonly modules: readonly string[];
  readonly locked?: {
    readonly skillIndex: number;
    readonly uniEquipId: string | null;
  };
}

export interface CatalogMode {
  readonly id: string;
  readonly type: string;
  readonly difficulty: string;
  /** Short code shown on the difficulty card, such as `AC-2`. */
  readonly code?: string;
  /** The last round of the mode. */
  readonly lastRound?: number;
  /** The round of the hidden core, when the mode has one. */
  readonly hiddenRound?: number;
  /** Image key of the mode icon. */
  readonly icon?: string;
  /** The round the enemy leader comes. */
  readonly bossRound?: number;
  /** How many battlefields the mode draws from. */
  readonly stages?: number;
  /** Bonds the mode switches off. */
  readonly inactiveBonds?: readonly string[];
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
  readonly factions?: Readonly<Record<string, CatalogFaction>>;
  /** The strategy a draft turn that runs out assigns while it is free. */
  readonly timeoutBandId?: string;
  readonly diySlots?: readonly CatalogDiySlot[];
  /** Owned 6★ operators a custom slot may field; they take a potential and cultivation like the roster. */
  readonly diyOwned?: readonly string[];
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
