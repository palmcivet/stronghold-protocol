import type {
  Catalog,
  CatalogBand,
  CatalogBond,
  CatalogBoss,
  CatalogChess,
  CatalogDiySlot,
  CatalogEnemy,
  CatalogItem,
  CatalogMode,
  CatalogText,
  CatalogWave,
} from '@alliance/contract/catalog.js';
import {
  type ChessRecord,
  loadoutOptions,
} from '@alliance/contract/message.js';
import { isJsonRecord } from '#data/asset/leaves.js';
import type { JsonRecord } from '#data/asset/rules.js';

/** Files of a master backend's `/data/` the catalog is read from. */
export const UPSTREAM_CATALOG_TABLES = [
  'chess',
  'bands',
  'bonds',
  'items',
  'enemies',
  'waves',
  'config',
  'bosses',
  'stages',
  'factions',
  'backups',
] as const;

export type UpstreamCatalogTable = (typeof UPSTREAM_CATALOG_TABLES)[number];

export type UpstreamCatalogInput = Readonly<
  Partial<Record<UpstreamCatalogTable, unknown>>
>;

export interface UpstreamCatalog {
  readonly catalog: Catalog;
  readonly text: CatalogText;
}

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;
const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const strings = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
const numbers = (value: unknown): readonly number[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is number =>
          typeof item === 'number' && Number.isFinite(item),
      )
    : [];

function records(value: unknown): readonly [string, JsonRecord][] {
  if (!isJsonRecord(value)) {
    return [];
  }
  return Object.entries(value).filter((entry): entry is [string, JsonRecord] =>
    isJsonRecord(entry[1]),
  );
}

function bondIdsOf(record: JsonRecord): readonly string[] {
  const bonds = record.bonds;
  if (!Array.isArray(bonds)) {
    return [];
  }
  return bonds
    .map((bond) =>
      typeof bond === 'string' ? bond : isJsonRecord(bond) ? bond.bondId : null,
    )
    .filter((id): id is string => typeof id === 'string');
}

function loadoutOf(
  record: JsonRecord,
  all: Readonly<Record<string, JsonRecord>>,
): CatalogChess['loadout'] {
  if (record.isGolden === true || record.isDiy === true) {
    return null;
  }
  const goldenId = str(record.goldenId);
  const golden = goldenId ? all[goldenId] : undefined;
  return loadoutOptions(
    record as ChessRecord,
    (golden as ChessRecord | undefined) ?? null,
  );
}

/** A NORMAL base chess with an official stand-in of another operator (master `shared/standIn.js` `isDroppableChess`). */
function isDroppable(record: JsonRecord): boolean {
  const backup = isJsonRecord(record.backup) ? record.backup : null;
  const baseId = str(record.baseId);
  return (
    backup !== null &&
    record.isGolden !== true &&
    record.isDiy !== true &&
    record.chessType === 'NORMAL' &&
    (baseId === null || baseId === str(record.chessId)) &&
    str(backup.charId) !== null &&
    backup.charId !== record.charId
  );
}

