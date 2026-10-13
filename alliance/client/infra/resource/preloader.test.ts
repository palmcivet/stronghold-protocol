import { EMPTY_CATALOG } from '@alliance/contract/catalog.js';
import {
  type AssetKey,
  type AssetResolver,
  createAssetResolver,
  type PackAsset,
} from 'arknights-assets-catalog';
import { describe, expect, it } from 'vitest';
import { createPreloader } from './preloader.js';
import type { ResourceStore } from './store.js';

const HASH = 'aa'.repeat(32);
const ROOM: AssetKey = 'image:ui/room/banner';
const MATCH: AssetKey = 'image:ui/match/frame';

function resolver(): AssetResolver {
  const asset = (preloadGroup: string): PackAsset => ({
    kind: 'image',
    files: [{ role: 'main', name: null, format: 'png', bytes: 1, hash: HASH }],
    dependsOn: [],
    fallbackId: null,
    preloadGroup,
  });
  return createAssetResolver([
    {
      url: 'https://cdn.example/res/base/',
      manifest: {
        schemaVersion: 1,
        pack: { type: 'base', id: 'base', version: '1', contentHash: HASH },
        requires: [],
        fileRoot: 'files/',
        assets: { [ROOM]: asset('room'), [MATCH]: asset('match') },
      },
    },
  ]);
}

function fakeResources() {
  const loads: (readonly AssetKey[])[] = [];
  const released: AssetKey[] = [];
  const resources = {
    resolver: resolver(),
    preload: async (keys: readonly AssetKey[]) => {
      loads.push(keys);
      return keys;
    },
    release: (key: AssetKey) => {
      released.push(key);
    },
  } as unknown as ResourceStore;
  return { resources, loads, released };
}

const INPUT = { catalog: EMPTY_CATALOG, public: null, private: null };

describe('preloader', () => {
  it('loads a group once and drops it when the next one shows', async () => {
    const { resources, loads, released } = fakeResources();
    const preloader = createPreloader();
    preloader.show('room', resources, INPUT);
    preloader.show('room', resources, INPUT);
    expect(loads).toEqual([[ROOM]]);

    preloader.show('match', resources, INPUT);
    await Promise.resolve();
    await Promise.resolve();
    expect(loads).toEqual([[ROOM], [MATCH]]);
    expect(released).toEqual([ROOM]);
    expect(preloader.shown()).toBe('match');

    preloader.clear();
    await Promise.resolve();
    await Promise.resolve();
    expect(released).toEqual([ROOM, MATCH]);
    expect(preloader.shown()).toBeNull();
  });
});
