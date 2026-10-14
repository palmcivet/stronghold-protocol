import { recentItem, recentStore } from '#entry/recent.js';
import {
  audioItem,
  displayItem,
  identityItem,
  keysItem,
  migrateSettingsSections,
  settingsStore,
} from '#infra/settings/index.js';
import {
  backendOf,
  configureStorage,
  envelope,
  type Item,
  persistStore,
  preload,
  type StorageHost,
  setServerOrigin,
} from '#infra/storage/index.js';
import { loadoutItem, loadoutStore, savedOf } from '#loadout/state.js';
import { tokenItem } from './identity.js';

/** Keys of the builds before the storage layer, and the item each one moves into (as its version 1). */
const LEGACY: readonly {
  readonly old: string;
  readonly item: Item<unknown>;
}[] = [
  { old: 'alliance.recentRooms', item: recentItem as Item<unknown> },
  { old: 'alliance.token', item: tokenItem as Item<unknown> },
];

/** Moves each old key once: its value becomes version 1 of the new item, so the item's migrations run on load. */
export async function migrateLegacy(): Promise<void> {
  await migrateSettingsSections();
  for (const { old, item } of LEGACY) {
    const backend = backendOf(item.spec.tier ?? 'small');
    const raw = await backend.get(old);
    if (raw === undefined || raw === null) {
      continue;
    }
    if ((await backend.get(item.key())) === undefined) {
      await backend.set(item.key(), envelope(1, raw));
    }
    await backend.delete(old);
  }
  // the first storage build also kept the tab's token in localStorage, where a new tab would inherit it
  await backendOf('small').delete(tokenItem.key());
}

/** The origin a server item is partitioned by: the host of the socket. */
export function serverOrigin(socketUrl: string): string {
  try {
    return new URL(socketUrl).host;
  } catch {
    return socketUrl;
  }
}

/**
 * Prepares storage before the stores are read: the host's adapters, the server origin, the one-time move of the
 * old keys, the preload into snapshots. Settings section persist/apply runs later via `startSettings` after
 * `registerOfficialSettings`.
 */
export async function startStorage(
  socketUrl: string,
  adapters?: Partial<StorageHost>,
): Promise<void> {
  if (adapters) {
    configureStorage(adapters);
  }
  setServerOrigin(serverOrigin(socketUrl));
  await migrateLegacy();
  await preload();
  // Seed the aggregate from preloaded section items so boot can read before startSettings.
  settingsStore.setState({
    ...identityItem.get(),
    ...displayItem.get(),
    ...audioItem.get(),
    ...keysItem.get(),
  });
  persistStore(
    recentStore,
    recentItem,
    (state) => state.codes,
    (codes) => ({ codes }),
  );
  persistStore(loadoutStore, loadoutItem, savedOf, (value) => value);
}
