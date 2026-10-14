import * as v from 'valibot';
import { beforeEach, describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { memoryBackend, type StorageBackend } from './backend.js';
import {
  backendOf,
  configureStorage,
  memoryHost,
  serverScope,
  setServerOrigin,
} from './host.js';
import {
  damagedKey,
  defineItem,
  envelope,
  persistStore,
  preload,
} from './item.js';
import { parseKey, storageKey } from './key.js';
import { createModStorage } from './mod.js';
import { createModIds, isModId, parseModId } from './mod-id.js';

beforeEach(() => {
  configureStorage(memoryHost());
  setServerOrigin('play.example:3001');
});

describe('mod ids', () => {
  it('takes <author>/<mod> in lowercase kebab-case, 2 to 32 characters each', () => {
    for (const ok of [
      'example/chat',
      'ab/cd',
      'a-1/stats-2',
      `${'a'.repeat(32)}/xx`,
    ]) {
      expect(isModId(ok), ok).toBe(true);
    }
    for (const bad of [
      'chat',
      'example/chat/x',
      'Example/chat',
      'example/c',
      'example/-chat',
      'example/chat-',
      'example/ch--at',
      'example/ch_at',
      `${'a'.repeat(33)}/xx`,
      'core/chat',
      'wsde/chat',
      'official/chat',
      'examples/stats',
      'example:chat',
    ]) {
      expect(isModId(bad), bad).toBe(false);
    }
  });

  it('rejects the mod that loads later with an id already loaded', () => {
    const ids = createModIds();
    expect(ids.claim('example/chat', 'sha256-aaa')).toBe('example/chat');
    expect(() => ids.claim('example/chat', 'sha256-bbb')).toThrow(/rejected/);
    expect(() => ids.claim('core/chat', 'sha256-ccc')).toThrow();
    expect(ids.claim('examples/stats', 'bundled', { bundled: true })).toBe(
      'examples/stats',
    );
    ids.release('example/chat');
    expect(ids.claim('example/chat', 'sha256-bbb')).toBe('example/chat');
  });
});

describe('keys', () => {
  it('reads wsde:<scope>:<owner>:<key>, the server scope partitioned by origin', () => {
    expect(storageKey({ kind: 'device' }, 'example/chat', 'room.panel')).toBe(
      'wsde:device:example/chat:room.panel',
    );
    expect(storageKey({ kind: 'device' }, 'core', 'settings')).toBe(
      'wsde:device:core:settings',
    );
    const server = storageKey(serverScope(), 'core', 'a:b');
    expect(server).toBe('wsde:server=play.example%3A3001:core:a%3Ab');
    expect(parseKey(server)).toEqual({
      scope: { kind: 'server', origin: 'play.example:3001' },
      owner: 'core',
      key: 'a:b',
    });
    expect(parseKey('alliance.settings')).toBeNull();
  });

  it('takes only the core or a valid mod id as the owner', () => {
    expect(() => storageKey({ kind: 'device' }, 'Chat', 'x')).toThrow();
    expect(() => storageKey({ kind: 'device' }, 'o/x', 'x')).toThrow();
    // a mod the app ships may use a reserved author
    expect(storageKey({ kind: 'device' }, 'examples/stats', 'x')).toBe(
      'wsde:device:examples/stats:x',
    );
  });
});

describe('items', () => {
  const spec = {
    scope: 'device' as const,
    owner: 'core',
    key: 'sample',
    schema: v.object({ count: v.number(), label: v.string() }),
    version: 3,
    migrations: {
      1: (data: unknown) => ({ count: Number((data as { n: string }).n) }),
      2: (data: unknown) => ({ ...(data as object), label: 'two' }),
    },
    fallback: () => ({ count: 0, label: '' }),
  };

  it('runs the migration chain and stores the upgraded value', async () => {
    const item = defineItem(spec);
    await backendOf('small').set(item.key(), envelope(1, { n: '7' }));
    expect(await item.load()).toEqual({ count: 7, label: 'two' });
    expect(await backendOf('small').get(item.key())).toEqual(
      envelope(3, { count: 7, label: 'two' }),
    );
  });

  it('keeps a damaged raw value as a backup and falls back', async () => {
    const item = defineItem({ ...spec, key: 'broken' });
    for (const raw of [envelope(9, {}), envelope(3, { count: 'x' }), 'text']) {
      await backendOf('small').set(item.key(), raw);
      expect(await item.load()).toEqual({ count: 0, label: '' });
      expect(await backendOf('small').get(damagedKey(item.spec))).toMatchObject(
        {
          raw,
        },
      );
    }
  });

  it('serves a snapshot after the preload and writes through', async () => {
    const item = defineItem({ ...spec, key: 'snap' });
    await backendOf('small').set(
      item.key(),
      envelope(3, { count: 2, label: 'x' }),
    );
    expect(item.get()).toEqual({ count: 0, label: '' });
    await preload(['device']);
    expect(item.get()).toEqual({ count: 2, label: 'x' });
    await item.set({ count: 3, label: 'y' });
    expect(item.get().count).toBe(3);
    expect(await backendOf('small').get(item.key())).toEqual(
      envelope(3, { count: 3, label: 'y' }),
    );
  });

  it("keeps a store in step, including another instance's writes", async () => {
    const listeners = new Set<(key: string) => void>();
    const shared = memoryBackend();
    const watching: StorageBackend = {
      ...shared,
      watch: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    configureStorage({ small: watching });
    const item = defineItem({ ...spec, key: 'bound' });
    const store = createStore(() => ({ count: 0, label: '', other: 1 }));
    persistStore(
      store,
      item,
      (state) => ({ count: state.count, label: state.label }),
      (value) => value,
    );
    store.setState({ count: 5 });
    await Promise.resolve();
    expect(await shared.get(item.key())).toEqual(
      envelope(3, { count: 5, label: '' }),
    );
    await shared.set(item.key(), envelope(3, { count: 9, label: 'tab' }));
    for (const listener of listeners) {
      listener(item.key());
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.getState()).toMatchObject({
      count: 9,
      label: 'tab',
      other: 1,
    });
  });
});

describe('mod storage', () => {
  const keys = {
    'room.panel': {
      scope: 'device' as const,
      schema: v.object({ open: v.boolean() }),
      version: 1,
      fallback: () => ({ open: false }),
    },
    history: {
      scope: 'server' as const,
      schema: v.array(v.string()),
      version: 1,
      fallback: () => [] as string[],
    },
  };
  const make = (backend: StorageBackend, quota?: number) =>
    createModStorage({
      modId: 'example/chat',
      keys,
      backend,
      server: serverScope,
      ...(quota === undefined ? {} : { quota }),
    });

  it('reads and writes only declared keys, under its own id', async () => {
    const backend = memoryBackend();
    const { storage } = make(backend);
    expect(await storage.get('room.panel')).toEqual({ open: false });
    await storage.set('room.panel', { open: true });
    expect(await backend.get('wsde:device:example/chat:room.panel')).toEqual(
      envelope(1, { open: true }),
    );
    await expect(storage.get('other')).rejects.toThrow(/not declared/);
    await expect(storage.set('room.panel', { open: 'yes' })).rejects.toThrow(
      /schema/,
    );
    expect(() =>
      createModStorage({ modId: 'core', keys, backend, server: serverScope }),
    ).toThrow();
  });

  it('holds the quota, clears on uninstall, exports and imports, and shows a read-only view', async () => {
    const backend = memoryBackend();
    await backend.set('wsde:device:core:settings', 1);
    const host = make(backend, 64);
    await host.storage.set('history', ['a']);
    await expect(host.storage.set('history', ['x'.repeat(80)])).rejects.toThrow(
      /quota/,
    );
    const saved = await host.storage.export();
    expect(saved).toEqual({ history: envelope(1, ['a']) });

    const view = await host.inspect();
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.keys(view)).toEqual([
      'wsde:server=play.example%3A3001:example/chat:history',
    ]);

    await host.clear();
    expect(await host.storage.get('history')).toEqual([]);
    expect(await backend.get('wsde:device:core:settings')).toBe(1);

    expect(
      await host.storage.import({ ...saved, junk: 1, 'room.panel': 'bad' }),
    ).toEqual(['junk', 'room.panel']);
    expect(await host.storage.get('history')).toEqual(['a']);
  });

  it('keeps one mod out of another', async () => {
    const backend = memoryBackend();
    await make(backend).storage.set('room.panel', { open: true });
    const other = createModStorage({
      modId: parseModId('someone/chat'),
      keys,
      backend,
      server: serverScope,
    });
    expect(await other.storage.get('room.panel')).toEqual({ open: false });
    await other.clear();
    expect(await make(backend).storage.get('room.panel')).toEqual({
      open: true,
    });
  });
});
