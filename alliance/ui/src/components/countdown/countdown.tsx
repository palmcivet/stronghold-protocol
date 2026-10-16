import { cx } from '#ui/base/class-name.js';
import styles from './countdown.module.css';

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
