import type { ReactNode } from 'react';
import { cx } from '#ui/base/class-name.js';
import { Icon, type IconName } from '#ui/components/icon/icon.js';
import styles from './notice.module.css';

export interface NoticeProps {
  readonly title: string;
  readonly children?: ReactNode;
  /** `empty` stands in for a list with nothing in it; `error` is a failure with what can be done about it. */
  readonly variant?: 'empty' | 'error';
  /** Icon above the title of an `empty` notice. */
  readonly icon?: IconName;
  /** Buttons of an `error` notice. */
  readonly actions?: ReactNode;
  /** Whether an `error` notice is announced as an alert; off when its container already is one. */
  readonly announce?: boolean;
}

/** A state of the page that is not the content: nothing to show, or something that failed. */
export function Notice({
  title,
  children,
  variant = 'empty',
  icon = 'info',
  actions,
  announce = true,
}: NoticeProps) {
  const error = variant === 'error';
  return (
    <div
      role={error && announce ? 'alert' : undefined}
      className={cx(styles.notice)}
      data-variant={variant}
    >
      {error ? null : <Icon name={icon} size="calc(var(--wsde-dp) * 24)" />}
      <strong>{title}</strong>
      {children}
      {error && actions ? (
        <div className={cx(styles.actions)}>{actions}</div>
      ) : null}
    </div>
  );
}
