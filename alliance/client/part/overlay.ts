import { createStore } from 'zustand/vanilla';

export interface ConfirmOptions {
  readonly title: string;
  readonly body?: string;
  readonly confirm: string;
  /** Label of the cancel button; `null` for a notice with one button. */
  readonly cancel: string | null;
  readonly tone?: 'danger';
}

export interface ConfirmRequest extends ConfirmOptions {
  readonly id: number;
}

interface OverlayState {
  /** Pending confirmations, the first one showing. */
  readonly confirms: readonly ConfirmRequest[];
  /** Whether the in-match settings overlay is open. */
  readonly settings: boolean;
}

/** State of the shell's overlay layer that parts of any page can open. */
export const overlayStore = createStore<OverlayState>(() => ({
  confirms: [],
  settings: false,
}));

const answers = new Map<number, (ok: boolean) => void>();
let nextId = 0;

/** Asks the player through the shell's confirm dialog. Resolves with the answer. */
export function requestConfirm(options: ConfirmOptions): Promise<boolean> {
  nextId += 1;
  const request: ConfirmRequest = { ...options, id: nextId };
  overlayStore.setState((state) => ({
    confirms: [...state.confirms, request],
  }));
  return new Promise((resolve) => answers.set(request.id, resolve));
}

/** Closes a confirmation with the player's answer. */
export function answerConfirm(id: number, ok: boolean): void {
  overlayStore.setState((state) => ({
    confirms: state.confirms.filter((request) => request.id !== id),
  }));
  answers.get(id)?.(ok);
  answers.delete(id);
}

export function openSettings(open = true): void {
  overlayStore.setState({ settings: open });
}
