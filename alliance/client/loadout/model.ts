import type { Catalog, CatalogChess } from '@alliance/contract/catalog.js';
import {
  CULTIVATE_DEFAULT,
  isCultivate,
  isPotential,
  LOADOUT_LIMITS,
  POTENTIAL_DEFAULT,
} from '@alliance/contract/message.js';

/** A skill or module choice; a missing field is the default. */
export interface LoadoutChoice {
  readonly skill?: number;
  readonly module?: string;
}

/** An operator's potential (潜能 1–6) and cultivation (练度 0–3); a missing field is the default. */
export interface OpsChoice {
  readonly potential?: number;
  readonly cultivate?: number;
}

export type Entries = Readonly<Record<string, LoadoutChoice>>;
export type Ops = Readonly<Record<string, OpsChoice>>;

/** The effective choice of a chess, as master's `effectiveChoice`. */
export function effectiveChoice(
  entries: Entries,
  chess: CatalogChess,
): { skill: number | null; module: string | null; changed: boolean } {
  const options = chess.loadout;
  if (!options) {
    return { skill: null, module: null, changed: false };
  }
  const entry = entries[chess.id];
  const skill =
    entry?.skill !== undefined && options.skills.includes(entry.skill)
      ? entry.skill
      : options.defaultSkill;
  const module =
    entry?.module !== undefined && options.modules.includes(entry.module)
      ? entry.module
      : options.defaultModule;
  return {
    skill,
    module,
    changed: skill !== options.defaultSkill || module !== options.defaultModule,
  };
}

/** Sets part of a chess's choice; an entry equal to the defaults is removed, as master's `setChoice`. */
export function setChoice(
  entries: Entries,
  chess: CatalogChess,
  patch: LoadoutChoice,
): Entries {
  const options = chess.loadout;
  if (!options) {
    return entries;
  }
  const current = effectiveChoice(entries, chess);
  const skill =
    patch.skill !== undefined && options.skills.includes(patch.skill)
      ? patch.skill
      : current.skill;
  const module =
    patch.module !== undefined && options.modules.includes(patch.module)
      ? patch.module
      : current.module;
  const { [chess.id]: _drop, ...rest } = entries;
  const entry: { skill?: number; module?: string } = {};
  if (skill !== null && skill !== options.defaultSkill) {
    entry.skill = skill;
  }
  if (module !== null && module !== options.defaultModule) {
    entry.module = module;
  }
  return Object.keys(entry).length ? { ...rest, [chess.id]: entry } : rest;
}

/** The entries to send: the ones still legal for the loaded data, the rest dropped one by one, as master's `sanitizeEntries`. */
export function sanitizeEntries(entries: Entries, catalog: Catalog): Entries {
  const out: Record<string, LoadoutChoice> = {};
  for (const [id, entry] of Object.entries(entries)) {
    if (Object.keys(out).length >= LOADOUT_LIMITS.entries) {
      break;
    }
    const chess = catalog.chess[id];
    if (!chess?.loadout || !chess.visible || chess.golden) {
      continue;
    }
    const kept = setChoice({}, chess, entry)[id];
    if (kept) {
      out[id] = kept;
    }
  }
  return out;
}

/** The effective potential and cultivation of an operator. */
export function opsOf(
  ops: Ops,
  charId: string,
): { potential: number; cultivate: number; changed: boolean } {
  const entry = ops[charId];
  const potential = isPotential(entry?.potential)
    ? entry.potential
    : POTENTIAL_DEFAULT;
  const cultivate = isCultivate(entry?.cultivate)
    ? entry.cultivate
    : CULTIVATE_DEFAULT;
  return {
    potential,
    cultivate,
    changed: potential !== POTENTIAL_DEFAULT || cultivate !== CULTIVATE_DEFAULT,
  };
}

/** Sets part of an operator's potential and cultivation; an entry equal to the defaults is removed. */
export function setOps(ops: Ops, charId: string, patch: OpsChoice): Ops {
  const current = opsOf(ops, charId);
  const potential = isPotential(patch.potential)
    ? patch.potential
    : current.potential;
  const cultivate = isCultivate(patch.cultivate)
    ? patch.cultivate
    : current.cultivate;
  const { [charId]: _drop, ...rest } = ops;
  const entry: { potential?: number; cultivate?: number } = {};
  if (potential !== POTENTIAL_DEFAULT) {
    entry.potential = potential;
  }
  if (cultivate !== CULTIVATE_DEFAULT) {
    entry.cultivate = cultivate;
  }
  return Object.keys(entry).length ? { ...rest, [charId]: entry } : rest;
}

/**
 * The operators that take a potential and cultivation, as master's `cultivationCharIds`: the charIds of the
 * visible base chess and the owned custom-squad operators.
 */
export function cultivationCharIds(catalog: Catalog): ReadonlySet<string> {
  const out = new Set<string>();
  for (const chess of Object.values(catalog.chess)) {
    if (
      chess.charId &&
      chess.visible &&
      !chess.golden &&
      chess.baseId === chess.id &&
      chess.loadout !== null
    ) {
      out.add(chess.charId);
    }
  }
  for (const charId of catalog.diyOwned ?? []) {
    out.add(charId);
  }
  return out;
}

/** The settings to send: master refuses the whole message for an unknown operator, so those are dropped first. */
export function sanitizeOps(ops: Ops, catalog: Catalog): Ops {
  const known = cultivationCharIds(catalog);
  const out: Record<string, OpsChoice> = {};
  for (const charId of Object.keys(ops)) {
    if (Object.keys(out).length >= LOADOUT_LIMITS.ops) {
      break;
    }
    if (!known.has(charId)) {
      continue;
    }
    const kept = setOps({}, charId, ops[charId] ?? {})[charId];
    if (kept) {
      out[charId] = kept;
    }
  }
  return out;
}
