import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { useText } from '#infra/text/index.js';
import { DIALOG, openDialog } from '#part/dialog.js';
import { insertPart } from '#part/slot.js';
import { Button, ToggleButton } from '#ui/index.js';
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

/** The briefing's loadout button, as master's LoadoutButton from the briefing: it opens the loadout dialog. */
function BriefingLoadout() {
  const t = useText();
  return (
    <Button onPress={() => void openDialog(DIALOG.loadout)}>
      {t('core:room.loadout')}
    </Button>
  );
}

/** Registers the loadout toggle and panel into the room page slots, and the loadout dialog into the briefing. */
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
  const stopBriefing = insertPart({
    into: 'core:briefing.actions',
    id: 'core:loadout.briefing',
    order: 10,
    when: { capability: 'loadout', seat: 'player' },
    component: BriefingLoadout,
  });
  return () => {
    stopBriefing();
    stopToggle();
    stopPanel();
    openStore.setState({ open: false });
  };
}
