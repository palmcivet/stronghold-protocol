import type { Catalog } from '@alliance/contract/catalog.js';
import { missingCueKeys } from '@alliance/data/pack-app';
import { createStore } from 'zustand/vanilla';
import type { ResourceStore } from '../resource/store.js';
import { catalogStore } from './catalog.js';

/** The assets a match plays with. Bound when the match starts and kept as is until it ends. */
export interface MatchAssets {
  readonly code: string;
  readonly resources: ResourceStore;
  readonly catalog: Catalog;
}

export interface AssetsState {
  /** The current resource store. A reload replaces it; a running match keeps its own. */
  readonly resources: ResourceStore | null;
  readonly match: MatchAssets | null;
}

export const assetsStore = createStore<AssetsState>(() => ({
  resources: null,
  match: null,
}));

/**
 * Binds the current resources and catalog to the match of the room. A match already bound keeps its snapshot. Null
 * while the resources or the catalog are still loading; the match binds once they are there.
 */
export function bindMatchAssets(code: string): MatchAssets | null {
  const bound = assetsStore.getState().match;
  if (bound?.code === code) {
    return bound;
  }
  const { resources } = assetsStore.getState();
  const { catalog, loaded } = catalogStore.getState();
  if (!resources || !loaded) {
    return null;
  }
  // A missing cue key only plays nothing; development builds name the keys.
  if (import.meta.env.DEV) {
    const warning = missingCueWarning(resources);
    if (warning) {
      console.warn(warning);
    }
  }
  const match: MatchAssets = Object.freeze({ code, resources, catalog });
  assetsStore.setState({ match });
  return match;
}

/** Warning for the cue keys of the merged cue table that no layer publishes, or null when every key is there. */
export function missingCueWarning(resources: ResourceStore): string | null {
  const missing = missingCueKeys(resources.cues, (key) =>
    resources.resolver.has(key),
  );
  return missing.length > 0
    ? `cue keys no pack publishes, played as silence: ${missing.join(', ')}`
    : null;
}

export function releaseMatchAssets(): void {
  if (assetsStore.getState().match) {
    assetsStore.setState({ match: null });
  }
}
