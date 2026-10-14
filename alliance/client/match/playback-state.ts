import { useStore } from 'zustand';
import { useShallow } from 'zustand/shallow';
import { createStore } from 'zustand/vanilla';
import { onMatchReset } from '#infra/store/frame.js';

/** `local`: this client runs the battle. `server`: the server runs it and the client only shows its progress. */
export type PlaybackMode = 'local' | 'server';

export interface BattleView {
  readonly battleId: string;
  readonly fieldId: string;
  readonly kind: string;
  readonly authoritative: boolean;
  readonly mode: PlaybackMode;
  readonly killed: number;
  readonly total: number;
  /** Ally COST when the local bridge or a stream snap carries it. */
  readonly dp: number | null;
  readonly done: boolean;
  /** Why the battle ended for this client, from `b.end`. */
  readonly endReason: string | null;
}

export interface PlaybackState {
  readonly battle: BattleView | null;
}

export const playbackStore = createStore<PlaybackState>(() => ({
  battle: null,
}));

onMatchReset(() => playbackStore.setState({ battle: null }));

export const usePlayback = <T>(select: (state: PlaybackState) => T): T =>
  useStore(playbackStore, useShallow(select));
