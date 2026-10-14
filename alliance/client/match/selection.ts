import type {
  PieceView,
  PrivateView,
} from '@alliance/contract/server-message.js';
import { createStore } from 'zustand/vanilla';
import { onMatchReset } from '#infra/store/frame.js';

export interface SelectionState {
  /** Uid of the piece the player picked up. */
  readonly uid: number | null;
  /** Enemy opened from the pen / intel drawer (mutually exclusive with uid). */
  readonly enemyDetail: { readonly id: string; readonly count?: number } | null;
}

export const selectionStore = createStore<SelectionState>(() => ({
  uid: null,
  enemyDetail: null,
}));

onMatchReset(() => selectionStore.setState({ uid: null, enemyDetail: null }));

export type PieceArea = 'board' | 'hand' | 'temp';

export interface LocatedPiece {
  readonly piece: PieceView;
  readonly area: PieceArea;
  /** Hand / temp slot index; null on the board. */
  readonly idx: number | null;
}

/** The piece with the uid and where it is, or null. */
export function findPiece(
  view: PrivateView | null,
  uid: number | null,
): LocatedPiece | null {
  if (!view || uid === null) {
    return null;
  }
  const board = view.board.find((piece) => piece.uid === uid);
  if (board) {
    return { piece: board, area: 'board', idx: null };
  }
  const handIdx = view.hand.findIndex((piece) => piece?.uid === uid);
  if (handIdx >= 0) {
    const hand = view.hand[handIdx];
    return hand ? { piece: hand, area: 'hand', idx: handIdx } : null;
  }
  const tempIdx = view.temp.findIndex((piece) => piece?.uid === uid);
  if (tempIdx >= 0) {
    const temp = view.temp[tempIdx];
    return temp ? { piece: temp, area: 'temp', idx: tempIdx } : null;
  }
  return null;
}

/** First free bench slot, or null when the bench is full. */
export function freeHandSlot(view: PrivateView): number | null {
  const index = view.hand.indexOf(null);
  return index < 0 ? null : index;
}

/** The board piece on a tile. */
export function pieceAt(
  view: PrivateView | null,
  row: number,
  col: number,
): PieceView | null {
  return (
    view?.board.find((piece) => piece.row === row && piece.col === col) ?? null
  );
}
