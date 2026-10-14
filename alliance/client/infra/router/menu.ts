import type { CoreKey } from '#infra/text/key.js';
import type { InsertWhen } from '#part/slot.js';

/** A route's place in the menu entry: its label, its order, and when it shows. Routes without it are not listed. */
export interface RouteMenu {
  readonly label: CoreKey | `${string}:${string}`;
  readonly order: number;
  readonly when?: InsertWhen;
}

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    readonly menu?: RouteMenu;
  }
}

/** One item of the menu entry: a route (from its definition) or a dialog (from the dialog registry). */
export type MenuItem = RouteMenu &
  (
    | { readonly kind: 'route'; readonly path: string }
    | { readonly kind: 'dialog'; readonly dialog: string }
  );

/** The menu items of a route list and a dialog list, in order. */
export function menuItems(
  routes: readonly {
    readonly fullPath: string;
    readonly options: { readonly staticData?: { readonly menu?: RouteMenu } };
  }[],
  dialogs: readonly { readonly id: string; readonly menu?: RouteMenu }[] = [],
): readonly MenuItem[] {
  return [
    ...routes.flatMap((route): MenuItem[] => {
      const menu = route.options.staticData?.menu;
      return menu ? [{ ...menu, kind: 'route', path: route.fullPath }] : [];
    }),
    ...dialogs.flatMap((dialog): MenuItem[] =>
      dialog.menu
        ? [{ ...dialog.menu, kind: 'dialog', dialog: dialog.id }]
        : [],
    ),
  ].sort((a, b) => a.order - b.order);
}

/** The key of a menu item: its path, or its dialog id. */
export const menuKey = (item: MenuItem): string =>
  item.kind === 'route' ? item.path : item.dialog;
