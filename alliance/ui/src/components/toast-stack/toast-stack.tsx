import { cx } from '#ui/base/class-name.js';
import type { ToneName } from '#ui/base/tone.js';
import { Icon, type IconName } from '#ui/components/icon/icon.js';
import styles from './toast-stack.module.css';

export interface ToastItem {
  readonly id: string | number;
  readonly text: string;
  /** The bar and icon color. Neutral by default. */
  readonly tone?: ToneName;
  /** Times the same text came in a row. */
  readonly count?: number;
}

const ICON: Readonly<Record<ToneName, IconName>> = {
  accent: 'check',
  gold: 'star',
  amber: 'warning',
  orange: 'warning',
  danger: 'warning',
  ice: 'info',
  neutral: 'info',
};

/** The stack of toasts, centered at the top of the canvas. The host owns the queue. */
export function ToastStack({
  toasts,
  label,
}: {
  readonly toasts: readonly ToastItem[];
  readonly label: string;
}) {
  return (
    <div
      role="log"
      aria-live="assertive"
      aria-label={label}
      className={cx(styles.toasts)}
    >
      {toasts.map((toast) => {
        const tone = toast.tone ?? 'neutral';
        return (
          <p key={toast.id} className={cx(styles.toast)} data-tone={tone}>
            <Icon name={ICON[tone]} />
            {toast.text}
            {toast.count && toast.count > 1 ? (
              <span className={cx(styles.count)}>×{toast.count}</span>
            ) : null}
          </p>
        );
      })}
    </div>
  );
}
