/**
 * Autochess prep drag targets (board / hand / outside). Slot shapes stay here; the press→drag state machine lives in
 * `pointer-drag.ts` so mainline stages can reuse it without GEO.
 */
import { GEO } from '@alliance/contract/match.js';
import type { PieceView } from '@alliance/contract/server-message.js';
import {
  createPointerDragSession,
  type DragTile,
  type PointerDragEvent,
  type PointerDragSession,
  type PointerPoint,
} from '#match/field/pointer-drag.js';
import type { LocatedPiece } from '#match/selection.js';

export type PrepDropTarget =
  | { readonly area: 'board'; readonly row: number; readonly col: number }
  | { readonly area: 'hand'; readonly idx: number }
  | {
      readonly area: 'outside';
      readonly clientX: number;
      readonly clientY: number;
    };

export type PrepSlot =
  | { readonly area: 'board'; readonly row: number; readonly col: number }
  | { readonly area: 'hand'; readonly idx: number }
  | { readonly area: 'temp'; readonly idx: number };

/** Where a located piece sits, in protocol target form. */
export function pieceSlot(located: LocatedPiece): PrepSlot | null {
  const { piece, area, idx } = located;
  if (area === 'hand' && idx !== null) {
    return { area: 'hand', idx };
  }
  if (area === 'temp' && idx !== null) {
    return { area: 'temp', idx };
  }
  if (area === 'board' && piece.row !== undefined && piece.col !== undefined) {
    return { area: 'board', row: piece.row, col: piece.col };
  }
  return null;
}

/** Classify a grid tile as a drop slot. */
export function tileSlot(
  tile: DragTile | null | undefined,
  geo: typeof GEO = GEO,
): PrepSlot | null {
  if (!tile || !Number.isInteger(tile.row) || !Number.isInteger(tile.col)) {
    return null;
  }
  const { row, col } = tile;
  if (row === geo.HAND_ROW && col >= 0 && col < geo.HAND_SIZE) {
    return { area: 'hand', idx: col };
  }
  if (
    row === geo.TEMP_ROW &&
    col >= geo.TEMP_C0 &&
    col < geo.TEMP_C0 + geo.TEMP_SIZE
  ) {
    return { area: 'temp', idx: col - geo.TEMP_C0 };
  }
  const field = geo.FIELD;
  if (
    row >= field.r0 &&
    row <= field.r1 &&
    col >= field.c0 &&
    col <= field.c1
  ) {
    return { area: 'board', row, col };
  }
  return null;
}

/**
 * When the pointer grazes the thin hand band or lands on the temp row (between hand and field), remap to a hand
 * slot so board→bench drops stay reliable — master-like deploy feel. Col is clamped into the hand.
 */
export function snapHandSlot(
  tile: DragTile | null | undefined,
  geo: typeof GEO = GEO,
): PrepSlot | null {
  if (!tile || !Number.isInteger(tile.row) || !Number.isInteger(tile.col)) {
    return null;
  }
  const { row, col } = tile;
  // Temp row sits between hand and field; treating it as hand matches the near-edge drop intent.
  const nearHand =
    row === geo.TEMP_ROW ||
    row === geo.HAND_ROW ||
    // One row in front of the hand (toward camera / off the near edge) when pick undershoots the band.
    row === geo.HAND_ROW - 1;
  if (!nearHand) {
    return null;
  }
  const idx = Math.max(0, Math.min(geo.HAND_SIZE - 1, col));
  return { area: 'hand', idx };
}

export const sameSlot = (
  a: PrepSlot | PrepDropTarget | null | undefined,
  b: PrepSlot | PrepDropTarget | null | undefined,
): boolean => {
  if (!a || !b || a.area !== b.area) {
    return false;
  }
  if (a.area === 'board' && b.area === 'board') {
    return a.row === b.row && a.col === b.col;
  }
  if (a.area === 'hand' && b.area === 'hand') {
    return a.idx === b.idx;
  }
  if (a.area === 'temp' && b.area === 'temp') {
    return a.idx === b.idx;
  }
  return false;
};

export function isLegal(
  canPlace:
    | ((
        piece: PieceView,
        row: number,
        col: number,
        target: PrepSlot,
      ) => boolean)
    | null
    | undefined,
  piece: PieceView,
  slot: PrepSlot,
): boolean {
  if (slot.area === 'temp') {
    return false;
  }
  if (typeof canPlace !== 'function') {
    return true;
  }
  const row = slot.area === 'board' ? slot.row : GEO.HAND_ROW;
  const col = slot.area === 'board' ? slot.col : slot.idx;
  try {
    return canPlace(piece, row, col, slot) !== false;
  } catch {
    return false;
  }
}

