import { afterEach, describe, expect, it } from 'vitest';
import { recentItem, recentStore } from '#entry/recent.js';
import {
  backendOf,
  configureStorage,
  memoryHost,
} from '#infra/storage/index.js';
import { loadoutItem, loadoutStore } from '#loadout/state.js';
import { tokenItem } from './identity.js';
import { startStorage } from './storage.js';

afterEach(() => {
  loadoutStore.setState({ entries: {}, ops: {}, notOwned: [], diy: {} });
});

describe('boot storage', () => {
  it('moves the old token and recent rooms once, into the server scope and the tab secret slot', async () => {
    const host = memoryHost();
    await host.small.set('alliance.recentRooms', ['AAAA', 'BBBB']);
    await host.secureTab.set('alliance.token', 'tok-1');
    await host.small.set('wsde:server=play.example:core:token', {
      v: 1,
      data: 'leaked',
    });
    await startStorage('wss://play.example/ws', host);
    expect(recentItem.key()).toBe('wsde:server=play.example:core:recentRooms');
    expect(recentStore.getState().codes).toEqual(['AAAA', 'BBBB']);
    expect(tokenItem.get()).toBe('tok-1');
    expect(await host.secureTab.get(tokenItem.key())).toEqual({
      v: 1,
      data: 'tok-1',
    });
    expect(await host.small.get('alliance.recentRooms')).toBeUndefined();
    expect(await host.secureTab.get('alliance.token')).toBeUndefined();
    // a token never stays where a new tab would inherit it
    expect(
      await host.small.get('wsde:server=play.example:core:token'),
    ).toBeUndefined();
  });

  it('keeps the loadout working copy in the server scope', async () => {
    configureStorage(memoryHost());
    await startStorage('ws://other.example:3001/ws');
    loadoutStore.setState({ ops: { char_a: { potential: 2 } } });
    await Promise.resolve();
    expect(await backendOf('small').get(loadoutItem.key())).toMatchObject({
      data: { ops: { char_a: { potential: 2 } } },
    });
    expect(loadoutItem.key()).toBe(
      'wsde:server=other.example%3A3001:core:loadout',
    );
  });
});
