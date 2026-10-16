import type { ReactNode } from 'react';
import {
  Button as AriaButton,
  type ButtonProps as AriaButtonProps,
} from 'react-aria-components';
import { cx } from '#ui/base/class-name.js';
import type { ControlSize, ToneName } from '#ui/base/tone.js';
import { useFeedback } from '#ui/components/feedback/feedback.js';
import { Icon, type IconName } from '#ui/components/icon/icon.js';
import styles from './button.module.css';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'amber'
  | 'ice'
  | 'danger';

/** The tone whose colors a variant takes for its fill, hover and corner marks. */
const TONE: Readonly<Record<ButtonVariant, ToneName>> = {
  primary: 'accent',
  secondary: 'accent',
  ghost: 'accent',
  amber: 'amber',
  ice: 'ice',
  danger: 'danger',
};

export interface LookProps {
  readonly variant?: ButtonVariant;
  readonly size?: ControlSize;
  /** Icon before the label. */
  readonly icon?: IconName;
  /** Icon after the label. */
  readonly iconEnd?: IconName;
  /** A button as wide as it is tall, for an icon alone; it needs an `aria-label`. */
  readonly square?: boolean;
  /** Fills the width of its container. */
  readonly block?: boolean;
  readonly children?: ReactNode;
}

export interface ButtonProps
  extends Omit<AriaButtonProps, 'className' | 'children'>,
    LookProps {
  /** A request is in flight: presses are ignored, and after 250 ms a bar sweeps along the bottom edge. */
  readonly busy?: boolean;
}

export function Content({
  icon,
  iconEnd,
  children,
}: {
  readonly icon: IconName | undefined;
  readonly iconEnd: IconName | undefined;
  readonly children: ReactNode;
}) {
  return (
    <>
      {icon ? <Icon name={icon} /> : null}
      {children}
      {iconEnd ? <Icon name={iconEnd} /> : null}
    </>
  );
}

export function look(
  variant: ButtonVariant,
  size: ControlSize,
  square: boolean,
  block: boolean,
) {
  return {
    className: cx(styles.button, 'wsde-brackets'),
    'data-variant': variant,
    'data-size': size,
    'data-tone': TONE[variant],
    'data-square': square || undefined,
    'data-block': block || undefined,
  };
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconEnd,
  square = false,
  block = false,
  busy = false,
  children,
  onPress,
  ...rest
}: ButtonProps) {
  const play = useFeedback();
  return (
    <AriaButton
      {...rest}
      {...look(variant, size, square, block)}
      isPending={busy}
      onPress={(event) => {
        play('ui.click');
        onPress?.(event);
      }}
    >
      <Content icon={icon} iconEnd={iconEnd}>
        {children}
      </Content>
      {busy ? <span className={cx(styles.busy)} aria-hidden="true" /> : null}
    </AriaButton>
  );
}
