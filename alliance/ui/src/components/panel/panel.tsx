import { type ReactNode, useId } from 'react';
import { cx } from '#ui/base/class-name.js';
import type { ToneName } from '#ui/base/tone.js';
import { Text } from '#ui/components/text/text.js';
import styles from './panel.module.css';

export interface PanelProps {
  readonly title: string;
  readonly children: ReactNode;
  /** Heading level of the title. */
  readonly level?: 2 | 3;
  /** English label above the title. */
  readonly micro?: string;
  /** Color of the corner marks. */
  readonly tone?: ToneName;
  /** A soft halo and a tinted edge. */
  readonly glow?: boolean;
  /** No padding around the body, for content that carries its own. */
  readonly flush?: boolean;
  /** Controls at the end of the head. */
  readonly actions?: ReactNode;
}

/** A titled region with corner marks and a scan-line plate. */
export function Panel({
  title,
  children,
  level = 2,
  micro,
  tone = 'accent',
  glow = false,
  flush = false,
  actions,
}: PanelProps) {
  const id = useId();
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <section
      aria-labelledby={id}
      className={cx(styles.panel, 'wsde-brackets')}
      data-tone={tone}
      data-glow={glow || undefined}
    >
      <header className={cx(styles.head)}>
        <div className={cx(styles.titles)}>
          {micro ? <Text variant="micro">{micro}</Text> : null}
          <Heading id={id} className={cx(styles.title)}>
            {title}
          </Heading>
        </div>
        {actions ? <div className={cx(styles.actions)}>{actions}</div> : null}
      </header>
      <div className={cx(styles.body)} data-flush={flush || undefined}>
        {children}
      </div>
    </section>
  );
}
