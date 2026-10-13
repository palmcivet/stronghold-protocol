import {
  EMOTE_BUBBLE_MS,
  EMOTE_CATALOG,
  EMOTE_COOLDOWN_MS,
} from '@alliance/contract/match.js';
import { useEffect, useState } from 'react';
import { useIntent } from '../../infra/intent/context.js';
import { useMatch } from '../../infra/store/hook.js';
import { lookup, useText } from '../../infra/text/index.js';
import { cx } from '../../infra/theme/class-name.js';
import { ActionMenu, Panel } from '../../ui/index.js';
import styles from './panel.module.css';

/** Name of an official emote: its data text, or the official label. */
export function emoteName(id: string): string {
  const key = `data:emote.${id}.name`;
  const text = lookup(key);
  return text === key
    ? (EMOTE_CATALOG.find((entry) => entry.id === id)?.label ?? id)
    : text;
}

/** Ticks while emotes are on screen, so a bubble goes when its time is up. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** The emote wheel: the official emotes, one per cooldown, and the emotes on screen. */
export function Emotes({ canSend }: { readonly canSend: boolean }) {
  const t = useText();
  const intents = useIntent();
  const { emotes, players } = useMatch((state) => ({
    emotes: state.emotes,
    players: state.public?.players ?? [],
  }));
  const [coolUntil, setCoolUntil] = useState(0);
  const now = useNow(emotes.length > 0 || coolUntil > 0);
  const cooling = now < coolUntil;
  const shown = emotes.filter((line) => now - line.at < EMOTE_BUBBLE_MS);
  const nameOf = (playerId: string): string =>
    players.find((player) => player.playerId === playerId)?.name ?? playerId;
  const send = (id: string): void => {
    setCoolUntil(Date.now() + EMOTE_COOLDOWN_MS);
    void intents.dispatch({ type: 'g.emote', fields: { id } });
  };
  return (
    <Panel title={t('core:emote.heading')} level={3}>
      <ActionMenu
        label={t('core:emote.open')}
        items={EMOTE_CATALOG.map((entry) => ({
          id: entry.id,
          label: emoteName(entry.id),
        }))}
        onAction={send}
        isDisabled={!canSend || cooling}
      />
      <ol role="log" aria-live="polite" className={cx(styles.ticker)}>
        {shown.map((line) => (
          <li key={line.seq}>
            {t('core:emote.line', {
              name: nameOf(line.playerId),
              emote: emoteName(line.id),
            })}
          </li>
        ))}
      </ol>
    </Panel>
  );
}
