import { cx } from '#ui/base/class-name.js';
import styles from './spinner.module.css';

/** Something is loading. */
export function Spinner({ label }: { readonly label: string }) {
  return (
    <span role="status" aria-label={label} className={cx(styles.spinner)}>
      <span className={cx(styles.spinnerRing)} aria-hidden="true" />
    </span>
  );
}
