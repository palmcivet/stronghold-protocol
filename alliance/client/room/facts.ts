import type { RoomView, SeatView } from '@alliance/contract/server-message.js';

/** What a seat shows in its foot: ready, offline, the host standing by, or still preparing. */
export type SeatState = 'ready' | 'offline' | 'host' | 'waiting';

export function seatState(room: RoomView, seat: SeatView): SeatState {
  if (!seat.connected && !seat.isBot) {
    return 'offline';
  }
  if (seat.ready || seat.isBot) {
    return 'ready';
  }
  return seat.playerId === room.hostId ? 'host' : 'waiting';
}

/** The status line of the room bar. */
export type RoomStatus =
  | 'offline'
  | 'spectating'
  | 'solo'
  | 'canStart'
  | 'waitingOthers'
  | 'readyWaitingHost'
  | 'getReady';

export interface RoomFacts {
  readonly host: boolean;
  readonly mine: SeatView | null;
  readonly spectating: boolean;
  readonly humans: readonly SeatView[];
  /** Humans counted as ready; the host counts, since starting readies them. */
  readonly readyHumans: number;
  readonly emptySeats: number;
  readonly canStart: boolean;
  readonly status: RoomStatus;
}

/** The facts the room page derives from `room.state`, as master's room screen does. */
export function roomFacts(
  room: RoomView,
  playerId: string | null,
  online: boolean,
): RoomFacts {
  const seats = room.seats.filter((seat): seat is SeatView => seat !== null);
  const humans = seats.filter((seat) => !seat.isBot);
  const mine = seats.find((seat) => seat.playerId === playerId) ?? null;
  const host = playerId !== null && room.hostId === playerId;
  const others = humans.filter((seat) => seat.playerId !== room.hostId);
  const othersReady = others.every((seat) => seat.ready && seat.connected);
  const canStart = host && othersReady && mine !== null;
  const spectating = room.spectators.some(
    (spectator) => spectator.playerId === playerId,
  );
  const status: RoomStatus = !online
    ? 'offline'
    : spectating
      ? 'spectating'
      : room.mode === 'solo'
        ? 'solo'
        : host
          ? canStart
            ? 'canStart'
            : 'waitingOthers'
          : mine?.ready
            ? 'readyWaitingHost'
            : 'getReady';
  return {
    host,
    mine,
    spectating,
    humans,
    readyHumans: humans.filter(
      (seat) => seat.ready || seat.playerId === room.hostId,
    ).length,
    emptySeats: room.seats.filter((seat) => seat === null).length,
    canStart,
    status,
  };
}
