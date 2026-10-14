import { useBoundKey } from '#infra/intent/keymap.js';
import { Hotkey } from '#ui/index.js';

/** The hint of the key bound to an action; nothing when the action has no key. */
export function BoundHotkey({ id }: { readonly id: string }) {
  const code = useBoundKey(id);
  return code ? <Hotkey code={code} /> : null;
}
