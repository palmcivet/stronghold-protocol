import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { useText } from '../infra/text/index.js';
import { insertPart } from '../part/slot.js';
import { ToggleButton } from '../ui/index.js';
import { LoadoutPanel } from './loadout.js';

/** Whether the loadout panel under the room is open. Local to this domain. */
const openStore = createStore<{ readonly open: boolean }>(() => ({
  open: false,
}));

function LoadoutToggle() {
  const t = useText();
  const open = useStore(openStore, (state) => state.open);
  return (
    <ToggleButton
      isSelected={open}
      onChange={(next) => openStore.setState({ open: next })}
    >
      {t('core:room.loadout')}
    </ToggleButton>
  );
}

function LoadoutBelow() {
  const open = useStore(openStore, (state) => state.open);
  if (!open) {
    return null;
  }
  return <LoadoutPanel />;
}

/** Registers the loadout toggle and panel into the room page slots. */
export function registerLoadoutParts(): () => void {
  const stopToggle = insertPart({
    into: 'core:room.actions',
    id: 'core:loadout.toggle',
    order: 50,
    when: { capability: 'loadout', seat: 'player' },
    component: LoadoutToggle,
  });
  const stopPanel = insertPart({
    into: 'core:room.below',
    id: 'core:loadout.panel',
    order: 0,
    when: { capability: 'loadout', seat: 'player' },
    component: LoadoutBelow,
  });
  return () => {
    stopToggle();
    stopPanel();
    openStore.setState({ open: false });
  };
}
