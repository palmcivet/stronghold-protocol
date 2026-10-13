import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  type RouterHistory,
  redirect,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router';
import { useEffect } from 'react';
import { PlaybackContext } from '../../match/playback/context.js';
import { LeaveProvider } from '../../part/leave.js';
import { Part } from '../../part/registry.js';
import { LeaveRoom } from '../../shell/leave.js';
import { ShellFrame } from '../../shell/parts.js';
import { FeedbackProvider } from '../../ui/feedback.js';
import { playCue } from '../audio/feedback.js';
import type { Runtime } from '../boot/boot.js';
import { loadPage } from '../boot/parts.js';
import { placeOf, settledPresence } from '../boot/presence.js';
import { ConnectionContext } from '../connection/context.js';
import { IntentContext } from '../intent/context.js';
import { presenceStore } from '../store/presence.js';
import { PAGE, type PageId } from './page.js';

export interface RouterContext {
  readonly runtime: Runtime;
}

/** Follows the server: into a room once it is created or joined, into its match once it starts, out once it closes. */
function PresenceSync() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  useEffect(
    () =>
      presenceStore.subscribe(({ presence }, previous) => {
        const code = 'code' in presence ? presence.code : null;
        const target = placeOf(presence.kind, code);
        if (target && target !== pathname) {
          void navigate({ to: target, replace: true });
        } else if (
          presence.kind === 'connected' &&
          previous.presence.kind !== 'disconnected'
        ) {
          if (pathname.startsWith('/room/')) {
            void navigate({ to: '/', replace: true });
          }
        }
      }),
    [navigate, pathname],
  );
  return null;
}

function Shell() {
  const { runtime } = rootRoute.useRouteContext();
  const bare = useRouterState({
    select: (state) => state.location.pathname.endsWith('/match'),
  });
  return (
    <IntentContext.Provider value={runtime.intents}>
      <ConnectionContext.Provider value={runtime.connection}>
        <PlaybackContext.Provider value={runtime.playback}>
          <FeedbackProvider play={playCue}>
            <LeaveProvider Leave={LeaveRoom}>
              <PresenceSync />
              <ShellFrame bare={bare}>
                <Outlet />
              </ShellFrame>
            </LeaveProvider>
          </FeedbackProvider>
        </PlaybackContext.Provider>
      </ConnectionContext.Provider>
    </IntentContext.Provider>
  );
}

/** A route's page: the part registered under the page id, inside the page boundary. */
const page = (id: PageId) =>
  function RoutePage() {
    return <Part id={id} boundary="page" />;
  };

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Shell,
});

const entryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async () => {
    const { presence } = presenceStore.getState();
    // a player the server holds in a room stays on its page until they leave it
    const known =
      presence.kind === 'connected' ? presence : await settledPresence();
    const place =
      known && 'code' in known ? placeOf(known.kind, known.code) : null;
    if (place) {
      throw redirect({ to: place });
    }
  },
  component: page(PAGE.entry),
});

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: page(PAGE.profile),
});

// local pages: they leave the connection alone and are reached from any page
const loadoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/loadout',
  loader: () => loadPage(PAGE.loadout),
  component: page(PAGE.loadout),
});

const guideRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/guide',
  loader: () => loadPage(PAGE.guide),
  component: page(PAGE.guide),
});

const roomRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/room/$id',
  beforeLoad: async ({ params, context }) => {
    const presence = await settledPresence();
    if (presence === null) {
      throw redirect({ to: '/' });
    }
    if ('code' in presence) {
      if (presence.code !== params.id) {
        throw redirect({ to: placeOf(presence.kind, presence.code) ?? '/' });
      }
      if (presence.kind === 'in-match') {
        throw redirect({ to: '/room/$id/match', params });
      }
      return;
    }
    // connected outside any room: a shared or reloaded link joins the room
    const outcome = await context.runtime.api.joinRoom(params.id);
    if (!outcome.ok) {
      throw redirect({ to: '/' });
    }
  },
  component: page(PAGE.room),
});

const matchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/room/$id/match',
  beforeLoad: async ({ params }) => {
    const presence = await settledPresence();
    // a match page is only reached from its room once the server has started the match
    if (presence?.kind !== 'in-match' || presence.code !== params.id) {
      throw redirect({ to: '/room/$id', params });
    }
  },
  loader: () => loadPage(PAGE.match),
  component: page(PAGE.match),
});

const routeTree = rootRoute.addChildren([
  entryRoute,
  profileRoute,
  loadoutRoute,
  guideRoute,
  roomRoute,
  matchRoute,
]);

/** The page router. Without a history it follows the browser's address. */
export function createAppRouter(runtime: Runtime, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context: { runtime },
    defaultPreload: false,
    ...(history ? { history } : {}),
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
