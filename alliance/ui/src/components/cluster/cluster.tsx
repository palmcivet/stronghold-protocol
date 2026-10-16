import type { CSSProperties } from 'react';
import { cx } from '#ui/base/class-name.js';
import { type BoxProps, gapStyle } from '#ui/components/stack/stack.js';
import styles from './cluster.module.css';

/** Children in a wrapping row. */
export function Cluster({
  children,
  as: Tag = 'div',
  gap,
  label,
  role,
  align,
  justify,
}: BoxProps & {
  readonly align?: 'start' | 'center' | 'end' | 'baseline';
  readonly justify?: 'start' | 'center' | 'end' | 'between';
}) {
  const flex = (value: string | undefined) =>
    value === 'between'
      ? 'space-between'
      : value === 'start' || value === 'end'
        ? `flex-${value}`
        : value;
  return (
    <Tag
      className={cx(styles.cluster)}
      style={gapStyle(gap, {
        ...(align ? { '--align': flex(align) } : {}),
        ...(justify ? { '--justify': flex(justify) } : {}),
      } as CSSProperties)}
      aria-label={label}
      role={role}
    >
      {children}
    </Tag>
  );
}
