import {
  type ComponentType,
  type ReactNode,
  useSyncExternalStore,
} from 'react';
import { useStore } from 'zustand';
import { matchStore } from '../infra/store/match.js';
import { presenceStore } from '../infra/store/presence.js';
import { roomStore } from '../infra/store/room.js';
import { sessionStore } from '../infra/store/session.js';
import { PartSlot } from './boundary.js';
import { definePart, hasPart, Part } from './registry.js';

/**
 * A declarative condition on the session, room or public match view. An insert without a `when` always shows.
 * Only the keys listed here are read; arbitrary functions are not accepted.
 */
export interface InsertWhen {
  /** The backend advertises this capability. */
  readonly capability?: string;
  /** The player holds this seat in the room. */
  readonly seat?: 'host' | 'player' | 'spectator';
  /** The room is co-op when true, solo when false. */
  readonly coop?: boolean;
  /** The public match phase equals this string. */
  readonly phase?: string;
}

export interface PartInsert {
  /** Container the part goes into. */
  readonly into: string;
  /** Part id of the contribution. */
  readonly id: string;
  /** Lower comes first; ties keep registration order. */
  readonly order: number;
  readonly when?: InsertWhen;
  /** Defines the part under `id` when the id is not defined yet. */
  readonly component?: ComponentType;
}

interface Entry extends PartInsert {
  readonly seq: number;
}

const entries: Entry[] = [];
const listeners = new Set<() => void>();
let seq = 0;

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Adds a part to a container. Returns a function that removes it. */
export function insertPart(insert: PartInsert): () => void {
  const undefine =
    insert.component && !hasPart(insert.id)
      ? definePart(insert.id, insert.component)
      : null;
  seq += 1;
  const entry: Entry = { ...insert, seq };
  entries.push(entry);
  notify();
  return () => {
    const index = entries.indexOf(entry);
    if (index >= 0) {
      entries.splice(index, 1);
      notify();
    }
    undefine?.();
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): readonly Entry[] {
  return entries;
}

function matches(when: InsertWhen | undefined): boolean {
  if (!when) {
    return true;
  }
  if (when.capability !== undefined) {
    const capabilities = sessionStore.getState().backend?.capabilities as
      | Readonly<Record<string, unknown>>
      | undefined;
    if (capabilities?.[when.capability] !== true) {
      return false;
    }
  }
  if (when.coop !== undefined) {
    if ((roomStore.getState().room?.mode === 'coop') !== when.coop) {
      return false;
    }
  }
  if (when.phase !== undefined) {
    if (matchStore.getState().public?.phase !== when.phase) {
      return false;
    }
  }
  if (when.seat !== undefined) {
    const room = roomStore.getState().room;
    const playerId = sessionStore.getState().playerId;
    if (!room || !playerId) {
      return false;
    }
    if (when.seat === 'host' && room.hostId !== playerId) {
      return false;
    }
    if (when.seat === 'spectator') {
      if (
        !room.spectators.some((spectator) => spectator.playerId === playerId)
      ) {
        return false;
      }
    }
    if (when.seat === 'player') {
      const seated = room.seats.some((seat) => seat?.playerId === playerId);
      if (!seated) {
        return false;
      }
    }
  }
  return true;
}

/** The parts of a container in render order: its defaults and inserts, filtered by `when` and sorted by `order`. */
export function useSlotParts(
  id: string,
  defaults: readonly PartInsert[] = [],
): readonly PartInsert[] {
  const registered = useSyncExternalStore(subscribe, snapshot, snapshot);
  // re-read stores so when predicates update with the session
  useStore(sessionStore, (state) => state.backend);
  useStore(sessionStore, (state) => state.playerId);
  useStore(roomStore, (state) => state.room);
  useStore(matchStore, (state) => state.public?.phase);
  useStore(presenceStore, (state) => state.presence);
  return [
    ...defaults
      .filter((part) => part.into === id)
      .map((part, index) => ({ ...part, seq: -defaults.length + index })),
    ...registered.filter((part) => part.into === id),
  ]
    .filter((part) => matches(part.when))
    .sort((left, right) => left.order - right.order || left.seq - right.seq);
}

/** One child of a container: the registered part, or the insert's own component. */
export function SlotChild({ part }: { readonly part: PartInsert }) {
  if (hasPart(part.id)) {
    return <Part id={part.id} />;
  }
  const Child = part.component;
  return Child ? (
    <PartSlot part={part.id}>
      <Child />
    </PartSlot>
  ) : null;
}

/**
 * A layout container: its registered inserts, filtered by `when` and sorted by `order`, plus the built-in parts
 * the host lists in `defaults` (same shape as an insert). Defaults come before inserts of equal order.
 */
export function Slot({
  id,
  defaults = [],
  children,
}: {
  readonly id: string;
  /** Built-in parts of this container. Same shape as a mod insert. */
  readonly defaults?: readonly PartInsert[];
  readonly children?: ReactNode;
}) {
  const parts = useSlotParts(id, defaults);
  return (
    <div data-slot={id} style={{ display: 'contents' }}>
      {children}
      {parts.map((part) => (
        <SlotChild key={part.id} part={part} />
      ))}
    </div>
  );
}
