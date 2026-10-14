// @vitest-environment jsdom

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Runtime } from '#infra/boot/boot.js';
import { menuItems, menuKey, type RouteMenu } from '#infra/router/menu.js';
import { createAppRouter } from '#infra/router/router.js';
import { presenceStore } from '#infra/store/presence.js';
import { initialSession, sessionStore } from '#infra/store/session.js';
import { closeDialog, DIALOG, dialogStore } from '#part/dialog.js';
import { Part } from '#part/registry.js';
import { MENU_ENTRY } from '#shell/menu.js';
import '#test/support/part.js';

afterEach(() => {
  cleanup();
  sessionStore.setState(initialSession());
  presenceStore.setState({ presence: { kind: 'disconnected' } });
});

function testRouter() {
  const root = createRootRoute({ component: () => <Part id={MENU_ENTRY} /> });
  const route = (path: string, menu?: RouteMenu) =>
    createRoute({
      getParentRoute: () => root,
      path,
      staticData: menu ? { menu } : {},
      component: () => null,
    });
  return createRouter({
    routeTree: root.addChildren([
      route('/', { label: 'core:nav.entry', order: 10, when: { room: false } }),
      route('/b', { label: 'core:nav.guide', order: 30 }),
      route('/a', { label: 'core:nav.profile', order: 20 }),
      route('/hidden'),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
}

describe('menu entry', () => {
  it('keeps only the lobby and the room routes, and lists the lobby with the core dialogs, in order', () => {
    const router = createAppRouter(
      {} as Runtime,
      createMemoryHistory({ initialEntries: ['/'] }),
    );
    expect(Object.keys(router.routesById).sort()).toEqual(
      ['/', '/room/$id', '/room/$id/match', '__root__'].sort(),
    );
    expect(
      menuItems(
        Object.values(router.routesById) as unknown as Parameters<
          typeof menuItems
        >[0],
        dialogStore.getState().dialogs,
      ).map(menuKey),
    ).toEqual(['/', DIALOG.profile, DIALOG.loadout, DIALOG.guide]);
  });

  it('builds its items from the route definitions and their conditions', async () => {
    const router = testRouter();
    await router.load();
    render(<RouterProvider router={router} />);
    fireEvent.click(await screen.findByRole('button', { name: '菜单' }));
    expect(
      screen.getAllByRole('menuitem').map((item) => item.textContent),
    ).toEqual(['大厅', '个人配置', '个人配置', '玩法说明', '玩法说明']);
  });

  it('drops an item whose condition fails and navigates on choice', async () => {
    presenceStore.setState({ presence: { kind: 'in-room', code: 'ABCD' } });
    const router = testRouter();
    await router.load();
    render(<RouterProvider router={router} />);
    fireEvent.click(await screen.findByRole('button', { name: '菜单' }));
    const items = screen.getAllByRole('menuitem');
    // the routes, then the core dialogs; the loadout dialog needs the backend's loadout capability
    expect(items.map((item) => item.textContent)).toEqual([
      '个人配置',
      '个人配置',
      '玩法说明',
      '玩法说明',
    ]);
    fireEvent.click(items[0] as HTMLElement);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(router.state.location.pathname).toBe('/a');
  });
});

describe('menu dialog items', () => {
  it('opens a dialog item without navigating', async () => {
    const router = testRouter();
    await router.load();
    render(<RouterProvider router={router} />);
    fireEvent.click(await screen.findByRole('button', { name: '菜单' }));
    const items = screen.getAllByRole('menuitem');
    // order 20 twice: the route '/a', then the profile dialog
    fireEvent.click(items[2] as HTMLElement);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dialogStore.getState().open).toBe(DIALOG.profile);
    expect(router.state.location.pathname).toBe('/');
    closeDialog();
  });
});
