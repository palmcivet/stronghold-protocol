import { PHASE } from '@alliance/contract/match.js';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { matchStore } from '#infra/store/match.js';
import { settingsStore } from '#infra/store/settings.js';
import type { Intent } from './bus.js';

/**
 * One bindable action. `keys` are `KeyboardEvent.code` values; a gamepad can
 * add its own codes (for example `Pad:A`) to the same table later.
 */
export interface KeyBinding {
  /** Action id, `<namespace>:<name>`; mods use their own namespace. */
  readonly id: string;
  /** Text key of the action's name in the settings page. */
  readonly label: `${string}:${string}`;
  /** Default keys. */
  readonly keys: readonly string[];
  /** The intent to send now, or null when the action does not apply. */
  readonly intent: () => Intent | null;
}

/** The keys a player changed, by action id; the rest keep their defaults. */
export type KeyOverrides = Readonly<Record<string, readonly string[]>>;

/** Adds an action to the table; returns the function that removes it. */
export function defineBinding(binding: KeyBinding): () => void {
  if (registry.getState().bindings.some((item) => item.id === binding.id)) {
    throw new Error(`the key action ${binding.id} is already defined`);
  }
  registry.setState(({ bindings }) => ({ bindings: [...bindings, binding] }));
  return () =>
    registry.setState(({ bindings }) => ({
      bindings: bindings.filter((item) => item !== binding),
    }));
}

/** Every defined action, in definition order. */
export function bindings(): readonly KeyBinding[] {
  return registry.getState().bindings;
}

/** The keys an action answers to, with the player's changes applied. */
export function keysOf(id: string, overrides: KeyOverrides): readonly string[] {
  return (
    overrides[id] ??
    registry.getState().bindings.find((item) => item.id === id)?.keys ??
    []
  );
}

/** The action a key triggers, if any; a changed key takes the key away from its default owner. */
export function actionFor(
  code: string,
  overrides: KeyOverrides,
): KeyBinding | null {
  return (
    registry
      .getState()
      .bindings.find((item) => keysOf(item.id, overrides).includes(code)) ??
    null
  );
}

/** Whether the key event comes from a field that takes text, where bindings must not fire. */
export function isTyping(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).closest !== 'function') {
    return false;
  }
  return (
    (target as HTMLElement).closest(
      'input, textarea, select, [contenteditable="true"]',
    ) !== null
  );
}

const preparing = (): boolean =>
  matchStore.getState().public?.phase === PHASE.PREP &&
  matchStore.getState().private !== null;

/** The core actions, with master's keys: R refresh, D level up, F freeze, Space ready. */
export const CORE_BINDINGS: readonly KeyBinding[] = [
  {
    id: 'core:refresh',
    label: 'core:profile.key.refresh',
    keys: ['KeyR'],
    intent: () => (preparing() ? { type: 'g.refresh' } : null),
  },
  {
    id: 'core:levelUp',
    label: 'core:profile.key.levelUp',
    keys: ['KeyD'],
    intent: () => (preparing() ? { type: 'g.levelUp' } : null),
  },
  {
    id: 'core:freeze',
    label: 'core:profile.key.freeze',
    keys: ['KeyF'],
    intent: () => (preparing() ? { type: 'g.freeze' } : null),
  },
  {
    id: 'core:ready',
    label: 'core:profile.key.ready',
    keys: ['Space'],
    intent: () => {
      const own = matchStore.getState().private;
      if (!preparing() || !own || (!own.canReady && !own.ready)) {
        return null;
      }
      return { type: 'g.ready', fields: { ready: !own.ready } };
    },
  },
];

/** The table of actions; it starts with the core ones. */
const registry = createStore<{ readonly bindings: readonly KeyBinding[] }>(
  () => ({ bindings: CORE_BINDINGS }),
);
export const keymapStore = registry;

/** The first key of an action, for a hotkey hint; follows the player's changes and later definitions. */
export function useBoundKey(id: string): string | null {
  const overrides = useStore(settingsStore, (state) => state.keymap);
  const binding = useStore(registry, (state) =>
    state.bindings.find((item) => item.id === id),
  );
  return (overrides[id] ?? binding?.keys ?? [])[0] ?? null;
}

/** Runs the action bound to a key event; true when one ran. */
export function runKey(
  event: KeyboardEvent,
  dispatch: (intent: Intent) => unknown,
): boolean {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }
  if (isTyping(event.target)) {
    return false;
  }
  const action = actionFor(event.code, settingsStore.getState().keymap);
  const intent = action?.intent() ?? null;
  if (!intent) {
    return false;
  }
  event.preventDefault();
  void dispatch(intent);
  return true;
}
