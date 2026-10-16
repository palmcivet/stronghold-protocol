import type { ReactNode } from 'react';
import {
  Dialog as AriaDialog,
  Popover as AriaPopover,
  type PopoverProps as AriaPopoverProps,
  DialogTrigger,
} from 'react-aria-components';
import { cx } from '#ui/base/class-name.js';
import { PopupArrow } from '#ui/components/popup-arrow/popup-arrow.js';
import styles from './popover.module.css';

/**
 * Wraps a trigger button and a `Popover`: a press on the button opens it.
 * Give `isOpen` and `onOpenChange` to hold the state yourself.
 */
export const PopoverTrigger = DialogTrigger;

export interface PopoverProps
  extends Omit<AriaPopoverProps, 'className' | 'children'> {
  /** The content; a function receives `close`, which closes the popover. */
  readonly children: ReactNode | ((close: () => void) => ReactNode);
  /** Accessible name of the popover's dialog. */
  readonly label: string;
}

/** A floating panel anchored to its trigger, with an arrow. */
export function Popover({ children, label, ...rest }: PopoverProps) {
  return (
    <AriaPopover {...rest} className={cx(styles.popover)}>
      <PopupArrow />
      <AriaDialog aria-label={label} className={cx(styles.body)}>
        {typeof children === 'function'
          ? ({ close }) => children(close)
          : children}
      </AriaDialog>
    </AriaPopover>
  );
}