/** What a release does after a prep drag. */
export function resolveDrop(input: {
  readonly piece: PieceView;
  readonly from: PrepSlot | null;
  readonly tile: DragTile | null;
  readonly overSurface: boolean;
  readonly clientX: number;
  readonly clientY: number;
  readonly canPlace?: (
    piece: PieceView,
    row: number,
    col: number,
    target: PrepSlot,
  ) => boolean;
  readonly geo?: typeof GEO;
}):
  | { readonly kind: 'drop'; readonly target: PrepDropTarget }
  | { readonly kind: 'cancel'; readonly reason: string } {
  const { piece, from, tile, overSurface, clientX, clientY } = input;
  if (!overSurface || !tile) {
    return {
      kind: 'drop',
      target: {
        area: 'outside',
        clientX: Number(clientX) || 0,
        clientY: Number(clientY) || 0,
      },
    };
  }
  const geo = input.geo ?? GEO;
  let slot = tileSlot(tile, geo);
  // Thin hand band / temp miss → hand row (board→bench reliability).
  if (!slot || slot.area === 'temp') {
    const snapped = snapHandSlot(tile, geo);
    if (snapped) {
      slot = snapped;
    }
  }
  if (!slot) {
    return { kind: 'cancel', reason: 'notTarget' };
  }
  if (slot.area === 'temp') {
    return { kind: 'cancel', reason: 'temp' };
  }
  if (sameSlot(slot, from) && slot.area !== 'board') {
    return { kind: 'cancel', reason: 'same' };
  }
  if (!isLegal(input.canPlace, piece, slot)) {
    return { kind: 'cancel', reason: 'illegal' };
  }
  return { kind: 'drop', target: slot };
}

export interface PrepDragPiece {
  readonly piece: PieceView;
  readonly from: PrepSlot;
}

export type PrepDragEvent =
  | {
      readonly type: 'click';
      readonly piece: PieceView;
      readonly from: PrepSlot;
      readonly detail: boolean;
    }
  | { readonly type: 'detail'; readonly piece: PieceView }
  | {
      readonly type: 'drop';
      readonly piece: PieceView;
      readonly from: PrepSlot;
      readonly target: PrepDropTarget;
    }
  | {
      readonly type: 'dragEnd';
      readonly piece: PieceView;
      readonly dropped: boolean;
    };

export interface PrepDragHooks {
  readonly hitPiece: (x: number, y: number) => PrepDragPiece | null;
  readonly pickTile: (x: number, y: number) => DragTile | null;
  readonly isOverSurface?: (clientX: number, clientY: number) => boolean;
  readonly canPlace?: (
    piece: PieceView,
    row: number,
    col: number,
    target: PrepSlot,
  ) => boolean;
  readonly emit: (event: PrepDragEvent) => void;
  readonly threshold?: number;
  readonly touchThreshold?: number;
  readonly longPressMs?: number;
}

/**
 * Autochess prep pointer controller: wraps the generic session with GEO slots and drop resolution.
 */
export function createPrepDrag(
  hooks: PrepDragHooks,
): PointerDragSession<PrepDragPiece> & {
  pointerDown: (point: PointerPoint) => boolean;
} {
  let canPlace = hooks.canPlace ?? null;

  const session = createPointerDragSession<PrepDragPiece>({
    hitSubject: hooks.hitPiece,
    pickTile: hooks.pickTile,
    ...(hooks.isOverSurface ? { isOverSurface: hooks.isOverSurface } : {}),
    canDrag: () => true,
    ...(hooks.threshold !== undefined ? { threshold: hooks.threshold } : {}),
    ...(hooks.touchThreshold !== undefined
      ? { touchThreshold: hooks.touchThreshold }
      : {}),
    ...(hooks.longPressMs !== undefined
      ? { longPressMs: hooks.longPressMs }
      : {}),
    emit(event: PointerDragEvent<PrepDragPiece>) {
      switch (event.type) {
        case 'subjectClick':
          if (!event.detail) {
            hooks.emit({
              type: 'click',
              piece: event.subject.piece,
              from: event.subject.from,
              detail: false,
            });
          }
          break;
        case 'subjectDetail':
          hooks.emit({ type: 'detail', piece: event.subject.piece });
          break;
        case 'dragEnd': {
          if (event.cancelled) {
            hooks.emit({
              type: 'dragEnd',
              piece: event.subject.piece,
              dropped: false,
            });
            break;
          }
          const resolved = resolveDrop({
            piece: event.subject.piece,
            from: event.subject.from,
            tile: event.tile,
            overSurface: event.overSurface,
            clientX: event.clientX,
            clientY: event.clientY,
            ...(canPlace ? { canPlace } : {}),
          });
          if (resolved.kind === 'drop') {
            hooks.emit({
              type: 'drop',
              piece: event.subject.piece,
              from: event.subject.from,
              target: resolved.target,
            });
            hooks.emit({
              type: 'dragEnd',
              piece: event.subject.piece,
              dropped: true,
            });
          } else {
            hooks.emit({
              type: 'dragEnd',
              piece: event.subject.piece,
              dropped: false,
            });
          }
          break;
        }
        default:
          break;
      }
    },
  });

  return Object.assign(session, {
    setCanPlace(
      fn:
        | ((
            piece: PieceView,
            row: number,
            col: number,
            target: PrepSlot,
          ) => boolean)
        | null,
    ) {
      canPlace = fn;
    },
  });
}
