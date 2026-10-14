import type {
  Catalog,
  CatalogBand,
  CatalogBond,
  CatalogBoss,
  CatalogChess,
  CatalogDiyChoice,
  CatalogDiySlot,
  CatalogEnemy,
  CatalogFaction,
  CatalogItem,
  CatalogMode,
  CatalogSkill,
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
  'garrisons',
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

/** A chess record's skills (`skills[]`, else the default `skill`), by index. */
function skillRecords(
  record: JsonRecord,
): { readonly index: number; readonly record: JsonRecord }[] {
  const list = Array.isArray(record.skills)
    ? record.skills
    : isJsonRecord(record.skill)
      ? [record.skill]
      : [];
  return list.flatMap((skill) =>
    isJsonRecord(skill) && Number.isInteger(skill.index)
      ? [{ index: skill.index as number, record: skill }]
      : [],
  );
}

function skillsOf(record: JsonRecord): CatalogSkill[] {
  return skillRecords(record).map(({ index, record: skill }) => ({
    index,
    spType: str(skill.spType),
    spCost: typeof skill.spCost === 'number' ? skill.spCost : null,
  }));
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
/** Master's `DIY_EXCLUDED_MODULE_TYPE`: modules of other game modes (集成战略, 生息演算) a custom pick never carries. */
const DIY_EXCLUDED_MODULE_TYPE = /^(?:ISW|SO|RA)-/;

/** Master's `statusKey`: the form key of a training status, `phase/level/skillLevel/equipLevel`. */
function statusKey(status: unknown): string {
  const s = isJsonRecord(status) ? status : {};
  return `${s.phase ?? 0}/${s.level ?? 1}/${s.skillLevel ?? 1}/${s.equipLevel ?? 0}`;
}

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
      ...(skillsOf(record).length ? { skills: skillsOf(record) } : {}),
      ...(strings(record.garrisonIds).length
        ? { garrisonIds: strings(record.garrisonIds) }
        : {}),
    };
    for (const skill of skillRecords(record)) {
      put(`data:chess.${id}.skill.${skill.index}.name`, skill.record.name);
      put(`data:chess.${id}.skill.${skill.index}.desc`, skill.record.desc);
    }
    const modules = Array.isArray(record.modules) ? record.modules : [];
    for (const module of modules.filter(isJsonRecord)) {
      const moduleId = str(module.uniEquipId);
      if (moduleId) {
        put(`data:module.${moduleId}.name`, module.name);
        put(`data:module.${moduleId}.type`, module.typeName);
        const trait = isJsonRecord(module.traitOverride)
          ? module.traitOverride
          : {};
        put(`data:module.${moduleId}.desc`, trait.moduleDesc);
      }
    }
    put(`data:chess.${id}.name`, record.name);
    put(`data:chess.${id}.appellation`, record.appellation);
    put(`data:chess.${id}.subProfession`, record.subProfessionName);
    const trait = isJsonRecord(record.trait) ? record.trait : null;
    put(`data:chess.${id}.trait`, trait?.desc ?? trait?.descRaw);
  }

  for (const [key, record] of records(input.garrisons)) {
    const id = str(record.garrisonId) ?? key;
    put(`data:garrison.${id}.desc`, record.desc ?? record.descRaw);
    put(`data:garrison.${id}.eventType`, record.eventTypeDesc);
  }

  const bands: Record<string, CatalogBand> = {};
  for (const [key, record] of records(input.bands)) {
    const id = str(record.bandId) ?? key;
    bands[id] = {
      id,
      sortId: num(record.sortId, 99),
      modeTypes: strings(record.modeTypeList),
      totalHp: num(record.totalHp),
      ...(Array.isArray(record.bondIds)
        ? { bondIds: strings(record.bondIds) }
        : {}),
    };
    put(`data:band.${id}.name`, record.name);
    put(`data:band.${id}.effect`, record.effectName);
    put(`data:band.${id}.desc`, record.desc);
  }

  const bonds: Record<string, CatalogBond> = {};
  for (const [key, record] of records(input.bonds)) {
    const id = str(record.bondId) ?? key;
    bonds[id] = {
      id,
      thresholds: numbers(record.thresholds),
      ...(typeof record.isCore === 'boolean' ? { core: record.isCore } : {}),
      ...(typeof record.bondOrder === 'number'
        ? { order: num(record.bondOrder) * 1000 + num(record.identifier) }
        : {}),
      ...(Array.isArray(record.visibleMembers)
        ? { members: strings(record.visibleMembers) }
        : {}),
      ...(record.noStack === true ? { noStack: true } : {}),
    };
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

  function scaleOf(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? value
      : fallback;
  }

  const enemies: Record<string, CatalogEnemy> = {};
  for (const [key, record] of records(input.enemies)) {
    const id = str(record.key) ?? key;
    enemies[id] = {
      id,
      rank: str(record.rank),
      fly: record.isFlyEnemy === true,
      modelScale: scaleOf(record.modelScale, 1),
      modelScaleY: scaleOf(record.modelScaleY, 1),
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
    const code = str(record.code);
    const iconId = str(record.iconId);
    modes[id] = {
      id,
      type: str(record.type) ?? 'SINGLE',
      difficulty: str(record.difficulty) ?? 'NORMAL',
      ...(code ? { code } : {}),
      ...(Number.isInteger(record.lastRound)
        ? { lastRound: record.lastRound as number }
        : {}),
      ...(Number.isInteger(record.hiddenRound)
        ? { hiddenRound: record.hiddenRound as number }
        : {}),
      ...(iconId ? { icon: `image:ui/modeIcon/${iconId}` } : {}),
      ...(Number.isInteger(record.bossRound)
        ? { bossRound: record.bossRound as number }
        : {}),
      ...(Array.isArray(record.stages)
        ? { stages: strings(record.stages).length }
        : {}),
      ...(Array.isArray(record.inactiveBondIds)
        ? { inactiveBonds: strings(record.inactiveBondIds) }
        : {}),
    };
    put(`data:mode.${id}.name`, record.name);
    put(`data:mode.${id}.desc`, record.desc);
    const effects = strings(record.effectDescList)
      .map((effect) => effect.replace(/^[·•・･\s]+/u, ''))
      .filter(Boolean);
    if (effects.length) {
      put(`data:mode.${id}.effects`, effects.join('\n'));
    }
  }

  const draftConfig = isJsonRecord(config.bandDraft) ? config.bandDraft : {};
  const timeoutBandId = str(draftConfig.timeoutBandId);

  const bosses: Record<string, CatalogBoss> = {};
  for (const [key, record] of records(input.bosses)) {
    const id = str(record.bossId) ?? key;
    const abilities = strings(record.abilities).filter(Boolean);
    bosses[id] = {
      id,
      enemyId: str(record.enemyKey),
      ...(abilities.length ? { abilities: abilities.length } : {}),
    };
    put(`data:boss.${id}.name`, record.name);
    if (abilities.length) {
      put(`data:boss.${id}.abilities`, abilities.join('\n'));
    }
  }

  for (const [key, record] of records(input.stages)) {
    put(`data:stage.${str(record.id) ?? key}.name`, record.name);
  }

  const factionTable = isJsonRecord(input.factions) ? input.factions : {};
  const factions: Record<string, CatalogFaction> = {};
  for (const [key, record] of records(factionTable.types)) {
    const id = str(record.type) ?? key;
    const icon = str(record.icon);
    factions[id] = {
      id,
      ...(icon ? { icon: `image:ui/enemyTypeIcon/${icon}` } : {}),
    };
    put(`data:faction.${id}.name`, record.name);
    put(`data:faction.${id}.desc`, record.desc);
  }

  const diySlots: CatalogDiySlot[] = [];
  const backups = isJsonRecord(input.backups) ? input.backups : {};
  const diy = isJsonRecord(backups.diy) ? backups.diy : {};
  const prototypes = isJsonRecord(diy.prototypes) ? diy.prototypes : {};
  const owned = strings(diy.ownedPool);
  const units = isJsonRecord(backups.units) ? backups.units : {};
  const lockedTable = isJsonRecord(diy.locked) ? diy.locked : {};
  for (const [id, record] of records(diy.slots)) {
    const tier = num(record.tier, 0);
    const candidates = [
      ...new Set([...strings(prototypes[String(tier)]), ...owned]),
    ];
    const normalKey = statusKey(chessRecords[id]?.status);
    const goldenId = str(record.goldenId);
    const eliteKey = statusKey(
      goldenId ? chessRecords[goldenId]?.status : undefined,
    );
    const lockedOfTier = isJsonRecord(lockedTable[String(tier)])
      ? lockedTable[String(tier)]
      : {};
    const choices: Record<string, CatalogDiyChoice> = {};
    for (const charId of candidates) {
      const unit = units[charId];
      const forms =
        isJsonRecord(unit) && isJsonRecord(unit.forms) ? unit.forms : {};
      const normal = isJsonRecord(forms[normalKey]) ? forms[normalKey] : {};
      const elite = isJsonRecord(forms[eliteKey]) ? forms[eliteKey] : {};
      const lock = isJsonRecord(lockedOfTier)
        ? lockedOfTier[charId]
        : undefined;
      choices[charId] = {
        skills: (Array.isArray(normal.skills) ? normal.skills : [])
          .map((skill) => (isJsonRecord(skill) ? skill.index : undefined))
          .filter((index): index is number => Number.isInteger(index)),
        modules: (Array.isArray(elite.modules) ? elite.modules : [])
          .filter(isJsonRecord)
          .filter(
            (module) =>
              !DIY_EXCLUDED_MODULE_TYPE.test(String(module.typeName ?? '')),
          )
          .map((module) => str(module.uniEquipId))
          .filter((module): module is string => module !== null),
        ...(isJsonRecord(lock) && Number.isInteger(lock.skillIndex)
          ? {
              locked: {
                skillIndex: lock.skillIndex as number,
                uniEquipId: str(lock.uniEquipId) ?? null,
              },
            }
          : {}),
      };
    }
    diySlots.push({ id, tier, candidates, choices });
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
      factions,
      diySlots,
      diyOwned: owned,
      ...(timeoutBandId ? { timeoutBandId } : {}),
    },
    text,
  };
}
