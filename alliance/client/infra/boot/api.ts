import { playbackStore } from '../../match/playback-state.js';
import type { Connection } from '../connection/socket.js';
import type { Intent, IntentBus, IntentOutcome } from '../intent/bus.js';
import { matchStore } from '../store/match.js';
import { roomStore } from '../store/room.js';
import { sessionStore } from '../store/session.js';
import { settingsStore } from '../store/settings.js';

/** What the page exposes to page scripts, community shells and end-to-end tests. */
export interface AllianceApi {
  /** Enters the game with a code name, as the title screen does. */
  enter(name: string): void;
  createRoom(mode: 'solo' | 'coop', difficulty: string): Promise<IntentOutcome>;
  joinRoom(code: string): Promise<IntentOutcome>;
  /** Submits an intent through the intent bus. */
  submit(intent: Intent): Promise<IntentOutcome>;
  /** The current views, as plain data. */
  view(): {
    readonly session: ReturnType<typeof sessionStore.getState>;
    readonly room: ReturnType<typeof roomStore.getState>['room'];
    readonly match: ReturnType<typeof matchStore.getState>;
    readonly battle: ReturnType<typeof playbackStore.getState>['battle'];
  };
}

export function createApi(options: {
  readonly connection: Connection;
  readonly intents: IntentBus;
}): AllianceApi {
  const { connection, intents } = options;
  return {
    enter(name) {
      const trimmed = name.trim();
      settingsStore.setState({ name: trimmed });
      sessionStore.setState({ entered: true, name: trimmed });
      connection.setName(trimmed);
    },
    createRoom: (mode, difficulty) =>
      intents.dispatch({ type: 'room.create', fields: { mode, difficulty } }),
    joinRoom: (code) =>
      intents.dispatch({
        type: 'room.join',
        fields: { code: code.trim().toUpperCase() },
      }),
    submit: (intent) => intents.dispatch(intent),
    view: () => ({
      session: sessionStore.getState(),
      room: roomStore.getState().room,
      match: matchStore.getState(),
      battle: playbackStore.getState().battle,
    }),
  };
}

declare global {
  interface Window {
    alliance?: AllianceApi;
  }
}
