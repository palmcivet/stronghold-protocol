import type { Catalog } from '@alliance/contract/catalog.js';
import type {
  RoomStateMessage,
  ServerMessage,
} from '@alliance/contract/server-message.js';
import { createConnection, pageSocketUrl } from '#infra/connection/socket.js';
import { createIntentBus } from '#infra/intent/bus.js';
import { assetsStore } from '#infra/store/assets.js';
import { catalogStore } from '#infra/store/catalog.js';
import { applyFrame } from '#infra/store/frame.js';
import { dispatchPresence } from '#infra/store/presence.js';
import { sessionStore } from '#infra/store/session.js';
import { settingsStore } from '#infra/store/settings.js';
import { setLanguage } from '#infra/text/index.js';
import { applyTextSize } from '#infra/theme/install.js';
import { loadoutStore } from '#loadout/state.js';
import {
  lockedKinds,
  payloadOf,
  SYNC_DEBOUNCE_MS,
  SYNC_KINDS,
  type SyncKind,
  sendSetting,
  syncSettings,
  syncStore,
} from '#loadout/sync.js';
import { createLazyPlayback, type LazyPlayback } from '#match/playback/lazy.js';
import { createUpstreamBattleBridge } from '#match/playback/upstream-bridge.js';
import { dialogStore } from '#part/dialog.js';
import { type AllianceApi, createApi } from './api.js';
import { installAssets, loadCompatResources } from './assets.js';
import { elementOutput, installAudio } from './audio.js';
import { loadCompatCatalog } from './catalog.js';
import { createIdentity, type Identity } from './identity.js';
import { registerCoreParts } from './parts.js';
import { followLeaves } from './presence.js';
import { seatStore } from './seat.js';

/**
 * The identity follows the connection as master's main.js: the welcome's token is saved, a SESSION_IN_USE reply to
 * `hello` gives the claim up (the identity then reconnects with its next choice), and the seat of a running match is
 * remembered for a recovery from another tab.
 */
export function followIdentity(
  connection: Pick<ReturnType<typeof createConnection>, 'on'>,
  identity: Identity,
): void {
  connection.on('welcome', (frame) => {
    if (typeof frame.token === 'string') {
      identity.saveToken(frame.token);
    }
    identity.rememberMatch(null);
  });
  connection.on('error', (frame) => {
    if (frame.code === 'SESSION_IN_USE') {
      identity.rejectToken();
    }
  });
  connection.on('room.state', (frame) => {
    const room = frame as unknown as RoomStateMessage;
    const { playerId, name } = sessionStore.getState();
    const seated = room.seats?.some((seat) => seat?.playerId === playerId);
    identity.rememberMatch(
      room.inMatch && seated ? { name, code: room.code } : null,
    );
  });
}

/**
 * Master's sync: after every welcome all three settings go again (the server keeps them on the session and the
 * seat), the loadout once the catalog it is cleaned against is loaded unless it is empty; when the room is back out
 * of a match, the ones a match had locked go again.
 */
export function installLoadoutSync(
  connection: Pick<ReturnType<typeof createConnection>, 'on'>,
  intents: Pick<ReturnType<typeof createIntentBus>, 'dispatch'>,
  debounceMs: number = SYNC_DEBOUNCE_MS,
): void {
  const catalog = () =>
    catalogStore.getState().loaded ? catalogStore.getState().catalog : null;
  let waiting: (() => void) | null = null;
  const stopWaiting = (): void => {
    waiting?.();
    waiting = null;
  };
  connection.on('welcome', () => {
    stopWaiting();
    void syncSettings(intents, catalog(), ['ownership', 'diy']);
    if (payloadOf('loadout', catalog())) {
      void sendSetting(intents, 'loadout', catalog());
      return;
    }
    waiting = catalogStore.subscribe((state) => {
      if (state.loaded) {
        stopWaiting();
        void sendSetting(intents, 'loadout', state.catalog);
      }
    });
  });
  connection.on('room.state', (frame) => {
    if ((frame as { inMatch?: unknown }).inMatch === false) {
      const kinds = lockedKinds();
      if (kinds.length) {
        void syncSettings(intents, catalog(), kinds);
      }
    }
  });
  installAutosave(intents, catalog, debounceMs);
}

