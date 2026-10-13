import type { KeyAction } from '../store/settings.js';
import type { Intent } from './bus.js';

/** The intent of each bindable preparation action. */
export const KEY_INTENTS: Readonly<Record<KeyAction, Intent>> = {
  refresh: { type: 'g.refresh' },
  levelUp: { type: 'g.levelUp' },
  freeze: { type: 'g.freeze' },
};

/** The intent bound to a `KeyboardEvent.code`, if any. */
export function boundIntent(
  code: string,
  keys: Readonly<Record<KeyAction, string>>,
): Intent | null {
  for (const action of Object.keys(KEY_INTENTS) as KeyAction[]) {
    if (keys[action] === code) {
      return KEY_INTENTS[action];
    }
  }
  return null;
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
