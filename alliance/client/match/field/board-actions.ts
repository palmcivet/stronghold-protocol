import { useStore } from 'zustand';
import { useIntent } from '#infra/intent/context.js';
import { useMatch } from '#infra/store/hook.js';
import { equipItem } from '#match/equip.js';
import { findPiece, pieceAt, selectionStore } from '#match/selection.js';

export interface BoardActions {
  /** Picks the piece on a board tile, or puts the picked piece there (an item onto an operator equips it). */
  readonly tile: (row: number, col: number) => Promise<void>;
  /** Picks the piece in a bench slot, or puts the picked piece there when the slot is a free bench pad. */
  readonly bench: (area: 'hand' | 'temp', idx: number) => Promise<void>;
}

/** What a press on the field does: the same for the 3D stage and the keyboard grid. */
export function useBoardActions(canAct: boolean): BoardActions {
  const intents = useIntent();
  const view = useMatch((state) => state.private);
  const selected = useStore(selectionStore, (state) => state.uid);
  const pick = (uid: number | null): void => {
    selectionStore.setState({ uid });
  };

  const tile = async (row: number, col: number): Promise<void> => {
    if (!canAct) {
      return;
    }
    const occupant = pieceAt(view, row, col);
    const holding = findPiece(view, selected);
    if (!holding) {
      pick(occupant?.uid ?? null);
      return;
    }
    if (occupant?.uid === holding.piece.uid) {
      pick(null);
      return;
    }
    if (holding.piece.kind === 'item' && occupant && occupant.kind !== 'item') {
      await equipItem(intents, holding.piece.uid, occupant);
    } else {
      await intents.dispatch({
        type: 'g.move',
        fields: { uid: holding.piece.uid, to: { area: 'board', row, col } },
      });
    }
    pick(null);
  };

  const bench = async (area: 'hand' | 'temp', idx: number): Promise<void> => {
    if (!canAct || !view) {
      return;
    }
    const occupant = (area === 'hand' ? view.hand : view.temp)[idx] ?? null;
    const holding = findPiece(view, selected);
    if (occupant) {
      pick(occupant.uid === selected ? null : occupant.uid);
      return;
    }
    if (holding && area === 'hand' && holding.area !== 'hand') {
      await intents.dispatch({
        type: 'g.move',
        fields: { uid: holding.piece.uid, to: { area: 'hand', idx } },
      });
    }
    pick(null);
  };

  return { tile, bench };
}
