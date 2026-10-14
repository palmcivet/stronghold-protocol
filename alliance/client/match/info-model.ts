import type { Catalog, CatalogBond } from '@alliance/contract/catalog.js';
import type { PublicView } from '@alliance/contract/server-message.js';

/** `off`: the mode never activates the bond; `drawn`: drawn off this match, still activatable through other members. */
export type BondState = 'off' | 'drawn' | null;

export interface MatchInfoModel {
  readonly stateOf: (bondId: string) => BondState;
  /** Whether the mode switches any bond off; the legend names it then. */
  readonly modeOff: boolean;
  readonly core: readonly CatalogBond[];
  readonly addon: readonly CatalogBond[];
  /** Banned chess the catalog knows, by tier. */
  readonly banned: readonly string[];
  readonly bannedSet: ReadonlySet<string>;
  /** Banned members per bond. */
  readonly bannedOf: (bondId: string) => number;
}

/** What the match-info blocks show, as master's matchInfoModel: the two kinds of greyed bonds, the bond rows, the banned. */
export function matchInfoModel(
  view: PublicView,
  catalog: Catalog,
): MatchInfoModel {
  const off = new Set(catalog.modes[view.modeId]?.inactiveBonds ?? []);
  const drawn = new Set(
    (view.drawnDisabledBonds ?? view.disabledBonds ?? []).filter(
      (id) => !off.has(id),
    ),
  );
  const bonds = Object.values(catalog.bonds).sort(
    (left, right) =>
      (left.order ?? 0) - (right.order ?? 0) ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  );
  const tierOf = (id: string): number => catalog.chess[id]?.tier ?? 0;
  const banned = (view.bannedChess ?? [])
    .filter((id) => catalog.chess[id] !== undefined)
    .sort((left, right) => tierOf(left) - tierOf(right));
  const bannedSet = new Set(banned);
  const perBond = new Map(
    bonds.map((bond) => [
      bond.id,
      (bond.members ?? []).filter((id) => bannedSet.has(id)).length,
    ]),
  );
  return {
    stateOf: (id) => (off.has(id) ? 'off' : drawn.has(id) ? 'drawn' : null),
    modeOff: off.size > 0,
    core: bonds.filter((bond) => bond.core === true),
    addon: bonds.filter((bond) => bond.core !== true),
    banned,
    bannedSet,
    bannedOf: (id) => perBond.get(id) ?? 0,
  };
}
