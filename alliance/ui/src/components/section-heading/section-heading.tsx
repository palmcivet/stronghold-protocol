import type { ReactNode } from 'react';
import { cx } from '#ui/base/class-name.js';
import { Text } from '#ui/components/text/text.js';
import styles from './section-heading.module.css';

/** A heading for a block of a page: a numbered tag, the title, and its English label. */
export function SectionHeading({
  index,
  title,
  micro,
  level = 3,
}: {
  /** The tag before the title, such as `01`. */
  readonly index?: string;
  readonly title: ReactNode;
  readonly micro?: string;
  readonly level?: 2 | 3 | 4;
}) {
  const Heading = level === 2 ? 'h2' : level === 3 ? 'h3' : 'h4';
  return (
    <div className={cx(styles.heading)}>
      {index === undefined ? null : (
        <span className={cx(styles.index)} aria-hidden="true">
          {index}
        </span>
      )}
      <Heading className={cx(styles.title)}>{title}</Heading>
      {micro ? <Text variant="micro">{micro}</Text> : null}
    </div>
  );
}
