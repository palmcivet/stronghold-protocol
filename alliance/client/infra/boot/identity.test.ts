import { describe, expect, it } from 'vitest';
import { memoryBackend, type StorageBackend } from '#infra/storage/index.js';
import {
  createIdentity,
  type IdentityChannel,
  identityItems,
  RECENT_MAX,
  tokenHash,
} from './identity.js';

/** A BroadcastChannel stand-in: every tab hears the others' messages, never its own. */
function hub() {
  const tabs: ((event: { data: unknown }) => void)[][] = [];
  const log: unknown[] = [];
  return {
    log,
    channel(): IdentityChannel {
      const own: ((event: { data: unknown }) => void)[] = [];
      tabs.push(own);
      return {
        postMessage: (message) => {
          log.push(message);
          for (const listeners of tabs) {
            if (listeners !== own) {
              for (const listener of listeners) {
                listener({ data: structuredClone(message) });
              }
            }
          }
        },
        addEventListener: (_type, listener) => own.push(listener),
      };
    },
  };
}

const freshDevice = () => {
  const backend = memoryBackend();
  return () => backend;
};

/** One tab: its own tab slot (or a copy, for a duplicated tab), the device slot shared. */
async function tab(options: {
  readonly id: string;
  readonly device: () => StorageBackend;
  readonly channel: IdentityChannel | null;
  readonly tabSlot?: StorageBackend;
  readonly onYield?: () => void;
  readonly at?: number;
}) {
  const slot = options.tabSlot ?? memoryBackend();
  const items = identityItems({ tab: () => slot, device: options.device });
  await Promise.all(Object.values(items).map((item) => item.load()));
  const identity = createIdentity({
    tabId: options.id,
    channel: options.channel,
    items,
    queryMs: 0,
    wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
    now: () => options.at ?? 1000,
    ...(options.onYield ? { onYield: options.onYield } : {}),
  });
  return { identity, slot };
}

async function copyOf(slot: StorageBackend): Promise<StorageBackend> {
  const copy = memoryBackend();
  for (const key of await slot.keys()) {
    await copy.set(key, await slot.get(key));
  }
  return copy;
}

describe('tab identity', () => {
  it('keeps the own token across a reload and claims it with its first welcome', async () => {
    const deviceSlot = freshDevice();
    const first = await tab({
      id: 'a',
      device: deviceSlot,
      channel: hub().channel(),
      at: 500,
    });
    await first.identity.init();
    first.identity.saveToken('tok-a');
    // the reloaded page: the old document is gone, so nothing on its channel answers
    const reloaded = await tab({
      id: 'a2',
      device: deviceSlot,
      channel: hub().channel(),
      tabSlot: first.slot,
    });
    expect(await reloaded.identity.init()).toBe('tok-a');
    expect(reloaded.identity.getTokenClaim()).toEqual({
      noReplace: false,
      claimAt: 500,
    });
  });

  it('never gives a new tab the token of a live tab, and broadcasts only hashes', async () => {
    const bus = hub();
    const deviceSlot = freshDevice();
    const live = await tab({
      id: 'a',
      device: deviceSlot,
      channel: bus.channel(),
    });
    await live.identity.init();
    live.identity.saveToken('tok-live');
    const fresh = await tab({
      id: 'b',
      device: deviceSlot,
      channel: bus.channel(),
    });
    expect(await fresh.identity.init()).toBeNull();
    expect(fresh.identity.getToken()).toBeNull();
    expect(JSON.stringify(bus.log)).not.toContain('tok-live');
    expect(JSON.stringify(bus.log)).toContain(tokenHash('tok-live'));
  });

  it('takes the latest token of a closed tab, with noReplace so it never displaces a connected session', async () => {
    const deviceSlot = freshDevice();
    const closed = await tab({
      id: 'a',
      device: deviceSlot,
      channel: hub().channel(),
    });
    await closed.identity.init();
    closed.identity.saveToken('tok-closed');
    const next = await tab({
      id: 'b',
      device: deviceSlot,
      channel: hub().channel(),
    });
    expect(await next.identity.init()).toBe('tok-closed');
    expect(next.identity.getTokenClaim()).toEqual({ noReplace: true });
  });

  it('turns a duplicated tab into a new player instead of kicking the original', async () => {
    const bus = hub();
    const deviceSlot = freshDevice();
    const original = await tab({
      id: 'b',
      device: deviceSlot,
      channel: bus.channel(),
      at: 100,
    });
    await original.identity.init();
    original.identity.saveToken('tok-1');
    const duplicate = await tab({
      id: 'a',
      device: deviceSlot,
      channel: bus.channel(),
      tabSlot: await copyOf(original.slot),
    });
    expect(await duplicate.identity.init()).toBeNull();
    expect(original.identity.getToken()).toBe('tok-1');
  });

  it('gives a rejected claim up and reconnects with the next choice', async () => {
    let yielded = 0;
    const own = await tab({
      id: 'a',
      device: freshDevice(),
      channel: hub().channel(),
      onYield: () => {
        yielded += 1;
      },
    });
    await own.identity.init();
    own.identity.saveToken('tok-1');
    own.identity.rejectToken();
    expect(own.identity.getToken()).toBeNull();
    expect(yielded).toBe(1);
  });

  it('uses only its own token without a channel', async () => {
    const deviceSlot = freshDevice();
    const first = await tab({ id: 'a', device: deviceSlot, channel: null });
    await first.identity.init();
    first.identity.saveToken('tok-a');
    const other = await tab({ id: 'b', device: deviceSlot, channel: null });
    expect(await other.identity.init()).toBeNull();
  });

  it(`keeps at most ${RECENT_MAX} recent tokens`, async () => {
    const deviceSlot = freshDevice();
    const one = await tab({ id: 'a', device: deviceSlot, channel: null });
    await one.identity.init();
    for (const token of ['t1', 't2', 't3', 't4', 't5']) {
      one.identity.saveToken(token);
    }
    const items = identityItems({ device: deviceSlot });
    expect(await items.recentTokensItem.load()).toEqual([
      't5',
      't4',
      't3',
      't2',
    ]);
  });
});

