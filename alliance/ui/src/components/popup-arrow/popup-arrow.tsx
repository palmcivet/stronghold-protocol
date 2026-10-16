import { OverlayArrow } from 'react-aria-components';
import { cx } from '#ui/base/class-name.js';
import styles from './popup-arrow.module.css';

/** The arrow of a popover or tooltip, pointing at its trigger. It takes `--wsde-arrow-fill` and `--wsde-arrow-stroke` from the popup. */
export function PopupArrow() {
  return (
    <OverlayArrow className={cx(styles.arrow)}>
      <svg viewBox="0 0 12 6" aria-hidden="true">
        <path d="M0 0L6 6L12 0" />
      </svg>
    </OverlayArrow>
  );
}
