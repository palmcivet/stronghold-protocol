import { PHASE } from '@alliance/contract/match.js';
import type { ServerMessage } from '@alliance/contract/server-message.js';
import { createStore } from 'zustand/vanilla';
import type { ConnectionStatus } from '../connection/socket.js';

/** Where the server holds the player. The URL says which page the player looks at; this says where they are. */
export type Presence =
  | { readonly kind: 'disconnected' }
  | { readonly kind: 'connected' }
  | { readonly kind: 'in-room'; readonly code: string }
  | { readonly kind: 'in-match'; readonly code: string };

export type PresenceEvent =
  | { readonly type: 'status'; readonly status: ConnectionStatus }
  | { readonly type: 'frame'; readonly frame: ServerMessage }
  /** The player dismissed the settlement of a finished match. */
  | { readonly type: 'leave-result' }
  /** The server accepted the player's leave; it sends the leaver nothing else. */
  | { readonly type: 'left' };

const DISCONNECTED: Presence = { kind: 'disconnected' };
const CONNECTED: Presence = { kind: 'connected' };

function codeOf(state: Presence): string | null {
  return state.kind === 'in-room' || state.kind === 'in-match'
    ? state.code
    : null;
}

export function presenceReducer(
  state: Presence,
  event: PresenceEvent,
): Presence {
  switch (event.type) {
    case 'status':
      if (event.status === 'online') {
        return state.kind === 'disconnected' ? CONNECTED : state;
      }
      return state.kind === 'disconnected' ? state : DISCONNECTED;
    case 'leave-result':
      return state.kind === 'in-match'
        ? { kind: 'in-room', code: state.code }
        : state;
    case 'left':
      return codeOf(state) === null ? state : CONNECTED;
    case 'frame':
      return frameReducer(state, event.frame);
  }
}

function frameReducer(state: Presence, frame: ServerMessage): Presence {
  switch (frame.t) {
    case 'welcome':
      // a resumed session reports its room in the room.state that follows
      return CONNECTED;
    case 'room.state': {
      const code = frame.code;
      if (frame.inMatch) {
        return { kind: 'in-match', code };
      }
      // the room is back in its lobby; a settlement on screen stays until the player leaves it
      return state.kind === 'in-match' && state.code === code
        ? state
        : { kind: 'in-room', code };
    }
    case 'room.closed':
      return CONNECTED;
    case 'm.public': {
      const code = codeOf(state);
      if (code !== null && frame.phase !== PHASE.LOBBY) {
        return { kind: 'in-match', code };
      }
      return state;
    }
    default:
      return state;
  }
}

export const presenceStore = createStore<{ readonly presence: Presence }>(
  () => ({
    presence: DISCONNECTED,
  }),
);

export function dispatchPresence(event: PresenceEvent): void {
  const current = presenceStore.getState().presence;
  const next = presenceReducer(current, event);
  if (next !== current) {
    presenceStore.setState({ presence: next });
  }
}
