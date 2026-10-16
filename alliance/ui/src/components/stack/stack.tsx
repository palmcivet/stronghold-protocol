import type { CSSProperties, ElementType, ReactNode } from 'react';
import { cx } from '#ui/base/class-name.js';
import styles from './stack.module.css';

/** A step of the spacing scale (`--wsde-space-N`). */
export type Space = 1 | 2 | 3 | 4 | 5 | 6 | 8;

export interface BoxProps {
  readonly children?: ReactNode;
  /** Element to render; a `div` by default. */
  readonly as?: ElementType;
  readonly gap?: Space;
  readonly label?: string;
  readonly role?: string;
}

export const gapStyle = (gap: Space | undefined, extra: CSSProperties = {}) =>
  ({
    ...(gap === undefined ? {} : { '--gap': `var(--wsde-space-${gap})` }),
    ...extra,
  }) as CSSProperties;

/** Children in a column. */
export function Stack({
  children,
  as: Tag = 'div',
  gap,
  label,
  role,
}: BoxProps) {
  return (
    <Tag
      className={cx(styles.stack)}
      style={gapStyle(gap)}
      aria-label={label}
      role={role}
    >
      {children}
    </Tag>
  );
}
