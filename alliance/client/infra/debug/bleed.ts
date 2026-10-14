/** Bleed visibility — draws live safe-area insets from viewportStore. */

import { type SafeInsets, viewportStore } from '#infra/theme/viewport.js';

export type ResolvedBleedInsets = SafeInsets;

let visible = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Show safe-area bleed guides from live viewportStore.safeInsets. */
export function showBleed(): void {
  visible = true;
  notify();
}

export function hideBleed(): void {
  if (!visible) {
    return;
  }
  visible = false;
  notify();
}

export function isBleedVisible(): boolean {
  return visible;
}

export function subscribeBleed(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Live safe-area insets the stage UI is using (viewportStore).
 * Zero on every edge when core:display.safeAreaUi is off.
 */
export function resolveBleedInsets(
  state: { readonly safeInsets: SafeInsets } = viewportStore.getState(),
): ResolvedBleedInsets {
  return state.safeInsets;
}

/** Test helper. */
export function resetBleed(): void {
  visible = false;
  notify();
}
