import type { AssetKey } from 'arknights-assets-catalog';
import {
  type PreloadGroup,
  type PreloadInput,
  preloadKeys,
} from './preload.js';
import type { ResourceStore } from './store.js';

export interface Preloader {
  /** Loads the group and drops the group shown before. Showing the shown group again does nothing. */
  show(
    group: PreloadGroup,
    resources: ResourceStore,
    input: Omit<PreloadInput, 'resolver'>,
  ): void;
  /** Drops the group shown. */
  clear(): void;
  readonly shown: () => PreloadGroup | null;
}

export function createPreloader(): Preloader {
  let shown: {
    readonly group: PreloadGroup;
    readonly resources: ResourceStore;
    readonly loaded: Promise<readonly (AssetKey | null)[]>;
  } | null = null;

  function clear(): void {
    if (!shown) {
      return;
    }
    const { resources, loaded } = shown;
    shown = null;
    void loaded.then((keys) => {
      for (const key of keys) {
        if (key) {
          resources.release(key);
        }
      }
    });
  }

  return {
    show(group, resources, input) {
      if (shown?.group === group && shown.resources === resources) {
        return;
      }
      clear();
      const keys = preloadKeys(group, {
        ...input,
        resolver: resources.resolver,
      });
      shown = { group, resources, loaded: resources.preload(keys) };
    },
    clear,
    shown: () => shown?.group ?? null,
  };
}
