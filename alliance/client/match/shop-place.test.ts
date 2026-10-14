import type { PrivateView } from '@alliance/contract/server-message.js';
import { describe, expect, it } from 'vitest';
import { pieceAfterBuy } from '#match/shop-place.js';

describe('pieceAfterBuy', () => {
  it('prefers a fresh piece with the shop card id', () => {
    const view = {
      board: [{ uid: 2, kind: 'chess', id: 'chess_a', row: 1, col: 1 }],
      hand: [{ uid: 3, kind: 'chess', id: 'chess_b' }, null],
      temp: [null],
    } as unknown as PrivateView;
    expect(pieceAfterBuy(new Set([1]), view, 'chess_b')?.uid).toBe(3);
    expect(pieceAfterBuy(new Set([1, 2, 3]), view, 'chess_b')).toBeNull();
  });
});
