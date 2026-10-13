import { useEffect, useState } from 'react';
import { useIntent } from '../infra/intent/context.js';
import { errorText, useText } from '../infra/text/index.js';
import { type ToastItem, ToastStack } from '../ui/index.js';

const TOAST_MS = 3000;
const TOAST_MAX = 4;

/** Shows the server's refusals of intents; the same text again counts up instead of stacking. */
export function Toasts() {
  const t = useText();
  const intents = useIntent();
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);
  useEffect(() => {
    let id = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const stop = intents.onOutcome((_intent, outcome) => {
      if (outcome.ok) {
        return;
      }
      const text = errorText(
        outcome.error.code,
        outcome.error.serverText ?? undefined,
      );
      id += 1;
      const key = id;
      setToasts((current) => {
        const same = current.find((toast) => toast.text === text);
        const rest = current.filter((toast) => toast !== same);
        return [
          ...rest.slice(-(TOAST_MAX - 1)),
          {
            id: key,
            text,
            tone: 'error',
            count: (same?.count ?? 1) + (same ? 1 : 0),
          },
        ];
      });
      const timer = setTimeout(() => {
        timers.delete(timer);
        setToasts((current) => current.filter((toast) => toast.id !== key));
      }, TOAST_MS);
      timers.add(timer);
    });
    return () => {
      stop();
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [intents]);
  return <ToastStack toasts={toasts} label={t('core:shell.toasts')} />;
}