/** Maps the master data tables to the catalog view and its `data:` text. Records without an id are skipped. */
export function buildUpstreamCatalog(
  input: UpstreamCatalogInput,
): UpstreamCatalog {
  const text: Record<string, string> = {};
  const put = (key: string, value: unknown): void => {
    const content = str(value);
    if (content !== null) {
      text[key] = content;
    }
  };

  const chess: Record<string, CatalogChess> = {};
  const chessRecords = Object.fromEntries(records(input.chess));
  for (const [key, record] of records(input.chess)) {
    const id = str(record.chessId) ?? key;
    chess[id] = {
      id,
      baseId: str(record.baseId) ?? id,
      charId: str(record.charId),
      goldenId: str(record.goldenId),
      golden: record.isGolden === true,
      tier: num(record.tier, 1),
      rarity: num(record.rarity),
      profession: str(record.profession),
      bondIds: bondIdsOf(record),
      visible: record.visible !== false && record.isHidden !== true,
      loadout: loadoutOf(record, chessRecords),
      droppable: isDroppable(record),
    };
    put(`data:chess.${id}.name`, record.name);
  }

  const bands: Record<string, CatalogBand> = {};
  for (const [key, record] of records(input.bands)) {
    const id = str(record.bandId) ?? key;
    bands[id] = {
      id,
      sortId: num(record.sortId, 99),
      modeTypes: strings(record.modeTypeList),
      totalHp: num(record.totalHp),
    };
    put(`data:band.${id}.name`, record.name);
    put(`data:band.${id}.effect`, record.effectName);
    put(`data:band.${id}.desc`, record.desc);
  }

  const bonds: Record<string, CatalogBond> = {};
  for (const [key, record] of records(input.bonds)) {
    const id = str(record.bondId) ?? key;
    bonds[id] = { id, thresholds: numbers(record.thresholds) };
    put(`data:bond.${id}.name`, record.name);
    put(`data:bond.${id}.desc`, record.desc);
  }

  const items: Record<string, CatalogItem> = {};
  for (const [key, record] of records(input.items)) {
    const id = str(record.id) ?? key;
    items[id] = { id, tier: num(record.tier, 1), kind: str(record.itemType) };
    put(`data:item.${id}.name`, record.name);
    put(`data:item.${id}.desc`, record.desc);
  }

  const enemies: Record<string, CatalogEnemy> = {};
  for (const [key, record] of records(input.enemies)) {
    const id = str(record.key) ?? key;
    enemies[id] = {
      id,
      rank: str(record.rank),
      fly: record.isFlyEnemy === true,
    };
    put(`data:enemy.${id}.name`, record.name);
  }

  const waves: Record<string, CatalogWave> = {};
  for (const [key, record] of records(input.waves)) {
    const id = str(record.id) ?? key;
    const spawns = Array.isArray(record.spawns) ? record.spawns : [];
    const enemyIds = new Set<string>();
    for (const spawn of spawns) {
      const enemyId = isJsonRecord(spawn) ? str(spawn.key) : null;
      if (enemyId) {
        enemyIds.add(enemyId);
      }
    }
    waves[id] = {
      id,
      kind: str(record.kind) ?? 'normal',
      bossId: str(record.bossId),
      enemyIds: [...enemyIds],
    };
  }

  const modes: Record<string, CatalogMode> = {};
  const config = isJsonRecord(input.config) ? input.config : {};
  for (const [key, record] of records(config.modes)) {
    const id = str(record.modeId) ?? key;
    modes[id] = {
      id,
      type: str(record.type) ?? 'SINGLE',
      difficulty: str(record.difficulty) ?? 'NORMAL',
    };
    put(`data:mode.${id}.name`, record.name);
    put(`data:mode.${id}.desc`, record.desc);
  }

  const bosses: Record<string, CatalogBoss> = {};
  for (const [key, record] of records(input.bosses)) {
    const id = str(record.bossId) ?? key;
    bosses[id] = { id, enemyId: str(record.enemyKey) };
    put(`data:boss.${id}.name`, record.name);
  }

  for (const [key, record] of records(input.stages)) {
    put(`data:stage.${str(record.id) ?? key}.name`, record.name);
  }

  const factions = isJsonRecord(input.factions) ? input.factions : {};
  for (const [key, record] of records(factions.types)) {
    const id = str(record.type) ?? key;
    put(`data:faction.${id}.name`, record.name);
    put(`data:faction.${id}.desc`, record.desc);
  }

  const diySlots: CatalogDiySlot[] = [];
  const backups = isJsonRecord(input.backups) ? input.backups : {};
  const diy = isJsonRecord(backups.diy) ? backups.diy : {};
  const prototypes = isJsonRecord(diy.prototypes) ? diy.prototypes : {};
  const owned = strings(diy.ownedPool);
  for (const [id, record] of records(diy.slots)) {
    const tier = num(record.tier, 0);
    diySlots.push({
      id,
      tier,
      candidates: [
        ...new Set([...strings(prototypes[String(tier)]), ...owned]),
      ],
    });
  }
  for (const [id, record] of records(diy.operators)) {
    put(`data:operator.${id}.name`, record.name);
  }

  return {
    catalog: {
      chess,
      bands,
      bonds,
      items,
      enemies,
      waves,
      modes,
      bosses,
      diySlots,
    },
    text,
  };
}
