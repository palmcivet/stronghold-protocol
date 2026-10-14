import type { Connection } from '#infra/connection/socket.js';
import type { Intent, IntentBus, IntentOutcome } from '#infra/intent/bus.js';
import { matchStore } from '#infra/store/match.js';
import { roomStore } from '#infra/store/room.js';
import { sessionStore } from '#infra/store/session.js';
import { settingsStore } from '#infra/store/settings.js';
import { playbackStore } from '#match/playback-state.js';

/** What the page exposes to page scripts, community shells and end-to-end tests. */
export interface WsdeHostApi {
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
}): WsdeHostApi {
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
    /**
     * Page host API (`enter` / room / `submit` / `view`).
     * In DEV builds, boot also mixes debug overlay methods onto the same object.
     */
    wsde?: WsdeHostApi;
  }
}
