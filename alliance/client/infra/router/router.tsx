import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Link,
  Outlet,
  type RouterHistory,
  redirect,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router';
import { useEffect } from 'react';
import { useStore } from 'zustand';
import { EntryPage } from '../../entry/screen.js';
import { PlaybackContext } from '../../match/playback/context.js';
import { MatchPage } from '../../match/screen.js';
import { PageBoundary } from '../../part/boundary.js';
import { LeaveProvider } from '../../part/leave.js';
import { ProfilePage } from '../../profile/screen.js';
import { RoomPage } from '../../room/screen.js';
import { ConnectionBanner } from '../../shell/banner.js';
import { LeaveRoom } from '../../shell/leave.js';
import styles from '../../shell/shell.module.css';
import { Toasts } from '../../shell/toast.js';
import { FeedbackProvider } from '../../ui/feedback.js';
import { playCue } from '../audio/feedback.js';
import type { Runtime } from '../boot/boot.js';
import { placeOf, settledPresence } from '../boot/presence.js';
import { IntentContext } from '../intent/context.js';
import { useSession } from '../store/hook.js';
import { presenceStore } from '../store/presence.js';
import { useText } from '../text/index.js';
import { cx } from '../theme/class-name.js';
import { PAGE } from './page.js';

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
  const t = useText();
  const { runtime } = rootRoute.useRouteContext();
  const compat = useSession((state) => state.backend?.mode === 'compat');
  const inRoom = useStore(presenceStore, (state) => 'code' in state.presence);
  return (
    <IntentContext.Provider value={runtime.intents}>
      <PlaybackContext.Provider value={runtime.playback}>
        <FeedbackProvider play={playCue}>
          <LeaveProvider Leave={LeaveRoom}>
            <PresenceSync />
            <div className={cx(styles.app)}>
              <ConnectionBanner connection={runtime.connection} />
              <header className={cx(styles.bar)}>
                <span className={cx(styles.brand)}>{t('core:app.title')}</span>
                {compat ? (
                  <span className={cx(styles.tag)}>
                    {t('core:connection.compat')}
                  </span>
                ) : null}
                <nav className={cx(styles.nav)}>
                  {inRoom ? (
                    <LeaveRoom />
                  ) : (
                    <Link to="/">{t('core:nav.entry')}</Link>
                  )}
                  <Link to="/profile">{t('core:nav.profile')}</Link>
                </nav>
              </header>
              <main className={cx(styles.main)}>
                <Outlet />
              </main>
              <Toasts intents={runtime.intents} />
            </div>
          </LeaveProvider>
        </FeedbackProvider>
      </PlaybackContext.Provider>
    </IntentContext.Provider>
  );
}

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
  component: () => (
    <PageBoundary part={PAGE.entry}>
      <EntryPage />
    </PageBoundary>
  ),
});

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: () => (
    <PageBoundary part={PAGE.profile}>
      <ProfilePage />
    </PageBoundary>
  ),
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
  component: () => (
    <PageBoundary part={PAGE.room}>
      <RoomPage />
    </PageBoundary>
  ),
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
  component: () => (
    <PageBoundary part={PAGE.match}>
      <MatchPage />
    </PageBoundary>
  ),
});

const routeTree = rootRoute.addChildren([
  entryRoute,
  profileRoute,
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
