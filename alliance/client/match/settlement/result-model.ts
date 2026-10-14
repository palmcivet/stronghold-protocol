import type { CatalogBond } from '@alliance/contract/catalog.js';
import type {
  ResultBond,
  ResultRow,
  ResultView,
} from '@alliance/contract/server-message.js';

/** The statistics a card lists, in master's order. */
export const STAT_KEYS = [
  'dmgDealt',
  'kills',
  'bossDamage',
  'activatedLayers',
  'merges',
  'itemsEquipped',
  'gold',
  'perfectRounds',
  'refreshes',
  'leaks',
  'lpLost',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];

/** Master shows the first seven present, then the remaining LP. */
const STAT_LIMIT = 7;
/** A card lists at most six bonds, as master's. */
const BOND_LIMIT = 6;

/** A bond as the card shows it; `layers` is null when the game never shows them. */
export interface CardBond {
  readonly bondId: string;
  readonly active: boolean;
  readonly layers: number | null;
}

/** A player's card data, as master's `normalizeResult` and `resultBonds`. */
export interface CardModel {
  readonly row: ResultRow;
  readonly stats: readonly StatKey[];
  readonly bonds: readonly CardBond[];
  /** The remaining LP: the shared pool from the Final Assault on. */
  readonly lp: number | null;
  readonly lpShared: boolean;
}

/** Active bonds and those holding layers, most shown layers first, at most six. */
export function cardBonds(
  bonds: readonly ResultBond[] | undefined,
  catalog: Readonly<Record<string, CatalogBond>>,
): CardBond[] {
  const list = (bonds ?? []).map((bond) => ({
    bondId: bond.bondId,
    active: bond.active === true,
    layers: catalog[bond.bondId]?.noStack ? null : (bond.layers ?? 0),
  }));
  return list
    .filter((bond) => bond.active || (bond.layers ?? 0) > 0)
    .sort((a, b) => (b.layers ?? 0) - (a.layers ?? 0))
    .slice(0, BOND_LIMIT);
}

/** The card of one row. */
export function cardOf(
  row: ResultRow,
  result: ResultView,
  catalog: Readonly<Record<string, CatalogBond>>,
): CardModel {
  const shared = typeof result.teamLp === 'number';
  const lp = shared
    ? row.alive === false
      ? 0
      : Math.max(0, result.teamLp ?? 0)
    : Number.isFinite(row.lp)
      ? (row.lp ?? 0)
      : null;
  return {
    row,
    stats: STAT_KEYS.filter((key) => Number.isFinite(row.stats?.[key])).slice(
      0,
      STAT_LIMIT,
    ),
    bonds: cardBonds(row.bonds, catalog),
    lp,
    lpShared: shared,
  };
}

/** The best player of each statistic, when more than one player is listed and the best is above zero. */
export function bestOf(
  rows: readonly ResultRow[],
): Partial<Record<StatKey, string>> {
  const best: Partial<Record<StatKey, string>> = {};
  if (rows.length < 2) {
    return best;
  }
  for (const key of STAT_KEYS) {
    let top: { value: number; id: string } | null = null;
    for (const row of rows) {
      const value = row.stats?.[key];
      if (
        value !== undefined &&
        Number.isFinite(value) &&
        value > 0 &&
        (top === null || value > top.value)
      ) {
        top = { value, id: row.playerId };
      }
    }
    if (top) {
      best[key] = top.id;
    }
  }
  return best;
}

/** The rows in seat order. */
export function seatOrder(rows: readonly ResultRow[]): ResultRow[] {
  return [...rows].sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
}

/** `m:ss` of a duration in milliseconds. */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Compact figure for a result statistic (master fmtNum for zh-Hans 万 / 亿). */
export function formatStat(value: number | undefined | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return '—';
  }
  const n = value;
  const abs = Math.abs(n);
  if (abs >= 1e8) {
    return `${(n / 1e8).toFixed(abs >= 1e9 ? 0 : 1)}亿`;
  }
  if (abs >= 1e5) {
    return `${(n / 1e4).toFixed(abs >= 1e6 ? 0 : 1)}万`;
  }
  return Math.round(n).toLocaleString('en-US');
}
