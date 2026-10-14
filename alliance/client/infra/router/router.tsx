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
import { useStore } from 'zustand';
import { InviteConfirm } from '#entry/invite.js';
import { playCue } from '#infra/audio/feedback.js';
import type { Runtime } from '#infra/boot/boot.js';
import { loadPage } from '#infra/boot/parts.js';
import { placeOf, settledPresence } from '#infra/boot/presence.js';
import { ConnectionContext } from '#infra/connection/context.js';
import { IntentContext } from '#infra/intent/context.js';
import { presenceStore } from '#infra/store/presence.js';
import { PlaybackContext } from '#match/playback-runtime.js';
import { LeaveProvider } from '#part/leave.js';
import { Part } from '#part/registry.js';
import { LeaveRoom } from '#shell/leave.js';
import { ShellFrame } from '#shell/parts.js';
import { FeedbackProvider } from '#ui/feedback.js';
import './menu.js';
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

const RoomPage = page(PAGE.room);

/** The room page once the server has the player in this room; before that, a shared link's confirm. */
function RoomGate() {
  const { id } = roomRoute.useParams();
  const navigate = useNavigate();
  const inRoom = useStore(
    presenceStore,
    ({ presence }) => 'code' in presence && presence.code === id,
  );
  return inRoom ? (
    <RoomPage />
  ) : (
    <InviteConfirm
      code={id}
      onBack={() => void navigate({ to: '/', replace: true })}
    />
  );
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Shell,
});

const entryRoute = createRoute({
  getParentRoute: () => rootRoute,
  staticData: {
    menu: { label: 'core:nav.entry', order: 10, when: { room: false } },
  },
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

const roomRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/room/$id',
  beforeLoad: async ({ params }) => {
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
    // connected outside any room: the page asks before seating (RoomGate)
  },
  component: RoomGate,
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
  loader: ({ context }) =>
    Promise.all([loadPage(PAGE.match), context.runtime.playback.load()]),
  component: page(PAGE.match),
});

const routeTree = rootRoute.addChildren([entryRoute, roomRoute, matchRoute]);

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
