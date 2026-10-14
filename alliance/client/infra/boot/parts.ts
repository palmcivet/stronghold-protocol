import { registerEntryParts } from '#entry/parts.js';
import { PAGE, type PageId } from '#infra/router/page.js';
import { registerLoadoutParts } from '#loadout/contribute.js';
import { DIALOG, defineDialog } from '#part/dialog.js';
import { registerProfileParts } from '#profile/parts.js';
import { registerRoomParts } from '#room/parts.js';
import { registerShellParts } from '#shell/parts.js';

type Stops = readonly (() => void)[];

/**
 * Pages loaded with their route: each module registers its page's parts when it first loads, so its code (the match
 * renderer above all) stays out of the first download.
 */
const LAZY_PAGES: Readonly<
  Partial<Record<PageId, () => Promise<() => Stops>>>
> = {
  [PAGE.match]: () =>
    import('#match/parts.js').then((m) => m.registerMatchParts),
};

/** Dialogs whose parts load when they first open, like the lazy pages. */
const LAZY_DIALOGS: Readonly<Record<string, () => Promise<() => Stops>>> = {
  [DIALOG.loadout]: () =>
    import('#loadout/page.js').then((m) => m.registerLoadoutPage),
  [DIALOG.guide]: () =>
    import('#guide/parts.js').then((m) => m.registerGuideParts),
};

/** Loads a dialog's module and registers its parts, once. */
export function loadDialog(id: string): Promise<void> {
  const load = LAZY_DIALOGS[id];
  if (!load) {
    return Promise.resolve();
  }
  const pending =
    loading.get(id) ??
    load().then((register) => {
      lazyStops.push(...register());
    });
  loading.set(id, pending);
  return pending;
}

/** The core dialogs: profile (also the in-match settings), loadout and guide, with their menu items. */
function registerCoreDialogs(): () => void {
  const stops = [
    defineDialog({
      id: DIALOG.profile,
      title: 'core:nav.profile',
      menu: { label: 'core:nav.profile', order: 20 },
    }),
    defineDialog({
      id: DIALOG.loadout,
      title: 'core:loadout.heading',
      menu: {
        label: 'core:nav.loadout',
        order: 30,
        when: { capability: 'loadout' },
      },
      load: () => loadDialog(DIALOG.loadout),
      size: 'full',
    }),
    defineDialog({
      id: DIALOG.guide,
      title: 'core:nav.guide',
      menu: { label: 'core:nav.guide', order: 40 },
      load: () => loadDialog(DIALOG.guide),
      size: 'wide',
    }),
  ];
  return () => {
    for (const stop of stops) {
      stop();
    }
  };
}

let unregister: (() => void) | null = null;
const lazyStops: (() => void)[] = [];
const loading = new Map<string, Promise<void>>();

/** Registers the parts of the pages in the first download, once, before the router renders. Returns their removal. */
export function registerCoreParts(): () => void {
  if (unregister) {
    return unregister;
  }
  const stops = [
    registerShellParts(),
    registerCoreDialogs(),
    ...registerEntryParts(),
    ...registerProfileParts(),
    ...registerRoomParts(),
    registerLoadoutParts(),
  ];
  unregister = () => {
    for (const stop of [...lazyStops.reverse(), ...stops.reverse()]) {
      stop();
    }
    lazyStops.length = 0;
    loading.clear();
    unregister = null;
  };
  return unregister;
}

/** Loads a route's page module and registers its parts, once. Pages in the first download resolve at once. */
export function loadPage(id: PageId): Promise<void> {
  const load = LAZY_PAGES[id];
  if (!load) {
    return Promise.resolve();
  }
  const pending =
    loading.get(id) ??
    load().then((register) => {
      lazyStops.push(...register());
    });
  loading.set(id, pending);
  return pending;
}

/** Every page's parts, the lazy ones loaded too: for tests and tools that need the whole registry. */
export async function registerAllParts(): Promise<() => void> {
  const stop = registerCoreParts();
  await Promise.all([
    ...Object.keys(LAZY_PAGES).map((id) => loadPage(id as PageId)),
    ...Object.keys(LAZY_DIALOGS).map(loadDialog),
  ]);
  return stop;
}
