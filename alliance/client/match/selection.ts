import type {
  PieceView,
  PrivateView,
} from '@alliance/contract/server-message.js';
import { createStore } from 'zustand/vanilla';

export interface SelectionState {
  /** Uid of the piece the player picked up. */
  readonly uid: number | null;
}

export const selectionStore = createStore<SelectionState>(() => ({
  uid: null,
}));

export type PieceArea = 'board' | 'hand' | 'temp';

export interface LocatedPiece {
  readonly piece: PieceView;
  readonly area: PieceArea;
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
    return { piece: board, area: 'board' };
  }
  const hand = view.hand.find((piece) => piece?.uid === uid);
  if (hand) {
    return { piece: hand, area: 'hand' };
  }
  const temp = view.temp.find((piece) => piece?.uid === uid);
  return temp ? { piece: temp, area: 'temp' } : null;
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