/** Which store fields each setting is made of. */
const FIELDS: Readonly<
  Record<SyncKind, readonly ('entries' | 'ops' | 'notOwned' | 'diy')[]>
> = {
  loadout: ['entries', 'ops'],
  ownership: ['notOwned'],
  diy: ['diy'],
};

/**
 * Master's autosave: an edit sends its setting after a debounce; closing a dialog sends a pending edit at once, so
 * the player's next click (ready in the briefing) cannot overtake it.
 */
function installAutosave(
  intents: Pick<ReturnType<typeof createIntentBus>, 'dispatch'>,
  catalog: () => Catalog | null,
  debounceMs: number,
): void {
  const timers = new Map<SyncKind, ReturnType<typeof setTimeout>>();
  const flush = (kind: SyncKind): void => {
    clearTimeout(timers.get(kind));
    timers.delete(kind);
    void sendSetting(intents, kind, catalog());
  };
  loadoutStore.subscribe((state, prev) => {
    for (const kind of SYNC_KINDS) {
      if (FIELDS[kind].some((field) => state[field] !== prev[field])) {
        clearTimeout(timers.get(kind));
        syncStore.setState({ [kind]: 'pending' });
        timers.set(
          kind,
          setTimeout(() => flush(kind), debounceMs),
        );
      }
    }
  });
  dialogStore.subscribe((state, prev) => {
    if (prev.open !== null && state.open === null) {
      for (const kind of [...timers.keys()]) {
        flush(kind);
      }
    }
  });
}

export interface Runtime {
  readonly connection: ReturnType<typeof createConnection>;
  readonly intents: ReturnType<typeof createIntentBus>;
  readonly playback: LazyPlayback;
  readonly api: AllianceApi;
  readonly identity: Identity;
}

/** Wires the connection, the stores, the intent bus and the playback. */
export function boot(
  location: Location = globalThis.location,
  identity: Identity = createIdentity(),
): Runtime {
  const connection = createConnection({
    url: pageSocketUrl(location),
    token: () => identity.getToken(),
    hello: () => identity.getTokenClaim(),
  });
  followIdentity(connection, identity);
  seatStore.setState({
    identity,
    reconnect: () => {
      connection.close();
      connection.connect();
    },
  });
  const intents = createIntentBus(connection);
  const audio = installAudio({ output: elementOutput(), intents });
  // compat mode: run authoritative battles in mission-core; without a mapped stage the bridge returns null
  const playback = createLazyPlayback({
    bridge: createUpstreamBattleBridge(),
    send: (type, fields) => {
      connection.send(type, fields as Readonly<Record<string, unknown>>);
    },
  });

  let catalogLoading = false;
  connection.on('*', (received) => {
    const frame = received as ServerMessage;
    applyFrame(frame);
    dispatchPresence({ type: 'frame', frame });
    playback.onFrame(frame);
    audio.onFrame(frame);
    if (frame.t === 'welcome') {
      if (
        sessionStore.getState().backend?.mode === 'compat' &&
        !catalogLoading
      ) {
        catalogLoading = true;
        void loadCompatCatalog();
        loadCompatResources().then(
          (resources) => assetsStore.setState({ resources }),
          (failure: unknown) =>
            console.warn('[assets] the backend art is not available', failure),
        );
      }
    }
  });
  followLeaves(intents);
  installLoadoutSync(connection, intents);
  connection.onStatus((snapshot) => {
    sessionStore.setState({ connection: snapshot });
    dispatchPresence({ type: 'status', status: snapshot.status });
  });

  installAssets();
  setLanguage(settingsStore.getState().language);
  applyTextSize(settingsStore.getState().textSize);
  settingsStore.subscribe((state, previous) => {
    if (state.language !== previous.language) {
      setLanguage(state.language);
    }
    if (state.textSize !== previous.textSize) {
      applyTextSize(state.textSize);
    }
  });

  connection.connect();
  registerCoreParts();
  const api = createApi({ connection, intents });
  const remembered = settingsStore.getState().name;
  if (remembered) {
    api.enter(remembered);
  }
  return { connection, intents, playback, api, identity };
}
