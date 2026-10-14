import { GEO } from '@alliance/contract/match.js';
import { describe, expect, it } from 'vitest';
import {
  createPointerDragSession,
  type PointerPoint,
} from '#match/field/pointer-drag.js';
import {
  resolveDrop,
  sameSlot,
  snapHandSlot,
  tileSlot,
} from '#match/field/prep-drag.js';

describe('tileSlot', () => {
  it('maps board, hand and temp cells', () => {
    expect(tileSlot({ row: GEO.FIELD.r0, col: GEO.FIELD.c0 })).toEqual({
      area: 'board',
      row: GEO.FIELD.r0,
      col: GEO.FIELD.c0,
    });
    expect(tileSlot({ row: GEO.HAND_ROW, col: 3 })).toEqual({
      area: 'hand',
      idx: 3,
    });
    expect(tileSlot({ row: GEO.TEMP_ROW, col: GEO.TEMP_C0 + 1 })).toEqual({
      area: 'temp',
      idx: 1,
    });
    expect(tileSlot({ row: 0, col: 0 })).toBeNull();
  });
});

describe('snapHandSlot', () => {
  it('maps temp and undershoot rows onto the hand', () => {
    expect(snapHandSlot({ row: GEO.TEMP_ROW, col: GEO.TEMP_C0 })).toEqual({
      area: 'hand',
      idx: GEO.TEMP_C0,
    });
    expect(snapHandSlot({ row: GEO.HAND_ROW - 1, col: 9 })).toEqual({
      area: 'hand',
      idx: 9,
    });
    expect(snapHandSlot({ row: GEO.FIELD.r0, col: 4 })).toBeNull();
  });
});

describe('resolveDrop', () => {
  const piece = { uid: 1, kind: 'chess' as const, id: 'a' };

  it('drops outside when the pointer leaves the surface', () => {
    expect(
      resolveDrop({
        piece,
        from: { area: 'board', row: 10, col: 4 },
        tile: null,
        overSurface: false,
        clientX: 12,
        clientY: 34,
      }),
    ).toEqual({
      kind: 'drop',
      target: { area: 'outside', clientX: 12, clientY: 34 },
    });
  });

  it('snaps temp / near-hand miss to the hand row', () => {
    expect(
      resolveDrop({
        piece,
        from: { area: 'board', row: 10, col: 4 },
        tile: { row: GEO.TEMP_ROW, col: GEO.TEMP_C0 },
        overSurface: true,
        clientX: 0,
        clientY: 0,
      }),
    ).toEqual({
      kind: 'drop',
      target: { area: 'hand', idx: GEO.TEMP_C0 },
    });
    expect(
      resolveDrop({
        piece,
        from: { area: 'board', row: 10, col: 4 },
        tile: { row: GEO.HAND_ROW - 1, col: 3 },
        overSurface: true,
        clientX: 0,
        clientY: 0,
      }),
    ).toEqual({ kind: 'drop', target: { area: 'hand', idx: 3 } });
  });

  it('cancels same hand slot', () => {
    expect(
      resolveDrop({
        piece,
        from: { area: 'hand', idx: 2 },
        tile: { row: GEO.HAND_ROW, col: 2 },
        overSurface: true,
        clientX: 0,
        clientY: 0,
      }).kind,
    ).toBe('cancel');
  });

  it('allows board to board including own tile', () => {
    const from = { area: 'board' as const, row: 10, col: 4 };
    expect(
      resolveDrop({
        piece,
        from,
        tile: { row: 10, col: 4 },
        overSurface: true,
        clientX: 0,
        clientY: 0,
      }),
    ).toEqual({ kind: 'drop', target: from });
    expect(sameSlot(from, from)).toBe(true);
  });
});

describe('createPointerDragSession', () => {
  const point = (
    partial: Partial<PointerPoint> & Pick<PointerPoint, 'x' | 'y'>,
  ): PointerPoint => ({
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    clientX: partial.x,
    clientY: partial.y,
    ...partial,
  });

  it('emits click when the pointer stays under the threshold', () => {
    const events: string[] = [];
    const session = createPointerDragSession<{ id: number }>({
      hitSubject: () => ({ id: 7 }),
      pickTile: () => ({ row: 1, col: 2 }),
      emit: (event) => events.push(event.type),
    });
    session.setEditable(true);
    expect(session.pointerDown(point({ x: 0, y: 0 }))).toBe(true);
    session.pointerUp(point({ x: 2, y: 1 }));
    expect(events).toEqual(['subjectClick']);
  });

  it('starts a drag past the threshold when editable', () => {
    const events: string[] = [];
    const session = createPointerDragSession<{ id: number }>({
      hitSubject: () => ({ id: 7 }),
      pickTile: () => ({ row: 1, col: 2 }),
      emit: (event) => events.push(event.type),
      threshold: 4,
    });
    session.setEditable(true);
    session.pointerDown(point({ x: 0, y: 0 }));
    session.pointerMove(point({ x: 10, y: 0 }));
    session.pointerUp(point({ x: 10, y: 0 }));
    expect(events).toContain('dragStart');
    expect(events).toContain('dragMove');
    expect(events).toContain('dragEnd');
  });
});
