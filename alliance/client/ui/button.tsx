import type { ReactNode } from 'react';
import {
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
  ToggleButton as AriaToggleButton,
  type ToggleButtonProps as AriaToggleButtonProps,
} from 'react-aria-components';
import { cx } from '../infra/theme/class-name.js';
import { useFeedback } from './feedback.js';
import styles from './primitive.module.css';

export interface ButtonProps extends Omit<AriaButtonProps, 'className'> {
  readonly variant?: 'primary' | 'secondary';
  readonly children: ReactNode;
}

export function Button({
  variant = 'secondary',
  children,
  onPress,
  ...rest
}: ButtonProps) {
  const play = useFeedback();
  const className = cx(styles.button, variant === 'primary' && styles.primary);
  return (
    <AriaButton
      {...rest}
      onPress={(event) => {
        play('ui.click');
        onPress?.(event);
      }}
      className={className}
    >
      {children}
    </AriaButton>
  );
}

export interface ToggleButtonProps
  extends Omit<AriaToggleButtonProps, 'className'> {
  readonly children: ReactNode;
}

export function ToggleButton({
  children,
  onChange,
  ...rest
}: ToggleButtonProps) {
  const play = useFeedback();
  return (
    <AriaToggleButton
      {...rest}
      onChange={(selected) => {
        play('ui.tab');
        onChange?.(selected);
      }}
      className={cx(styles.button)}
    >
      {children}
    </AriaToggleButton>
  );
}
