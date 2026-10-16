import { cx } from '#ui/base/class-name.js';
import styles from './seven-seg.module.css';

/** Digits in the seven-segment face of the clock. */
export function SevenSeg({
  value,
  warn = false,
  label,
}: {
  readonly value: string;
  readonly warn?: boolean;
  readonly label?: string;
}) {
  return (
    <span
      role="img"
      className={cx(styles.seg)}
      data-warn={warn || undefined}
      aria-label={label}
    >
      <span aria-hidden="true" className={cx(styles.segGhost)}>
        {value.replace(/\d/g, '8')}
      </span>
      <span className={cx(styles.segValue)}>{value}</span>
    </span>
  );
}
