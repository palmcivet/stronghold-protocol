import { createStore } from 'zustand/vanilla';
import type { Backend } from '#infra/connection/backend.js';
import type { ConnectionSnapshot } from '#infra/connection/socket.js';

export interface SessionState {
  /** The player pressed start on the title screen in this tab. */
  readonly entered: boolean;
  readonly name: string;
  readonly playerId: string | null;
  readonly token: string | null;
  readonly connection: ConnectionSnapshot;
  readonly backend: Backend | null;
  /** The connection reached `online` at least once. */
  readonly everOnline: boolean;
}

export const initialSession = (): SessionState => ({
  entered: false,
  name: '',
  playerId: null,
  token: null,
  connection: {
    status: 'idle',
    attempt: 0,
    retryAt: 0,
    ping: null,
    error: null,
  },
  backend: null,
  everOnline: false,
});

export const sessionStore = createStore<SessionState>(initialSession);
