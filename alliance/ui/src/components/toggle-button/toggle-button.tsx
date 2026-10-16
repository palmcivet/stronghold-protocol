import {
  ToggleButton as AriaToggleButton,
  type ToggleButtonProps as AriaToggleButtonProps,
} from 'react-aria-components';
import { Content, type LookProps, look } from '#ui/components/button/button.js';
import { useFeedback } from '#ui/components/feedback/feedback.js';

export interface ToggleButtonProps
  extends Omit<AriaToggleButtonProps, 'className' | 'children'>,
    LookProps {}

/** A button that stays pressed: the look of `Button`, selected instead of pending. */
export function ToggleButton({
  variant = 'secondary',
  size = 'md',
  icon,
  iconEnd,
  square = false,
  block = false,
  children,
  onChange,
  ...rest
}: ToggleButtonProps) {
  const play = useFeedback();
  return (
    <AriaToggleButton
      {...rest}
      {...look(variant, size, square, block)}
      onChange={(selected) => {
        play('ui.tab');
        onChange?.(selected);
      }}
    >
      <Content icon={icon} iconEnd={iconEnd}>
        {children}
      </Content>
    </AriaToggleButton>
  );
}
