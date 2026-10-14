import { EMOTE_CATALOG, EMOTE_COOLDOWN_MS } from '@alliance/contract/match.js';
import { useEffect, useState } from 'react';
import { useIntent } from '#infra/intent/context.js';
import { useMatch } from '#infra/store/hook.js';
import { lookup, useText } from '#infra/text/index.js';
import { ActionMenu } from '#ui/index.js';

/** Name of an official emote: its data text, or the official label. */
export function emoteName(id: string): string {
  const key = `data:emote.${id}.name`;
  const text = lookup(key);
  return text === key
    ? (EMOTE_CATALOG.find((entry) => entry.id === id)?.label ?? id)
    : text;
}

/** The emote wheel: the official emotes, one per cooldown. The bubbles show on the team rows. */
export function EmoteWheel() {
  const t = useText();
  const intents = useIntent();
  const own = useMatch((state) => state.private !== null);
  const [coolUntil, setCoolUntil] = useState(0);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (coolUntil === 0) {
      return;
    }
    const timer = setTimeout(
      () => setTick((tick) => tick + 1),
      Math.max(0, coolUntil - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [coolUntil]);
  if (!own) {
    return null;
  }
  return (
    <ActionMenu
      label={t('core:emote.open')}
      items={EMOTE_CATALOG.map((entry) => ({
        id: entry.id,
        label: emoteName(entry.id),
      }))}
      onAction={(id) => {
        setCoolUntil(Date.now() + EMOTE_COOLDOWN_MS);
        void intents.dispatch({ type: 'g.emote', fields: { id } });
      }}
      isDisabled={Date.now() < coolUntil}
    />
  );
}
