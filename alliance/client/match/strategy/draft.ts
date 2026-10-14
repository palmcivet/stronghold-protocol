import type { CatalogBand } from '@alliance/contract/catalog.js';

/** The official strategy a turn that runs out assigns while it is free, when the catalog names none. */
export const DEFAULT_TIMEOUT_BAND = 'band_bldsk';

/** Strategies teammates picked (never the viewer's): band → the players who picked it. */
export function teammateBands(
  picks: Readonly<Record<string, string>>,
  playerId: string | null,
): ReadonlyMap<string, readonly string[]> {
  const out = new Map<string, string[]>();
  for (const [player, band] of Object.entries(picks)) {
    if (player === playerId) {
      continue;
    }
    out.set(band, [...(out.get(band) ?? []), player]);
  }
  return out;
}

/** What the server assigns when the turn runs out: the default while free, else the first free strategy. */
export function timeoutBand(
  bands: readonly CatalogBand[],
  taken: ReadonlyMap<string, unknown>,
  defaultId: string,
): string | null {
  if (
    !taken.has(defaultId) &&
    (!bands.length || bands.some((band) => band.id === defaultId))
  ) {
    return defaultId;
  }
  return bands.find((band) => !taken.has(band.id))?.id ?? null;
}

/** The strategy the detail shows: the focused one, else my pick, else the timeout's; on my turn never one taken. */
export function draftSelection(
  focus: string | null,
  options: {
    readonly bands: readonly CatalogBand[];
    readonly taken: ReadonlyMap<string, unknown>;
    readonly myPick: string | null;
    readonly myTurn: boolean;
    readonly defaultId: string;
  },
): string | null {
  const { bands, taken, myPick, myTurn, defaultId } = options;
  if (!bands.length) {
    return focus;
  }
  const free = timeoutBand(bands, taken, defaultId) ?? bands[0]?.id ?? null;
  if (!focus) {
    return myPick ?? free;
  }
  if (!myPick && myTurn && taken.has(focus)) {
    return free;
  }
  return focus;
}

/** What a turn that runs out takes: the focused strategy while free, else the timeout's. Null after my pick. */
export function autoPickBand(
  focus: string | null,
  options: {
    readonly bands: readonly CatalogBand[];
    readonly taken: ReadonlyMap<string, unknown>;
    readonly myPick: string | null;
    readonly defaultId: string;
  },
): string | null {
  const { bands, taken, myPick, defaultId } = options;
  if (myPick) {
    return null;
  }
  if (focus && !taken.has(focus) && bands.some((band) => band.id === focus)) {
    return focus;
  }
  return timeoutBand(bands, taken, defaultId);
}

/** The bonds a strategy is built around that the mode switches off. */
export function bandOffBonds(
  band: CatalogBand,
  off: ReadonlySet<string>,
): readonly string[] {
  return (band.bondIds ?? []).filter((id) => off.has(id));
}
