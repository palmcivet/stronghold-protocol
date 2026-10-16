import { ProgressBar as AriaProgressBar } from 'react-aria-components';
import { cx } from '#ui/base/class-name.js';
import type { ToneName } from '#ui/base/tone.js';
import styles from './progress-bar.module.css';

/** How far a task is; without a value it is indeterminate. */
export function ProgressBar({
  label,
  value,
  max = 100,
  valueText,
  tone = 'accent',
}: {
  readonly label: string;
  readonly value?: number;
  readonly max?: number;
  readonly valueText?: string;
  readonly tone?: ToneName;
}) {
  return (
    <AriaProgressBar
      aria-label={label}
      maxValue={max}
      isIndeterminate={value === undefined}
      className={cx(styles.progress)}
      data-tone={tone}
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
              style={{ width: `${percentage ?? 0}%` }}
            />
          </span>
        </>
      )}
    </AriaProgressBar>
  );
}
