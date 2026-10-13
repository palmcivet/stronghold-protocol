import { registerEntryParts } from '../../entry/parts.js';
import { registerLoadoutParts } from '../../loadout/contribute.js';
import { registerProfileParts } from '../../profile/parts.js';
import { registerRoomParts } from '../../room/parts.js';
import { registerShellParts } from '../../shell/parts.js';
import { PAGE, type PageId } from '../router/page.js';

type Stops = readonly (() => void)[];

/**
 * Pages loaded with their route: each module registers its page's parts when it first loads, so its code (the match
 * renderer above all) stays out of the first download.
 */
const LAZY_PAGES: Readonly<
  Partial<Record<PageId, () => Promise<() => Stops>>>
> = {
  [PAGE.loadout]: () =>
    import('../../loadout/page.js').then((m) => m.registerLoadoutPage),
  [PAGE.guide]: () =>
    import('../../guide/parts.js').then((m) => m.registerGuideParts),
  [PAGE.match]: () =>
    import('../../match/parts.js').then((m) => m.registerMatchParts),
};

let unregister: (() => void) | null = null;
const lazyStops: (() => void)[] = [];
const loading = new Map<PageId, Promise<void>>();

/** Registers the parts of the pages in the first download, once, before the router renders. Returns their removal. */
export function registerCoreParts(): () => void {
  if (unregister) {
    return unregister;
  }
  const stops = [
    registerShellParts(),
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
  await Promise.all(
    Object.keys(LAZY_PAGES).map((id) => loadPage(id as PageId)),
  );
  return stop;
}
