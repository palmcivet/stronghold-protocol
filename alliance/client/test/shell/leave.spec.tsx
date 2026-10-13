// @vitest-environment jsdom

import type { RoomView } from '@alliance/contract/server-message.js';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { followLeaves } from '../../infra/boot/presence.js';
import type { Connection } from '../../infra/connection/socket.js';
import type { IntentBus } from '../../infra/intent/bus.js';
import { createIntentBus } from '../../infra/intent/bus.js';
import { IntentContext } from '../../infra/intent/context.js';
import { presenceStore } from '../../infra/store/presence.js';
import { roomStore } from '../../infra/store/room.js';
import { t } from '../../infra/text/index.js';
import { LeaveRoom } from '../../shell/leave.js';

async function press(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
  });
}

function mount(dispatch: IntentBus['dispatch']) {
  const bus: IntentBus = {
    dispatch,
    preview: () => null,
    onOutcome: () => () => {},
  };
  const root = createRootRoute({
    component: () => (
      <IntentContext.Provider value={bus}>
        <LeaveRoom />
        <Outlet />
      </IntentContext.Provider>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/' }),
      createRoute({ getParentRoute: () => root, path: '/room/$id' }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/room/HAHT'] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

let stop: () => void = () => {};

afterEach(() => {
  cleanup();
  stop();
  roomStore.setState({ room: null });
  presenceStore.setState({ presence: { kind: 'disconnected' } });
});

describe('leaving a room', () => {
  it('asks first, sends the leave and shows the entry page once the server let the player go', async () => {
    presenceStore.setState({ presence: { kind: 'in-room', code: 'HAHT' } });
    roomStore.setState({ room: { code: 'HAHT' } as unknown as RoomView });
    let release: () => void = () => {};
    const request = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { t: 'ok' };
    });
    const bus = createIntentBus({ request } as unknown as Connection);
    stop = followLeaves(bus);
    const router = mount(bus.dispatch);
    await press(
      await screen.findByRole('button', { name: t('core:room.leave') }),
    );
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
    await press(screen.getByRole('button', { name: t('core:common.confirm') }));
    expect(request).toHaveBeenCalledWith('room.leave', undefined);
    expect(router.state.location.pathname).toBe('/room/HAHT');
    await act(async () => release());
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(presenceStore.getState().presence).toEqual({ kind: 'connected' });
    expect(roomStore.getState().room).toBeNull();
  });

  it('stays in the room when the player cancels', async () => {
    presenceStore.setState({ presence: { kind: 'in-room', code: 'HAHT' } });
    const dispatch = vi.fn(async () => ({
      ok: true as const,
      reply: { t: 'ok' },
    }));
    const router = mount(dispatch);
    await press(
      await screen.findByRole('button', { name: t('core:room.leave') }),
    );
    await press(screen.getByRole('button', { name: t('core:common.cancel') }));
    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(router.state.location.pathname).toBe('/room/HAHT');
  });
});
