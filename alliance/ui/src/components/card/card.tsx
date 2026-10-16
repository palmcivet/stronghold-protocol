import type { ReactNode } from 'react';
import { cx } from '#ui/base/class-name.js';
import type { ToneName } from '#ui/base/tone.js';
import styles from './card.module.css';

/** A framed surface for one thing, such as a mode, a strategy or a player. */
export function Card({
  children,
  title,
  selected = false,
  muted = false,
  tone,
  layout = 'column',
  as: Tag = 'article',
}: {
  readonly children?: ReactNode;
  readonly title?: ReactNode;
  readonly selected?: boolean;
  readonly muted?: boolean;
  /** Draws a bar of this tone along the top edge. */
  readonly tone?: ToneName;
  /** `row` lays the content out as one line: first part at the start, the rest at the end. */
  readonly layout?: 'column' | 'row';
  readonly as?: 'article' | 'li' | 'div';
}) {
  return (
    <Tag
      className={cx(styles.card)}
      data-selected={selected || undefined}
      data-muted={muted || undefined}
      data-tone={tone}
      data-layout={layout === 'row' ? 'row' : undefined}
    >
      {title === undefined ? null : (
        <strong className={cx(styles.cardTitle)}>{title}</strong>
      )}
      {children}
    </Tag>
  );
}
