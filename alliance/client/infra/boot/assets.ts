import { createPreloader } from '../resource/preloader.js';
import { loadResourceStore, type ResourceStore } from '../resource/store.js';
import {
  assetsStore,
  bindMatchAssets,
  releaseMatchAssets,
} from '../store/assets.js';
import { catalogStore } from '../store/catalog.js';
import { matchStore } from '../store/match.js';
import { presenceStore } from '../store/presence.js';

/** Resources of a master backend: its `data/assets.json` and its art, through the page's origin. */
export function loadCompatResources(): Promise<ResourceStore> {
  return loadResourceStore({ compat: { backend: '/' } });
}

/**
 * Binds the match assets when the server starts a match and releases them when the player leaves it, and keeps the
 * preload group of the screen loaded: the room, the match, then its results.
 */
export function installAssets(): () => void {
  const preloader = createPreloader();

  const sync = (): void => {
    const { presence } = presenceStore.getState();
    if (presence.kind === 'in-match') {
      bindMatchAssets(presence.code);
    } else {
      releaseMatchAssets();
    }
    const match = matchStore.getState();
    const bound = assetsStore.getState().match;
    if (bound) {
      const input = {
        catalog: bound.catalog,
        public: match.public,
        private: match.private,
      };
      if (match.result) {
        preloader.show('results', bound.resources, input);
      } else if (match.public) {
        preloader.show('match', bound.resources, input);
      }
      return;
    }
    const { resources } = assetsStore.getState();
    if (presence.kind === 'in-match') {
      // the match binds its snapshot once the resources and the catalog are loaded
      preloader.clear();
      return;
    }
    if (presence.kind === 'in-room' && resources) {
      preloader.show('room', resources, {
        catalog: catalogStore.getState().catalog,
        public: null,
        private: null,
      });
      return;
    }
    preloader.clear();
  };

  const stops = [
    presenceStore.subscribe(sync),
    matchStore.subscribe(sync),
    assetsStore.subscribe(sync),
    catalogStore.subscribe(sync),
  ];
  sync();
  return () => {
    for (const stop of stops) {
      stop();
    }
    preloader.clear();
  };
}
