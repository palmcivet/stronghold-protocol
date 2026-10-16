import type { ReactNode } from 'react';
import { cx } from '#ui/base/class-name.js';
import styles from './region.module.css';

/** A named area of a layout part; the layout's own style places it by `data-region`. */
export function Region({
  name,
  children,
  className,
  label,
}: {
  readonly name: string;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly label?: string;
}) {
  if (label === undefined) {
    return (
      <div className={cx(styles.region, className)} data-region={name}>
        {children}
      </div>
    );
  }
  return (
    <section
      className={cx(styles.region, className)}
      data-region={name}
      aria-label={label}
    >
      {children}
    </section>
  );
}
