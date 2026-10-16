import type { ReactNode } from 'react';
import {
  Tooltip as AriaTooltip,
  Focusable,
  TooltipTrigger,
} from 'react-aria-components';
import { cx } from '#ui/base/class-name.js';
import { PopupArrow } from '#ui/components/popup-arrow/popup-arrow.js';
import styles from './tooltip.module.css';

export interface TooltipProps {
  readonly tip: ReactNode;
  readonly children: ReactNode;
  /** Milliseconds from hover to the tip. */
  readonly delay?: number;
  /**
   * For children that are not controls: they are wrapped into one focusable image
   * that reads out this name. Without it the only child must be focusable itself.
   */
  readonly label?: string;
}

/** A tip shown on hover or focus of its child. */
export function Tooltip({ tip, children, delay = 400, label }: TooltipProps) {
  return (
    <TooltipTrigger delay={delay}>
      {label === undefined ? (
        children
      ) : (
        <Focusable>
          <span
            role="img"
            aria-label={label}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the tip has to be reachable from the keyboard
            tabIndex={0}
            className={cx(styles.display)}
          >
            {children}
          </span>
        </Focusable>
      )}
      <AriaTooltip className={cx(styles.tooltip)}>
        <PopupArrow />
        {tip}
      </AriaTooltip>
    </TooltipTrigger>
  );
}
