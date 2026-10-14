/**
 * Pointer press → click / long-press / drag session. Mode-agnostic: mainline stages and autochess prep both feed
 * hit-testing hooks and listen for subject / tile events. Drop legality and slot shapes stay in the caller.
 */

export interface PointerPoint {
  readonly pointerId: number;
  readonly pointerType?: string;
  readonly button?: number;
  /** Surface-local CSS px. */
  readonly x: number;
  readonly y: number;
  readonly clientX: number;
  readonly clientY: number;
}

export interface DragTile {
  readonly row: number;
  readonly col: number;
}

export type PointerDragEvent<TSubject> =
  | {
      readonly type: 'subjectHover';
      readonly subject: TSubject | null;
      readonly clientX?: number;
      readonly clientY?: number;
    }
  | { readonly type: 'tileHover'; readonly tile: DragTile | null }
  | {
      readonly type: 'subjectClick';
      readonly subject: TSubject;
      readonly button: number;
      readonly detail: boolean;
      readonly clientX: number;
      readonly clientY: number;
    }
  | {
      readonly type: 'subjectDetail';
      readonly subject: TSubject;
      readonly clientX: number;
      readonly clientY: number;
    }
  | { readonly type: 'dragStart'; readonly subject: TSubject }
  | {
      readonly type: 'dragMove';
      readonly subject: TSubject;
      readonly x: number;
      readonly y: number;
      readonly clientX: number;
      readonly clientY: number;
      readonly tile: DragTile | null;
      readonly overSurface: boolean;
    }
  | {
      readonly type: 'dragEnd';
      readonly subject: TSubject;
      readonly dropped: boolean;
      readonly cancelled: boolean;
      readonly tile: DragTile | null;
      readonly overSurface: boolean;
      readonly clientX: number;
      readonly clientY: number;
    };

export interface PointerDragHooks<TSubject> {
  readonly hitSubject: (x: number, y: number) => TSubject | null;
  readonly pickTile: (x: number, y: number) => DragTile | null;
  readonly isOverSurface?: (clientX: number, clientY: number) => boolean;
  readonly canDrag?: (subject: TSubject) => boolean;
  readonly emit: (event: PointerDragEvent<TSubject>) => void;
  readonly threshold?: number;
  readonly touchThreshold?: number;
  readonly longPressMs?: number;
  readonly setTimeout?: typeof setTimeout;
  readonly clearTimeout?: typeof clearTimeout;
}

const DEFAULTS = {
  threshold: 6,
  touchThreshold: 10,
  longPressMs: 480,
} as const;

type Mode = 'pressed' | 'dragging' | 'held';

interface Session<TSubject> {
  mode: Mode;
  pointerId: number;
  pointerType: string;
  subject: TSubject;
  sx: number;
  sy: number;
  cx: number;
  cy: number;
  timer: ReturnType<typeof setTimeout> | null;
}

