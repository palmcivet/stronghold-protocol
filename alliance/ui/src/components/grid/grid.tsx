import type { CSSProperties } from 'react';
import { cx } from '#ui/base/class-name.js';
import { type BoxProps, gapStyle } from '#ui/components/stack/stack.js';
import styles from './grid.module.css';

/** Equal cells that fill the row, each at least `min` dp wide. */
export function Grid({
  children,
  as: Tag = 'div',
  gap,
  label,
  role,
  min = 192,
}: BoxProps & { readonly min?: number }) {
  return (
    <Tag
      className={cx(styles.grid)}
      style={gapStyle(gap, {
        '--min': `calc(var(--wsde-dp) * ${min})`,
      } as CSSProperties)}
      aria-label={label}
      role={role}
    >
      {children}
    </Tag>
  );
}
