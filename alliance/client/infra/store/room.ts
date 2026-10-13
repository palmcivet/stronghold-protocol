import type { RoomView } from '@alliance/contract/server-message.js';
import { createStore } from 'zustand/vanilla';

export interface RoomState {
  readonly room: RoomView | null;
}

export const roomStore = createStore<RoomState>(() => ({ room: null }));

export function isSpectating(
  room: RoomView | null,
  playerId: string | null,
): boolean {
  return (
    playerId !== null &&
    !!room?.spectators.some((spectator) => spectator.playerId === playerId)
  );
}

export function isHost(
  room: RoomView | null,
  playerId: string | null,
): boolean {
  return playerId !== null && room?.hostId === playerId;
}
