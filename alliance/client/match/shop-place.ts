/**
 * Shop buy then place / equip onto a prep drop target. Shared by the shop HUD drag and any other shop→board path.
 */
import type {
  PieceView,
  PrivateView,
  ShopSlot,
} from '@alliance/contract/server-message.js';
import type { IntentBus } from '#infra/intent/bus.js';
import { matchStore } from '#infra/store/match.js';
import { equipItem } from '#match/equip.js';

/** Board or hand drop after a shop buy (temp / outside are not placed here). */
export type ShopDropTarget =
  | { readonly area: 'board'; readonly row: number; readonly col: number }
  | { readonly area: 'hand'; readonly idx: number };

function uidsOf(view: PrivateView | null): Set<number> {
  if (!view) {
    return new Set();
  }
  const uids = new Set<number>();
  for (const piece of [...view.board, ...view.hand, ...view.temp]) {
    if (piece) {
      uids.add(piece.uid);
    }
  }
  return uids;
}

/** Newly bought piece after `g.buy`, preferring the shop card's id. */
export function pieceAfterBuy(
  before: ReadonlySet<number>,
  view: PrivateView | null,
  cardId: string,
): PieceView | null {
  if (!view) {
    return null;
  }
  const pieces = [...view.board, ...view.hand, ...view.temp].filter(
    (piece): piece is PieceView => piece !== null && !before.has(piece.uid),
  );
  return pieces.find((piece) => piece.id === cardId) ?? pieces[0] ?? null;
}

export async function buyAndPlace(
  intents: IntentBus,
  slot: number,
  card: ShopSlot,
  target: ShopDropTarget,
): Promise<void> {
  const before = uidsOf(matchStore.getState().private);
  const bought = await intents.dispatch({
    type: 'g.buy',
    fields: { slot },
  });
  if (!bought.ok) {
    return;
  }
  const piece = pieceAfterBuy(before, matchStore.getState().private, card.id);
  if (!piece) {
    return;
  }
  if (target.area === 'hand') {
    await intents.dispatch({
      type: 'g.move',
      fields: { uid: piece.uid, to: { area: 'hand', idx: target.idx } },
    });
    return;
  }
  const view = matchStore.getState().private;
  const occupant = view?.board.find(
    (each) => each.row === target.row && each.col === target.col,
  );
  if (piece.kind === 'item' && occupant && occupant.kind !== 'item') {
    await equipItem(intents, piece.uid, occupant);
    return;
  }
  await intents.dispatch({
    type: 'g.move',
    fields: {
      uid: piece.uid,
      to: { area: 'board', row: target.row, col: target.col },
    },
  });
}