/** Threshold / long-press / drag state machine. One pointer at a time. */
export function createPointerDragSession<TSubject>(
  hooks: PointerDragHooks<TSubject>,
) {
  const threshold = hooks.threshold ?? DEFAULTS.threshold;
  const touchThreshold = hooks.touchThreshold ?? DEFAULTS.touchThreshold;
  const longPressMs = hooks.longPressMs ?? DEFAULTS.longPressMs;
  type Timer = ReturnType<typeof setTimeout>;
  const setT = (fn: () => void, ms: number): Timer =>
    (hooks.setTimeout ?? setTimeout)(fn, ms) as Timer;
  const clearT = (id: Timer): void => {
    (hooks.clearTimeout ?? clearTimeout)(id);
  };
  let editable = false;
  let st: Session<TSubject> | null = null;
  let hoverKey: TSubject | null | undefined;
  let hoverTileKey = '';

  const emit = (event: PointerDragEvent<TSubject>): void => {
    try {
      hooks.emit(event);
    } catch (error) {
      console.error('[pointer-drag] listener failed', error);
    }
  };

  const overSurface = (cx: number, cy: number): boolean => {
    try {
      return hooks.isOverSurface ? hooks.isOverSurface(cx, cy) !== false : true;
    } catch {
      return true;
    }
  };

  const tileAt = (x: number, y: number): DragTile | null => {
    try {
      return hooks.pickTile(x, y);
    } catch {
      return null;
    }
  };

  const subjectAt = (x: number, y: number): TSubject | null => {
    try {
      return hooks.hitSubject(x, y);
    } catch {
      return null;
    }
  };

  const setHoverTile = (tile: DragTile | null): void => {
    const key = tile ? `${tile.row},${tile.col}` : '';
    if (key === hoverTileKey) {
      return;
    }
    hoverTileKey = key;
    emit({ type: 'tileHover', tile });
  };

  const setHoverSubject = (
    subject: TSubject | null,
    point: { clientX?: number; clientY?: number },
  ): void => {
    if (subject === hoverKey) {
      return;
    }
    hoverKey = subject;
    emit({
      type: 'subjectHover',
      subject,
      ...(point.clientX !== undefined ? { clientX: point.clientX } : {}),
      ...(point.clientY !== undefined ? { clientY: point.clientY } : {}),
    });
  };

  const clearTimer = (): void => {
    if (st?.timer != null) {
      clearT(st.timer);
      st.timer = null;
    }
  };

  const startDrag = (point: PointerPoint): void => {
    if (!st) {
      return;
    }
    clearTimer();
    st.mode = 'dragging';
    setHoverSubject(null, point);
    emit({ type: 'dragStart', subject: st.subject });
    moveDrag(point);
  };

  const moveDrag = (point: PointerPoint): void => {
    if (!st) {
      return;
    }
    const tile = tileAt(point.x, point.y);
    const over = overSurface(point.clientX, point.clientY);
    setHoverTile(over ? tile : null);
    emit({
      type: 'dragMove',
      subject: st.subject,
      x: point.x,
      y: point.y,
      clientX: point.clientX,
      clientY: point.clientY,
      tile: over ? tile : null,
      overSurface: over,
    });
  };

  const endDrag = (point: PointerPoint | null, cancelled: boolean): void => {
    const session = st;
    st = null;
    if (!session) {
      return;
    }
    const tile = point && !cancelled ? tileAt(point.x, point.y) : null;
    const over =
      point && !cancelled ? overSurface(point.clientX, point.clientY) : false;
    let dropped = false;
    if (!cancelled && point) {
      dropped = true;
    }
    emit({
      type: 'dragEnd',
      subject: session.subject,
      dropped: dropped && !cancelled,
      cancelled: cancelled || !dropped,
      tile: over ? tile : null,
      overSurface: over,
      clientX: point?.clientX ?? session.cx,
      clientY: point?.clientY ?? session.cy,
    });
  };

  return {
    get editable() {
      return editable;
    },
    get dragging() {
      return !!st && st.mode === 'dragging';
    },
    get dragSubject() {
      return st && st.mode === 'dragging' ? st.subject : null;
    },

    setEditable(value: boolean): void {
      editable = value;
      if (!editable && st?.mode === 'dragging') {
        endDrag(null, true);
      }
    },

    pointerDown(point: PointerPoint): boolean {
      if (st) {
        return false;
      }
      const subject = subjectAt(point.x, point.y);
      if (!subject) {
        setHoverTile(tileAt(point.x, point.y));
        return false;
      }
      if (point.button === 2) {
        emit({
          type: 'subjectClick',
          subject,
          button: 2,
          detail: true,
          clientX: point.clientX,
          clientY: point.clientY,
        });
        emit({
          type: 'subjectDetail',
          subject,
          clientX: point.clientX,
          clientY: point.clientY,
        });
        return true;
      }
      if (point.button != null && point.button !== 0) {
        return false;
      }
      st = {
        mode: 'pressed',
        pointerId: point.pointerId,
        pointerType: point.pointerType || 'mouse',
        subject,
        sx: point.x,
        sy: point.y,
        cx: point.clientX,
        cy: point.clientY,
        timer: null,
      };
      if (st.pointerType === 'touch' || st.pointerType === 'pen') {
        const snapshot = st;
        st.timer = setT(() => {
          if (st !== snapshot || st.mode !== 'pressed') {
            return;
          }
          st.timer = null;
          st.mode = 'held';
          emit({
            type: 'subjectClick',
            subject,
            button: 0,
            detail: true,
            clientX: snapshot.cx,
            clientY: snapshot.cy,
          });
          emit({
            type: 'subjectDetail',
            subject,
            clientX: snapshot.cx,
            clientY: snapshot.cy,
          });
        }, longPressMs);
      }
      return true;
    },

    pointerMove(point: PointerPoint): void {
      if (!st) {
        if (point.pointerType === 'touch') {
          return;
        }
        setHoverSubject(subjectAt(point.x, point.y), point);
        setHoverTile(tileAt(point.x, point.y));
        return;
      }
      if (point.pointerId !== st.pointerId) {
        return;
      }
      if (st.mode === 'pressed') {
        const limit = st.pointerType === 'touch' ? touchThreshold : threshold;
        if (Math.hypot(point.x - st.sx, point.y - st.sy) >= limit) {
          const allow =
            editable &&
            (hooks.canDrag ? hooks.canDrag(st.subject) !== false : true);
          if (allow) {
            startDrag(point);
          } else {
            clearTimer();
            st.mode = 'held';
          }
        }
      } else if (st.mode === 'dragging') {
        moveDrag(point);
      }
    },

    pointerUp(point: PointerPoint): void {
      if (!st || point.pointerId !== st.pointerId) {
        return;
      }
      if (st.mode === 'dragging') {
        endDrag(point, false);
        return;
      }
      const session = st;
      clearTimer();
      st = null;
      if (session.mode === 'pressed') {
        emit({
          type: 'subjectClick',
          subject: session.subject,
          button: 0,
          detail: false,
          clientX: point.clientX,
          clientY: point.clientY,
        });
      }
    },

    pointerCancel(point?: PointerPoint): void {
      if (!st || (point && point.pointerId !== st.pointerId)) {
        return;
      }
      if (st.mode === 'dragging') {
        endDrag(point ?? null, true);
        return;
      }
      clearTimer();
      st = null;
    },

    pointerLeave(point?: { clientX?: number; clientY?: number }): void {
      if (st) {
        return;
      }
      setHoverSubject(null, point ?? {});
      setHoverTile(null);
    },

    reset(): void {
      if (st?.mode === 'dragging') {
        endDrag(null, true);
      } else {
        clearTimer();
        st = null;
      }
      hoverKey = undefined;
      hoverTileKey = '';
    },
  };
}

export type PointerDragSession<TSubject> = ReturnType<
  typeof createPointerDragSession<TSubject>
>;
