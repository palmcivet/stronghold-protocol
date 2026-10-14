import { createStore } from 'zustand/vanilla';
import type { RouteMenu } from '#infra/router/menu.js';

/** Ids of the core dialogs. Each dialog's content is the part of the same id, so mods replace or wrap it there. */
export const DIALOG = {
  profile: 'core:dialog.profile',
  loadout: 'core:dialog.loadout',
  guide: 'core:dialog.guide',
} as const;

/** One dialog: its title, its place in the menu entry, and the module its parts come from when it is not in the first download. */
export interface DialogDefinition {
  readonly id: string;
  readonly title: `${string}:${string}`;
  readonly menu?: RouteMenu;
  readonly load?: () => Promise<void>;
  /** The frame, as master's: `panel` a centred column (settings), `wide` a large card (the guide), `full` the screen (the loadout). Default `panel`. */
  readonly size?: DialogSize;
}

export type DialogSize = 'panel' | 'wide' | 'full';

interface DialogState {
  readonly dialogs: readonly DialogDefinition[];
  /** The dialog showing, or null. Dialogs never change the address. */
  readonly open: string | null;
}

export const dialogStore = createStore<DialogState>(() => ({
  dialogs: [],
  open: null,
}));

/** Adds a dialog; a mod adds its own under its id. Returns its removal. */
export function defineDialog(definition: DialogDefinition): () => void {
  if (
    dialogStore.getState().dialogs.some((item) => item.id === definition.id)
  ) {
    throw new Error(`dialog ${definition.id} is already defined`);
  }
  dialogStore.setState(({ dialogs }) => ({
    dialogs: [...dialogs, definition],
  }));
  return () =>
    dialogStore.setState(({ dialogs, open }) => ({
      dialogs: dialogs.filter((item) => item !== definition),
      open: open === definition.id ? null : open,
    }));
}

export function dialogOf(id: string): DialogDefinition | undefined {
  return dialogStore.getState().dialogs.find((item) => item.id === id);
}

/** The shell overlay's open-dialog intent: loads the dialog's parts, then shows it. False for an unknown id. */
export async function openDialog(id: string): Promise<boolean> {
  const definition = dialogOf(id);
  if (!definition) {
    return false;
  }
  await definition.load?.();
  dialogStore.setState({ open: id });
  return true;
}

/** Closes the dialog showing; a host's back button calls it too. True when one was open. */
export function closeDialog(): boolean {
  if (dialogStore.getState().open === null) {
    return false;
  }
  dialogStore.setState({ open: null });
  return true;
}

/** Keys that mean "back": Escape, and the browser and Android back keys. */
export const BACK_KEYS: readonly string[] = ['Escape', 'GoBack', 'BrowserBack'];
