import type { ReactNode } from 'react';
import { Switch as AriaSwitch } from 'react-aria-components';
import { cx } from '#ui/base/class-name.js';
import { useFeedback } from '#ui/components/feedback/feedback.js';
import styles from './switch.module.css';

/** An on / off setting. */
export function Switch({
  children,
  isSelected,
  onChange,
  isDisabled,
  onText,
  offText,
}: {
  readonly children: ReactNode;
  readonly isSelected: boolean;
  readonly onChange: (on: boolean) => void;
  readonly isDisabled?: boolean;
  /** Word shown beside the track while on, such as `On`. */
  readonly onText?: string;
  /** Word shown beside the track while off. */
  readonly offText?: string;
}) {
  const play = useFeedback();
  const state = isSelected ? onText : offText;
  return (
    <AriaSwitch
      isSelected={isSelected}
      onChange={(on) => {
        play('ui.tab');
        onChange(on);
      }}
      className={cx(styles.switch)}
      data-tone="accent"
      {...(isDisabled === undefined ? {} : { isDisabled })}
    >
      <span className={cx(styles.track)} aria-hidden="true">
        <span className={cx(styles.thumb)} />
      </span>
      {state === undefined ? null : (
        <span className={cx(styles.state)} aria-hidden="true">
          {state}
        </span>
      )}
      {children}
    </AriaSwitch>
  );
}
