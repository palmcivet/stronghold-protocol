import type { IntentBus } from '../intent/bus.js';
import { leaveRoom } from '../store/frame.js';
import {
  dispatchPresence,
  type Presence,
  presenceStore,
} from '../store/presence.js';
import { sessionStore } from '../store/session.js';

/** How long a resumed session may take to report its room after `welcome`. */
export const ROOM_GRACE_MS = 1500;
/** How long a page waits for the connection before it treats the player as not connected. */
export const CONNECT_WAIT_MS = 8000;

function until(check: () => boolean, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (check()) {
      resolve(true);
      return;
    }
    const stop = (value: boolean): void => {
      clearTimeout(timer);
      unsubscribe();
      unsession();
      resolve(value);
    };
    const timer = setTimeout(() => stop(check()), ms);
    const unsubscribe = presenceStore.subscribe(() => {
      if (check()) {
        stop(true);
      }
    });
    const unsession = sessionStore.subscribe(() => {
      if (check()) {
        stop(true);
      }
    });
  });
}

/**
 * Where the server holds the player, once that is known: after `welcome`, and after the room of a resumed session.
 * Null when the player has not entered a name or the connection does not come up.
 */
export async function settledPresence(): Promise<Presence | null> {
  if (!sessionStore.getState().entered) {
    return null;
  }
  const online = await until(
    () => presenceStore.getState().presence.kind !== 'disconnected',
    CONNECT_WAIT_MS,
  );
  if (!online) {
    return null;
  }
  await until(
    () => presenceStore.getState().presence.kind !== 'connected',
    ROOM_GRACE_MS,
  );
  return presenceStore.getState().presence;
}

/** The page of the place the server holds the player in, or null to stay where the player is. */
export function placeOf(kind: string, code: string | null): string | null {
  if (kind === 'in-match' && code) {
    return `/room/${code}/match`;
  }
  if (kind === 'in-room' && code) {
    return `/room/${code}`;
  }
  return null;
}

/** How long a leave waits for the server to let the player go. */
export const LEAVE_WAIT_MS = 8000;

/** Waits until the server holds the player outside any room. False when it does not within the wait. */
export function leftRoom(): Promise<boolean> {
  return until(
    () => presenceStore.getState().presence.kind === 'connected',
    LEAVE_WAIT_MS,
  );
}

/** Lets the player out of the room once the server accepts their leave: the server sends the leaver nothing else. */
export function followLeaves(intents: IntentBus): () => void {
  return intents.onOutcome((intent, outcome) => {
    if (outcome.ok && intent.type === 'room.leave') {
      leaveRoom();
      dispatchPresence({ type: 'left' });
    }
  });
}
