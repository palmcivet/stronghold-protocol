/**
 * Shop-bar → prep-stage drag. Pointer threshold matches the field session; buy+place intents live in `shop-place`.
 */
import { GEO } from '@alliance/contract/match.js';
import type { ShopSlot } from '@alliance/contract/server-message.js';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { IntentBus } from '#infra/intent/bus.js';
import { fieldContains, pickFieldTile } from '#match/field-hit.js';
import { buyAndPlace, type ShopDropTarget } from '#match/shop-place.js';

const THRESHOLD = 6;
const TOUCH_THRESHOLD = 10;

/** Classify a grid tile as a shop drop target (board / hand). Temp is rejected. */
function dropTargetOf(tile: {
  readonly row: number;
  readonly col: number;
}): ShopDropTarget | null {
  const { row, col } = tile;
  if (row === GEO.HAND_ROW && col >= 0 && col < GEO.HAND_SIZE) {
    return { area: 'hand', idx: col };
  }
  if (
    row === GEO.TEMP_ROW &&
    col >= GEO.TEMP_C0 &&
    col < GEO.TEMP_C0 + GEO.TEMP_SIZE
  ) {
    return null;
  }
  const field = GEO.FIELD;
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

interface DragState {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly slot: number;
  readonly card: ShopSlot;
  readonly sx: number;
  readonly sy: number;
  dragging: boolean;
}

/**
 * Pointer handlers for one shop card: click buys; drag onto the 3D prep stage buys then places / equips.
 */
export function createShopCardDrag(options: {
  readonly intents: IntentBus;
  readonly canAct: () => boolean;
  readonly affordable: () => boolean;
  readonly slot: number;
  readonly card: ShopSlot;
}): {
  readonly onPointerDown: (event: ReactPointerEvent) => void;
  readonly onPointerMove: (event: ReactPointerEvent) => void;
  readonly onPointerUp: (event: ReactPointerEvent) => void;
  readonly onPointerCancel: (event: ReactPointerEvent) => void;
} {
  let state: DragState | null = null;

  const clear = (): void => {
    state = null;
  };

  const finish = (event: ReactPointerEvent, cancelled: boolean): void => {
    const session = state;
    clear();
    if (!session || event.pointerId !== session.pointerId) {
      return;
    }
    if (!session.dragging) {
      if (!cancelled && options.canAct() && options.affordable()) {
        void options.intents.dispatch({
          type: 'g.buy',
          fields: { slot: session.slot },
        });
      }
      return;
    }
    if (cancelled || !options.canAct()) {
      return;
    }
    const over = fieldContains(event.clientX, event.clientY);
    const tile = over ? pickFieldTile(event.clientX, event.clientY) : null;
    const target = tile ? dropTargetOf(tile) : null;
    if (!target) {
      return;
    }
    void buyAndPlace(options.intents, session.slot, session.card, target);
  };

  return {
    onPointerDown(event) {
      if (
        state ||
        event.button !== 0 ||
        !options.canAct() ||
        !options.affordable()
      ) {
        return;
      }
      state = {
        pointerId: event.pointerId,
        pointerType: event.pointerType || 'mouse',
        slot: options.slot,
        card: options.card,
        sx: event.clientX,
        sy: event.clientY,
        dragging: false,
      };
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
    },
    onPointerMove(event) {
      if (!state || event.pointerId !== state.pointerId || state.dragging) {
        return;
      }
      const limit = state.pointerType === 'touch' ? TOUCH_THRESHOLD : THRESHOLD;
      if (
        Math.hypot(event.clientX - state.sx, event.clientY - state.sy) >= limit
      ) {
        state.dragging = true;
      }
    },
    onPointerUp(event) {
      finish(event, false);
    },
    onPointerCancel(event) {
      finish(event, true);
    },
  };
}
