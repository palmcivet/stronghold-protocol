import type { ServerMessage } from '@alliance/contract/server-message.js';
import { registerLoadoutParts } from '../../loadout/contribute.js';
import { createPlayback } from '../../match/playback/runner.js';
import { createConnection, pageSocketUrl } from '../connection/socket.js';
import { createIntentBus } from '../intent/bus.js';
import { assetsStore } from '../store/assets.js';
import { applyFrame } from '../store/frame.js';
import { dispatchPresence } from '../store/presence.js';
import { sessionStore } from '../store/session.js';
import { settingsStore } from '../store/settings.js';
import { setLanguage } from '../text/index.js';
import { type AllianceApi, createApi } from './api.js';
import { installAssets, loadCompatResources } from './assets.js';
import { elementOutput, installAudio } from './audio.js';
import { loadCompatCatalog } from './catalog.js';
import { followLeaves } from './presence.js';

const TOKEN_KEY = 'alliance.token';

function sessionToken(): string | null {
  try {
    return globalThis.sessionStorage?.getItem(TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
}

function saveToken(token: string | null): void {
  try {
    if (token) {
      globalThis.sessionStorage?.setItem(TOKEN_KEY, token);
    }
  } catch {
    // the token stays for this page only
  }
}

export interface Runtime {
  readonly connection: ReturnType<typeof createConnection>;
  readonly intents: ReturnType<typeof createIntentBus>;
  readonly playback: ReturnType<typeof createPlayback>;
  readonly api: AllianceApi;
}

/** Wires the connection, the stores, the intent bus and the playback. */
export function boot(location: Location = globalThis.location): Runtime {
  const connection = createConnection({
    url: pageSocketUrl(location),
    token: sessionToken,
  });
  const intents = createIntentBus(connection);
  const audio = installAudio({ output: elementOutput(), intents });
  const playback = createPlayback({
    bridge: null,
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
      saveToken(sessionStore.getState().token);
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
  connection.onStatus((snapshot) => {
    sessionStore.setState({ connection: snapshot });
    dispatchPresence({ type: 'status', status: snapshot.status });
  });

  installAssets();
  setLanguage(settingsStore.getState().language);
  settingsStore.subscribe((state, previous) => {
    if (state.language !== previous.language) {
      setLanguage(state.language);
    }
  });

  connection.connect();
  registerLoadoutParts();
  const api = createApi({ connection, intents });
  const remembered = settingsStore.getState().name;
  if (remembered) {
    api.enter(remembered);
  }
  return { connection, intents, playback, api };
}
