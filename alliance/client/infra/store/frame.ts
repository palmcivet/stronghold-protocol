import {
  type MasterFieldView,
  type MasterSettlementView,
  type MasterSnapView,
  settlementOf,
  streamEventsOf,
  streamFieldUnitsOf,
  streamSnapshotOf,
} from '@alliance/compat-upstream';
import type { ServerMessage } from '@alliance/contract/server-message.js';
import { backendOf } from '../connection/backend.js';
import { translateWire } from '../text/index.js';
import {
  EMOTE_LIMIT,
  initialMatch,
  matchStore,
  TICKER_LIMIT,
} from './match.js';
import { roomStore } from './room.js';
import { sessionStore } from './session.js';
import {
  applyStreamEvents,
  applyStreamSnapshot,
  initialStream,
  openStreamField,
  streamStore,
} from './stream.js';

/** The view a message carries, without its type and request id. */
function payload<M extends { readonly t: string; readonly rid?: number }>(
  message: M,
): Omit<M, 't' | 'rid'> {
  const { t: _type, rid: _rid, ...rest } = message;
  return rest;
}

let tickerId = 0;
let emoteSeq = 0;

function pushTicker(text: string): void {
  if (!text) {
    return;
  }
  tickerId += 1;
  const line = { id: tickerId, text };
  matchStore.setState((state) => ({
    ticker: [...state.ticker, line].slice(-TICKER_LIMIT),
  }));
}

const resetListeners = new Set<() => void>();

/** Runs the listener whenever a room or a match is cleared, for state kept outside these stores. */
export function onMatchReset(listener: () => void): () => void {
  resetListeners.add(listener);
  return () => resetListeners.delete(listener);
}

/** Clears what a room or a match left behind. */
export function resetMatch(): void {
  matchStore.setState({
    ...initialMatch(),
    clockOffset: matchStore.getState().clockOffset,
  });
  streamStore.setState(initialStream());
  for (const listener of resetListeners) {
    listener();
  }
}

/** Clears the room and match the server let the player leave. */
export function leaveRoom(): void {
  roomStore.setState({ room: null });
  resetMatch();
}

/** Applies one server message to the stores. Messages the stores do not hold are ignored. */
export function applyFrame(
  frame: ServerMessage,
  now: number = Date.now(),
): void {
  switch (frame.t) {
    case 'welcome': {
      const previous = sessionStore.getState().playerId;
      const playerId = frame.playerId;
      if (previous !== null && previous !== playerId) {
        roomStore.setState({ room: null });
        resetMatch();
      }
      sessionStore.setState({
        playerId,
        token: frame.token,
        name: frame.name || sessionStore.getState().name,
        backend: backendOf(frame),
        everOnline: true,
      });
      if (typeof frame.serverNow === 'number') {
        matchStore.setState({ clockOffset: frame.serverNow - now });
      }
      return;
    }
    case 'room.state': {
      const room = payload(frame);
      const previous = roomStore.getState().room;
      if (previous && previous.code !== room.code) {
        resetMatch();
      }
      roomStore.setState({ room });
      return;
    }
    case 'room.closed': {
      roomStore.setState({ room: null });
      resetMatch();
      return;
    }
    case 'm.public': {
      const view = payload(frame);
      matchStore.setState({
        public: view,
        settlement: settlementOf(view as MasterSettlementView),
        ...(typeof view.serverNow === 'number'
          ? { clockOffset: view.serverNow - now }
          : {}),
      });
      return;
    }
    case 'm.private': {
      matchStore.setState({ private: payload(frame) });
      return;
    }
    case 'm.field': {
      openStreamField(
        frame.fieldId,
        streamFieldUnitsOf(frame as MasterFieldView),
      );
      return;
    }
    case 'b.start': {
      openStreamField(frame.fieldId, []);
      return;
    }
    case 'b.snap': {
      applyStreamSnapshot(
        frame.fieldId,
        streamSnapshotOf(frame as MasterSnapView),
      );
      return;
    }
    case 'b.ev': {
      applyStreamEvents(frame.fieldId, streamEventsOf(frame.ev));
      return;
    }
    case 'm.result': {
      matchStore.setState({ result: payload(frame) });
      return;
    }
    case 'm.emote': {
      emoteSeq += 1;
      const line = {
        seq: emoteSeq,
        playerId: frame.playerId,
        id: frame.id,
        at: now,
      };
      matchStore.setState((state) => ({
        emotes: [...state.emotes, line].slice(-EMOTE_LIMIT),
      }));
      return;
    }
    case 'm.ticker':
    case 'm.toast': {
      pushTicker(translateWire(frame));
      return;
    }
    default:
      return;
  }
}
