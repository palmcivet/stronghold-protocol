import { type ReactNode, useId } from 'react';
import { cx } from '#infra/theme/class-name.js';
import styles from './primitive.module.css';

export interface PanelProps {
  readonly title: string;
  readonly children: ReactNode;
  /** Heading level of the title. */
  readonly level?: 2 | 3;
}

/** A titled region. */
export function Panel({ title, children, level = 2 }: PanelProps) {
  const id = useId();
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <section aria-labelledby={id} className={cx(styles.panel)}>
      <Heading id={id} className={cx(styles.panelTitle)}>
        {title}
      </Heading>
      {children}
    </section>
  );
}
