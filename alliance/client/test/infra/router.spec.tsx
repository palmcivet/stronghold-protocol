// @vitest-environment jsdom
import { createMemoryHistory } from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Runtime } from '../../infra/boot/boot.js';
import { createAppRouter } from '../../infra/router/router.js';
import { type Presence, presenceStore } from '../../infra/store/presence.js';
import { initialSession, sessionStore } from '../../infra/store/session.js';

function fakeRuntime(joined: boolean) {
  const joinRoom = vi.fn(async (code: string) => {
    if (joined) {
      presenceStore.setState({ presence: { kind: 'in-room', code } });
    }
    return joined
      ? { ok: true as const, reply: { t: 'ok' } }
      : { ok: false as const, error: new Error('NO_ROOM') };
  });
  return { runtime: { api: { joinRoom } } as unknown as Runtime, joinRoom };
}

async function open(path: string, presence: Presence, joined = false) {
  sessionStore.setState({ entered: true });
  presenceStore.setState({ presence });
  const { runtime, joinRoom } = fakeRuntime(joined);
  const router = createAppRouter(
    runtime,
    createMemoryHistory({ initialEntries: [path] }),
  );
  await router.load();
  return { pathname: router.state.location.pathname, joinRoom };
}

afterEach(() => {
  sessionStore.setState(initialSession());
  presenceStore.setState({ presence: { kind: 'disconnected' } });
});

describe('route guards', () => {
  it('sends a match page back to its room until the server starts the match', async () => {
    const { pathname } = await open('/room/HAHT/match', {
      kind: 'in-room',
      code: 'HAHT',
    });
    expect(pathname).toBe('/room/HAHT');
  });

  it('brings a reloaded room page back to the running match', async () => {
    const { pathname } = await open('/room/HAHT', {
      kind: 'in-match',
      code: 'HAHT',
    });
    expect(pathname).toBe('/room/HAHT/match');
  });

  it('sends a page of another room to the room the server holds the player in', async () => {
    const { pathname } = await open('/room/QWER', {
      kind: 'in-room',
      code: 'HAHT',
    });
    expect(pathname).toBe('/room/HAHT');
  });

  it('joins the room of a shared link and stays on it', async () => {
    const { pathname, joinRoom } = await open(
      '/room/HAHT',
      { kind: 'connected' },
      true,
    );
    expect(joinRoom).toHaveBeenCalledWith('HAHT');
    expect(pathname).toBe('/room/HAHT');
  });

  it('goes to the entry page when the room of a link cannot be joined', async () => {
    const { pathname } = await open('/room/HAHT', { kind: 'connected' });
    expect(pathname).toBe('/');
  });

  it('keeps a player the server holds in a room off the entry page', async () => {
    expect((await open('/', { kind: 'in-room', code: 'HAHT' })).pathname).toBe(
      '/room/HAHT',
    );
    expect((await open('/', { kind: 'in-match', code: 'HAHT' })).pathname).toBe(
      '/room/HAHT/match',
    );
  });

  it('shows the entry page to a player outside any room', async () => {
    expect((await open('/', { kind: 'connected' })).pathname).toBe('/');
  });
});
