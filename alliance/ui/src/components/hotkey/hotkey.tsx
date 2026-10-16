import { Keyboard } from 'react-aria-components';
import { cx } from '#ui/base/class-name.js';
import styles from './hotkey.module.css';

/** The key bound to an action, shown next to its control. */
export function Hotkey({ code }: { readonly code: string }) {
  const key = code.replace(/^Key|^Digit/, '');
  return (
    <Keyboard className={cx(styles.hotkey)} aria-hidden="true">
      {key}
    </Keyboard>
  );
}
