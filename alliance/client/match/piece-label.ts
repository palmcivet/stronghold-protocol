import type { CatalogChess } from '@alliance/contract/catalog.js';
import type { CardView, PieceView } from '@alliance/contract/server-message.js';
import { dataName, t } from '../infra/text/index.js';

/** Name of a piece or a shop card: an operator or an item. */
export function cardName(card: Pick<CardView, 'kind' | 'id'>): string {
  return card.kind === 'item'
    ? dataName('item', card.id)
    : dataName('chess', card.id);
}

export function pieceLabel(piece: PieceView): string {
  const parts = [cardName(piece)];
  if (piece.golden) {
    parts.push(t('core:unit.golden'));
  }
  if (piece.items?.length) {
    parts.push(t('core:unit.items', { count: piece.items.length }));
  }
  return parts.join(' · ');
}

export function tierClass(
  styles: Readonly<Record<string, string>>,
  tier: number | undefined,
  chess?: CatalogChess,
): string {
  const value = tier ?? chess?.tier ?? 1;
  return styles[`tier${Math.min(6, Math.max(1, value))}`] ?? '';
}
