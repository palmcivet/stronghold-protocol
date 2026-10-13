import type { PrivateView } from '@alliance/contract/server-message.js';
import { describe, expect, it } from 'vitest';
import { findPiece, freeHandSlot, pieceAt } from './selection.js';

const view = {
  board: [{ uid: 3, kind: 'chess', id: 'c', row: 10, col: 3 }],
  hand: [{ uid: 5, kind: 'item', id: 'i' }, null],
  temp: [null, { uid: 7, kind: 'chess', id: 't' }],
} as unknown as PrivateView;

describe('selection', () => {
  it('finds a piece in any area', () => {
    expect(findPiece(view, 3)?.area).toBe('board');
    expect(findPiece(view, 5)?.area).toBe('hand');
    expect(findPiece(view, 7)?.area).toBe('temp');
    expect(findPiece(view, 9)).toBeNull();
  });

  it('finds the first free bench slot and the piece on a tile', () => {
    expect(freeHandSlot(view)).toBe(1);
    expect(pieceAt(view, 10, 3)?.uid).toBe(3);
    expect(pieceAt(view, 9, 3)).toBeNull();
  });
});
