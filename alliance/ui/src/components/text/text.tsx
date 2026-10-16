import type { ReactNode } from 'react';
import { cx } from '#ui/base/class-name.js';
import type { ToneName } from '#ui/base/tone.js';
import styles from './text.module.css';

export interface TextProps {
  readonly children: ReactNode;
  /**
   * `micro` is a small uppercase English label in the display face, such as `MODE`;
   * `number` is a figure in the number font.
   */
  readonly variant?: 'body' | 'micro' | 'number';
  /** Reads as lower emphasis, a success or a failure. */
  readonly kind?: 'muted' | 'good' | 'bad';
  /** Colors the text by a tone; a `micro` label without one is dim, and `neutral` lifts it. */
  readonly tone?: ToneName;
}

/** Inline text: its face and its emphasis. */
export function Text({ children, variant = 'body', kind, tone }: TextProps) {
  return (
    <span
      className={cx(styles.text)}
      data-variant={variant === 'body' ? undefined : variant}
      data-kind={kind}
      data-tone={tone}
    >
      {children}
    </span>
  );
}
