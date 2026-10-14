import { createStore } from 'zustand/vanilla';
import type { Identity } from './identity.js';

/** The identity of this page and how it reconnects, for the recovery button; boot sets it. */
export const seatStore = createStore<{
  readonly identity: Identity | null;
  readonly reconnect: () => void;
}>(() => ({ identity: null, reconnect: () => {} }));

/** Takes back a closed tab's seat, as master's resume button: the identity checks the live tabs, then reconnects. */
export async function resumeSeat(id: string): Promise<boolean> {
  const { identity, reconnect } = seatStore.getState();
  if (!identity || !(await identity.resume(id))) {
    return false;
  }
  reconnect();
  return true;
}
