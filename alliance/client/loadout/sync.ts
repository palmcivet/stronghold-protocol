import type { Catalog } from '@alliance/contract/catalog.js';
import { PHASE } from '@alliance/contract/match.js';
import { createStore } from 'zustand/vanilla';
import type { IntentBus } from '#infra/intent/bus.js';
import { sanitizeEntries, sanitizeOps } from './model.js';
import { loadoutStore } from './state.js';

/** The three settings master keeps on the session and the seat. */
export type SyncKind = 'loadout' | 'ownership' | 'diy';
export const SYNC_KINDS: readonly SyncKind[] = ['loadout', 'ownership', 'diy'];

/**
 * Master's sync states: `locked` is a WRONG_PHASE or ROOM_STARTED reply, which still means the server stored the
 * setting; the running match keeps what it took and the next match takes the new one.
 */
export type SyncState =
  | 'idle'
  | 'pending'
  | 'sending'
  | 'synced'
  | 'locked'
  | 'error';

export const syncStore = createStore<Readonly<Record<SyncKind, SyncState>>>(
  () => ({ loadout: 'idle', ownership: 'idle', diy: 'idle' }),
);

/** Master's debounce between an edit and its send. */
export const SYNC_DEBOUNCE_MS = 500;

const LOCKED = new Set(['WRONG_PHASE', 'ROOM_STARTED']);

const TYPE: Readonly<
  Record<SyncKind, 'room.loadout' | 'room.ownership' | 'room.diy'>
> = {
  loadout: 'room.loadout',
  ownership: 'room.ownership',
  diy: 'room.diy',
};

/**
 * The message of a setting, as master's: the loadout cleaned against the data (an empty one needs no data and is
 * `{ entries: {}, ops: {} }`), the ownership and the picks as stored. Null while the data a loadout needs is missing.
 */
export function payloadOf(
  kind: SyncKind,
  catalog: Catalog | null,
): Readonly<Record<string, unknown>> | null {
  const { entries, ops, notOwned, diy } = loadoutStore.getState();
  if (kind === 'ownership') {
    return { notOwned };
  }
  if (kind === 'diy') {
    return { picks: diy };
  }
  if (!Object.keys(entries).length && !Object.keys(ops).length) {
    return { entries: {}, ops: {} };
  }
  return catalog
    ? {
        entries: sanitizeEntries(entries, catalog),
        ops: sanitizeOps(ops, catalog),
      }
    : null;
}

/** Sends one setting and records its state; the newest send owns the state. */
export async function sendSetting(
  bus: Pick<IntentBus, 'dispatch'>,
  kind: SyncKind,
  catalog: Catalog | null,
): Promise<SyncState> {
  const fields = payloadOf(kind, catalog);
  if (!fields) {
    return syncStore.getState()[kind];
  }
  syncStore.setState({ [kind]: 'sending' });
  const outcome = await bus.dispatch({ type: TYPE[kind], fields });
  const state: SyncState = outcome.ok
    ? 'synced'
    : LOCKED.has(outcome.error.code)
      ? 'locked'
      : 'error';
  syncStore.setState({ [kind]: state });
  return state;
}

/** Sends the given settings in master's order. */
export async function syncSettings(
  bus: Pick<IntentBus, 'dispatch'>,
  catalog: Catalog | null,
  kinds: readonly SyncKind[] = SYNC_KINDS,
): Promise<void> {
  for (const kind of kinds) {
    await sendSetting(bus, kind, catalog);
  }
}

/** The settings master sends again when the room is back out of a match: the ones a match had locked. */
export const lockedKinds = (): SyncKind[] =>
  SYNC_KINDS.filter((kind) => syncStore.getState()[kind] === 'locked');

/**
 * When a change takes effect, as master: in the lobby all next match; during the briefing (INFO_CHECK) the loadout
 * this match, ownership and the custom squad next match; after it all next match.
 */
export function takesEffect(
  kind: SyncKind,
  phase: string | null,
): 'thisMatch' | 'nextMatch' {
  return kind === 'loadout' && phase === PHASE.INFO_CHECK
    ? 'thisMatch'
    : 'nextMatch';
}
