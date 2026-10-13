import { createStore } from 'zustand/vanilla';

export interface LoadoutChoice {
  readonly skill?: number;
  readonly module?: string;
}

/** The loadout page's working copy, shared by its roster and detail parts. Local to this domain. */
export interface LoadoutState {
  readonly selected: string | null;
  readonly query: string;
  readonly tier: number | null;
  readonly changedOnly: boolean;
  readonly entries: Readonly<Record<string, LoadoutChoice>>;
  readonly saved: boolean;
  /** Base chess marked as not owned (`room.ownership`). */
  readonly notOwned: readonly string[];
  /** Custom squad picks by slot id (`room.diy`); a missing slot is empty. */
  readonly diy: Readonly<Record<string, string>>;
}

export const loadoutStore = createStore<LoadoutState>(() => ({
  selected: null,
  query: '',
  tier: null,
  changedOnly: false,
  entries: {},
  saved: false,
  notOwned: [],
  diy: {},
}));

export function chooseLoadout(id: string, change: LoadoutChoice): void {
  loadoutStore.setState((state) => ({
    saved: false,
    entries: { ...state.entries, [id]: { ...state.entries[id], ...change } },
  }));
}