describe('recovering a closed tab’s seat', () => {
  it('lists the seats of closed tabs and takes one back unless a live tab holds it', async () => {
    const bus = hub();
    const deviceSlot = freshDevice();
    /** A tab slot that already holds its own token. */
    const own = async (token: string) => {
      const seed = await tab({
        id: `seed-${token}`,
        device: deviceSlot,
        channel: null,
      });
      await seed.identity.init();
      seed.identity.saveToken(token);
      return seed.slot;
    };
    const otherSlot = await own('tok-own');
    const closed = await tab({
      id: 'a',
      device: deviceSlot,
      channel: hub().channel(),
    });
    await closed.identity.init();
    closed.identity.saveToken('tok-seat');
    closed.identity.rememberMatch({ name: '阿米娅', code: 'ABCD' });

    const other = await tab({
      id: 'b',
      device: deviceSlot,
      channel: bus.channel(),
      tabSlot: otherSlot,
    });
    expect(await other.identity.init()).toBe('tok-own');
    expect(other.identity.recoverable()).toEqual([
      { id: tokenHash('tok-seat'), name: '阿米娅', code: 'ABCD' },
    ]);
    expect(await other.identity.resume(tokenHash('tok-seat'))).toBe(true);
    expect(other.identity.getToken()).toBe('tok-seat');
    expect(other.identity.getTokenClaim()).toEqual({ noReplace: true });

    // a seat whose tab is still open is not taken
    const holder = await tab({
      id: 'c',
      device: deviceSlot,
      channel: bus.channel(),
    });
    await holder.identity.init();
    holder.identity.saveToken('tok-held');
    holder.identity.rememberMatch({ name: 'Kal', code: 'EFGH' });
    const third = await tab({
      id: 'd',
      device: deviceSlot,
      channel: bus.channel(),
      tabSlot: await own('tok-3'),
    });
    await third.identity.init();
    expect(await third.identity.resume(tokenHash('tok-held'))).toBe(false);
  });
});

describe('identity and connection', () => {
  it('saves the welcome token, gives a SESSION_IN_USE claim up, and remembers a seated match', async () => {
    const { followIdentity } = await import('./boot.js');
    const { sessionStore } = await import('#infra/store/session.js');
    const listeners = new Map<
      string,
      (frame: Record<string, unknown>) => void
    >();
    const calls: unknown[] = [];
    const identity = {
      saveToken: (token: string) => calls.push(['save', token]),
      rememberMatch: (info: unknown) => calls.push(['match', info]),
      rejectToken: () => calls.push(['reject']),
    } as never;
    followIdentity(
      {
        on: (type, listener) => {
          listeners.set(type, listener as never);
          return () => {};
        },
      },
      identity,
    );
    sessionStore.setState({ playerId: 'p1', name: '阿米娅' });
    listeners.get('welcome')?.({ t: 'welcome', token: 'tok' });
    listeners.get('error')?.({ t: 'error', code: 'SESSION_IN_USE' });
    listeners.get('room.state')?.({
      t: 'room.state',
      code: 'ABCD',
      inMatch: true,
      seats: [{ playerId: 'p1' }],
    });
    listeners.get('room.state')?.({
      t: 'room.state',
      code: 'ABCD',
      inMatch: false,
      seats: [{ playerId: 'p1' }],
    });
    expect(calls).toEqual([
      ['save', 'tok'],
      ['match', null],
      ['reject'],
      ['match', { name: '阿米娅', code: 'ABCD' }],
      ['match', null],
    ]);
  });
});
