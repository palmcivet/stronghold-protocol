import { useEffect, useState } from 'react';
import type { IntentBus } from '../infra/intent/bus.js';
import { errorText, useText } from '../infra/text/index.js';
import { cx } from '../infra/theme/class-name.js';
import styles from './shell.module.css';

const TOAST_MS = 3000;

interface Toast {
  readonly id: number;
  readonly text: string;
}

/** Shows the server's refusals of intents. */
export function Toasts({ intents }: { readonly intents: IntentBus }) {
  useText();
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  useEffect(() => {
    let id = 0;
    return intents.onOutcome((_intent, outcome) => {
      if (outcome.ok) {
        return;
      }
      id += 1;
      const toast = {
        id,
        text: errorText(
          outcome.error.code,
          outcome.error.serverText ?? undefined,
        ),
      };
      setToasts((current) => [...current.slice(-3), toast]);
      setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, TOAST_MS);
    });
  }, [intents]);
  return (
    <div role="log" aria-live="assertive" className={cx(styles.toasts)}>
      {toasts.map((toast) => (
        <p key={toast.id} className={cx(styles.toast)}>
          {toast.text}
        </p>
      ))}
    </div>
  );
}
