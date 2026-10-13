import type {
  StreamEvent,
  StreamSnapshot,
  StreamUnitInfo,
} from '@alliance/compat-upstream';
import { createStore } from 'zustand/vanilla';

/** How many battle events the field keeps for its log. */
export const STREAM_EVENT_LIMIT = 8;

export interface StreamLine {
  readonly seq: number;
  readonly event: Exclude<StreamEvent, { readonly kind: 'spawn' }>;
}

/** A battle the server streams to this client, as the stand-in battlefield draws it. */
export interface StreamState {
  /** The field the stream is of, null before any field or snapshot. */
  readonly fieldId: string | null;
  readonly info: Readonly<Record<string, StreamUnitInfo>>;
  /** The latest snapshot of the field, null before the first. */
  readonly snapshot: StreamSnapshot | null;
  readonly events: readonly StreamLine[];
}

export const initialStream = (): StreamState => ({
  fieldId: null,
  info: {},
  snapshot: null,
  events: [],
});

export const streamStore = createStore<StreamState>(initialStream);

let seq = 0;

/** Starts a field over: its units, snapshot and log. */
export function openStreamField(
  fieldId: string,
  units: readonly StreamUnitInfo[],
): void {
  streamStore.setState({
    ...initialStream(),
    fieldId,
    info: Object.fromEntries(units.map((unit) => [unit.id, unit])),
  });
}

function follow(fieldId: string): void {
  if (streamStore.getState().fieldId !== fieldId) {
    openStreamField(fieldId, []);
  }
}

export function applyStreamSnapshot(
  fieldId: string,
  snapshot: StreamSnapshot,
): void {
  follow(fieldId);
  streamStore.setState({ snapshot });
}

export function applyStreamEvents(
  fieldId: string,
  events: readonly StreamEvent[],
): void {
  follow(fieldId);
  const state = streamStore.getState();
  const info = { ...state.info };
  const lines: StreamLine[] = [];
  for (const event of events) {
    if (event.kind === 'spawn') {
      info[event.unit.id] = event.unit;
    } else {
      seq += 1;
      lines.push({ seq, event });
    }
  }
  streamStore.setState({
    info,
    events: [...state.events, ...lines].slice(-STREAM_EVENT_LIMIT),
  });
}
