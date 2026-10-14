import { ITEM_SLOTS } from '@alliance/contract/match.js';
import type { PieceView } from '@alliance/contract/server-message.js';
import { createStore } from 'zustand/vanilla';
import type { IntentBus } from '#infra/intent/bus.js';
import { onMatchReset } from '#infra/store/frame.js';

/** An equip onto an operator whose slots are full: which item to replace. */
export interface EquipRequest {
  readonly itemUid: number;
  readonly targetUid: number;
  readonly items: readonly { readonly uid: number; readonly id: string }[];
}

/** The pending replacement, set when an item lands on a full operator. Shared by the field and the HUD. */
export const equipStore = createStore<{
  readonly request: EquipRequest | null;
}>(() => ({ request: null }));
onMatchReset(() => equipStore.setState({ request: null }));

/** Equips the item, or asks which item to replace when the target already holds {@link ITEM_SLOTS}. */
export async function equipItem(
  intents: IntentBus,
  itemUid: number,
  target: PieceView,
): Promise<void> {
  const items = target.items ?? [];
  if (items.length >= ITEM_SLOTS) {
    equipStore.setState({
      request: { itemUid, targetUid: target.uid, items },
    });
    return;
  }
  await intents.dispatch({
    type: 'g.equip',
    fields: { itemUid, targetUid: target.uid },
  });
}
