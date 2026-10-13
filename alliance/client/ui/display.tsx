import type { ReactNode } from 'react';
import {
  ProgressBar as AriaProgressBar,
  Keyboard,
} from 'react-aria-components';
import { cx } from '../infra/theme/class-name.js';
import { Icon, type IconName } from './icon.js';
import styles from './widget.module.css';

/** A framed surface for one thing, such as a mode, a strategy or a player. */
export function Card({
  children,
  title,
  selected = false,
  muted = false,
  tone,
  as: Tag = 'article',
}: {
  readonly children?: ReactNode;
  readonly title?: ReactNode;
  readonly selected?: boolean;
  readonly muted?: boolean;
  readonly tone?: 'good' | 'bad' | 'gold';
  readonly as?: 'article' | 'li' | 'div';
}) {
  return (
    <Tag
      className={cx(styles.card)}
      data-selected={selected || undefined}
      data-muted={muted || undefined}
      data-tone={tone}
    >
      {title === undefined ? null : (
        <strong className={cx(styles.cardTitle)}>{title}</strong>
      )}
      {children}
    </Tag>
  );
}

/** How far a task is; without a value it is indeterminate. */
export function ProgressBar({
  label,
  value,
  max = 100,
  valueText,
  tone,
}: {
  readonly label: string;
  readonly value?: number;
  readonly max?: number;
  readonly valueText?: string;
  readonly tone?: 'danger' | 'gold';
}) {
  return (
    <AriaProgressBar
      aria-label={label}
      maxValue={max}
      isIndeterminate={value === undefined}
      className={cx(styles.progress)}
      {...(value === undefined ? {} : { value })}
      {...(valueText === undefined ? {} : { valueLabel: valueText })}
    >
      {({ percentage, valueText: text }) => (
        <>
          <span className={cx(styles.progressLabel)}>{label}</span>
          <span className={cx(styles.progressValue)}>{text}</span>
          <span className={cx(styles.progressTrack)}>
            <span
              className={cx(styles.progressFill)}
              data-tone={tone}
              style={{ width: `${percentage ?? 0}%` }}
            />
          </span>
        </>
      )}
    </AriaProgressBar>
  );
}

/** Something is loading. */
export function Spinner({ label }: { readonly label: string }) {
  return (
    <span role="status" aria-label={label} className={cx(styles.spinner)}>
      <span className={cx(styles.spinnerRing)} aria-hidden="true" />
    </span>
  );
}

/** Seconds left of a deadline, read out at most every ten seconds; warns under `warnAt`. */
export function Countdown({
  seconds,
  text,
  warnAt = 5,
}: {
  readonly seconds: number | null;
  /** How the seconds read, such as `12 s`. */
  readonly text: (seconds: number) => string;
  readonly warnAt?: number;
}) {
  if (seconds === null) {
    return null;
  }
  return (
    <span
      className={cx(styles.countdown)}
      data-warn={seconds <= warnAt || undefined}
      aria-live={seconds % 10 === 0 ? 'polite' : 'off'}
    >
      {text(seconds)}
    </span>
  );
}

/** A player's picture in a frame; without a picture, the name's first letter. */
export function Avatar({
  name,
  src,
  size = 'md',
  framed = false,
  off = false,
}: {
  readonly name: string;
  readonly src?: string | null;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly framed?: boolean;
  readonly off?: boolean;
}) {
  return (
    <span
      className={cx(styles.avatar)}
      data-size={size}
      data-framed={framed || undefined}
      data-off={off || undefined}
      role="img"
      aria-label={name}
    >
      {src ? (
        <img src={src} alt="" />
      ) : (
        <span aria-hidden="true">{[...name][0] ?? '?'}</span>
      )}
    </span>
  );
}

/** A short label, such as a state or a count. */
export function Badge({
  children,
  tone = 'neutral',
}: {
  readonly children: ReactNode;
  readonly tone?: 'neutral' | 'accent' | 'gold' | 'warn' | 'danger' | 'info';
}) {
  return (
    <span className={cx(styles.badge)} data-tone={tone}>
      {children}
    </span>
  );
}

/** A tag with an optional icon, such as a bond or a filter. */
export function Chip({
  children,
  icon,
  active = false,
}: {
  readonly children: ReactNode;
  readonly icon?: IconName;
  readonly active?: boolean;
}) {
  return (
    <span className={cx(styles.chip)} data-active={active || undefined}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </span>
  );
}

/** The key bound to an action, shown next to its control. */
export function Hotkey({ code }: { readonly code: string }) {
  const key = code.replace(/^Key|^Digit/, '');
  return (
    <Keyboard className={cx(styles.hotkey)} aria-hidden="true">
      {key}
    </Keyboard>
  );
}

/** Shown in place of a list with nothing in it. */
export function EmptyState({
  title,
  children,
  icon = 'info',
}: {
  readonly title: string;
  readonly children?: ReactNode;
  readonly icon?: IconName;
}) {
  return (
    <div className={cx(styles.empty)}>
      <Icon name={icon} size="1.5rem" />
      <strong>{title}</strong>
      {children}
    </div>
  );
}

/** A failure with what can be done about it. */
export function ErrorPanel({
  title,
  children,
  actions,
  announce = true,
}: {
  readonly title: string;
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
  /** Whether the panel is announced as an alert; off when its container already is one. */
  readonly announce?: boolean;
}) {
  return (
    <div
      role={announce ? 'alert' : undefined}
      className={cx(styles.errorPanel)}
    >
      <strong>{title}</strong>
      {children}
      {actions ? (
        <div className={cx(styles.dialogActions)}>{actions}</div>
      ) : null}
    </div>
  );
}
