import type { ReactNode } from 'react';
import { cx } from '#ui/base/class-name.js';
import type { ToneName } from '#ui/base/tone.js';
import styles from './capsule.module.css';

export interface CapsuleProps {
  readonly label: string;
  /** A figure beside the label, such as a time or a count. */
  readonly detail?: ReactNode;
  /** A fraction from 0 to 1, drawn as a thin bar. */
  readonly progress?: number;
  readonly tone?: ToneName;
}

/** A rounded capsule: a name, and optionally a figure and a progress bar. */
export function Capsule({
  label,
  detail,
  progress,
  tone = 'accent',
}: CapsuleProps) {
  return (
    <span className={cx(styles.capsule)} data-tone={tone}>
      <span>{label}</span>
      {detail === undefined ? null : (
        <span className={cx(styles.detail)}>{detail}</span>
      )}
      {progress === undefined ? null : (
        <span className={cx(styles.track)} aria-hidden="true">
          <span
            className={cx(styles.fill)}
            style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
          />
        </span>
      )}
    </span>
  );
}
