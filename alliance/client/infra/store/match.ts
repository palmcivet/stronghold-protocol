import type { Settlement } from '@alliance/compat-upstream';
import type {
  PrivateView,
  PublicView,
  ResultView,
} from '@alliance/contract/server-message.js';
import { createStore } from 'zustand/vanilla';

export const TICKER_LIMIT = 30;
export const EMOTE_LIMIT = 8;

/** An emote a player sent. */
export interface EmoteLine {
  readonly seq: number;
  readonly playerId: string;
  readonly id: string;
  /** Local epoch ms of its arrival. */
  readonly at: number;
}

/** A line of the broadcast ticker. */
export interface TickerLine {
  readonly id: number;
  readonly text: string;
}

export interface MatchState {
  readonly public: PublicView | null;
  readonly private: PrivateView | null;
  readonly result: ResultView | null;
  /** Settlement data of the current public view, mapped from the server; null when it carries none. */
  readonly settlement: Settlement | null;
  readonly ticker: readonly TickerLine[];
  readonly emotes: readonly EmoteLine[];
  /** Server clock minus the local clock, in ms. */
  readonly clockOffset: number;
}

export const initialMatch = (): MatchState => ({
  public: null,
  private: null,
  result: null,
  settlement: null,
  ticker: [],
  emotes: [],
  clockOffset: 0,
});

export const matchStore = createStore<MatchState>(initialMatch);

/** Seconds left of the current phase, or null when it is untimed. */
export function secondsLeft(
  state: Pick<MatchState, 'public' | 'clockOffset'>,
  now: number,
): number | null {
  const deadline = state.public?.deadline ?? 0;
  if (!deadline) {
    return null;
  }
  return Math.max(0, Math.ceil((deadline - (now + state.clockOffset)) / 1000));
}
