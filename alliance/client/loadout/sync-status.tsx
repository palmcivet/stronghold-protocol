import { useStore } from 'zustand';
import { useMatch } from '#infra/store/hook.js';
import { useText } from '#infra/text/index.js';
import { Muted } from '#ui/index.js';
import { type SyncKind, syncStore, takesEffect } from './sync.js';

/** When a change of this setting takes effect, by the phase of the match on screen. */
export function TakesEffect({ kind }: { readonly kind: SyncKind }) {
  const t = useText();
  const phase = useMatch((state) => state.public?.phase ?? null);
  return (
    <Muted>
      {takesEffect(kind, phase) === 'thisMatch'
        ? t('core:loadout.effect.thisMatch')
        : t('core:loadout.effect.nextMatch')}
    </Muted>
  );
}

/** The sync line, as master's: saved, saved for the next match (locked), or not saved. */
export function SyncStatus({ kind }: { readonly kind: SyncKind }) {
  const t = useText();
  const state = useStore(syncStore, (all) => all[kind]);
  if (state === 'idle') {
    return null;
  }
  const text =
    state === 'sending' || state === 'pending'
      ? t('core:loadout.sending')
      : state === 'synced'
        ? t('core:loadout.saved')
        : state === 'locked'
          ? t(`core:loadout.locked.${kind}`)
          : t('core:loadout.notSaved');
  return <span role="status">{text}</span>;
}
