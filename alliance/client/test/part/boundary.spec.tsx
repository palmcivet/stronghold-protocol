// @vitest-environment jsdom

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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IntentBus } from '#infra/intent/bus.js';
import { IntentContext } from '#infra/intent/context.js';
import { presenceStore } from '#infra/store/presence.js';
import { setLanguage, t } from '#infra/text/index.js';
import { PageBoundary, PartSlot } from '#part/boundary.js';
import { LeaveProvider } from '#part/leave.js';
import { LeaveRoom } from '#shell/leave.js';

let broken = true;
function Fragile({ label }: { readonly label: string }) {
  if (broken) {
    throw new Error('render failure');
  }
  return <p>{label}</p>;
}

const bus: IntentBus = {
  dispatch: vi.fn(async () => ({ ok: true as const, reply: { t: 'ok' } })),
  preview: () => null,
  onOutcome: () => () => {},
};

function mount(page: () => React.ReactNode, at = '/room/HAHT') {
  const root = createRootRoute({
    component: () => (
      <IntentContext.Provider value={bus}>
        <LeaveProvider Leave={LeaveRoom}>
          <Outlet />
        </LeaveProvider>
      </IntentContext.Provider>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: '/',
        component: () => <p>lobby</p>,
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/room/$id',
        component: page,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: [at] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

const press = async (element: HTMLElement): Promise<void> => {
  await act(async () => {
    fireEvent.click(element);
  });
};

beforeEach(() => {
  broken = true;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setLanguage('zh-Hans');
  presenceStore.setState({ presence: { kind: 'disconnected' } });
});

describe('error boundaries', () => {
  it('shows a page failure under its part id and mounts the page again on retry', async () => {
    mount(() => (
      <PageBoundary part="core:screen.room">
        <Fragile label="room" />
      </PageBoundary>
    ));
    const alert = await screen.findByRole('alert');
    expect(alert.getAttribute('data-failed-part')).toBe('core:screen.room');
    expect(screen.getByText(t('core:error.page'))).toBeTruthy();
    broken = false;
    await press(screen.getByRole('button', { name: t('core:error.retry') }));
    expect(screen.getByText('room')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('goes back to the lobby through the leave flow while the server holds the player in a room', async () => {
    presenceStore.setState({ presence: { kind: 'in-room', code: 'HAHT' } });
    mount(() => (
      <PageBoundary part="core:screen.room">
        <Fragile label="room" />
      </PageBoundary>
    ));
    await press(
      await screen.findByRole('button', { name: t('core:error.lobby') }),
    );
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it('goes straight to the lobby outside any room', async () => {
    presenceStore.setState({ presence: { kind: 'connected' } });
    const router = mount(() => (
      <PageBoundary part="core:screen.profile">
        <Fragile label="profile" />
      </PageBoundary>
    ));
    await press(
      await screen.findByRole('button', { name: t('core:error.lobby') }),
    );
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('keeps a failed part inside its slot while the rest of the page works', async () => {
    mount(() => (
      <PageBoundary part="core:screen.match">
        <p>hud</p>
        <PartSlot part="core:match.field">
          <Fragile label="field" />
        </PartSlot>
      </PageBoundary>
    ));
    const alert = await screen.findByRole('alert');
    expect(alert.getAttribute('data-failed-part')).toBe('core:match.field');
    expect(screen.getByText('hud')).toBeTruthy();
    expect(screen.getByText(t('core:error.part'))).toBeTruthy();
    expect(screen.queryByText(t('core:error.page'))).toBeNull();
  });

  it('has English text', async () => {
    setLanguage('en');
    mount(() => (
      <PageBoundary part="core:screen.room">
        <Fragile label="room" />
      </PageBoundary>
    ));
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to lobby' })).toBeTruthy();
  });
});
