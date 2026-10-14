import type { CSSProperties, ElementType, ReactNode } from 'react';
import { cx } from '#infra/theme/class-name.js';
import styles from './layout.module.css';

/** A step of the spacing scale (`--wsde-space-N`). */
export type Space = 1 | 2 | 3 | 4 | 6 | 8;

interface BoxProps {
  readonly children?: ReactNode;
  /** Element to render; a `div` by default. */
  readonly as?: ElementType;
  readonly gap?: Space;
  readonly label?: string;
  readonly role?: string;
}

const gapStyle = (gap: Space | undefined, extra: CSSProperties = {}) =>
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

/** Equal cells that fill the row, each at least `min` rem wide. */
export function Grid({
  children,
  as: Tag = 'div',
  gap,
  label,
  role,
  min = 12,
}: BoxProps & { readonly min?: number }) {
  return (
    <Tag
      className={cx(styles.grid)}
      style={gapStyle(gap, { '--min': `${min}rem` } as CSSProperties)}
      aria-label={label}
      role={role}
    >
      {children}
    </Tag>
  );
}

/** Columns that stack on a narrow screen, each at least `min` rem wide. */
export function Columns({
  children,
  as: Tag = 'div',
  gap,
  label,
  role,
  min = 16,
}: BoxProps & { readonly min?: number }) {
  return (
    <Tag
      className={cx(styles.columns)}
      style={gapStyle(gap, { '--min': `${min}rem` } as CSSProperties)}
      aria-label={label}
      role={role}
    >
      {children}
    </Tag>
  );
}

/** A page's column: the heading, the head's tools, and the body. */
export function Screen({
  title,
  tools,
  children,
}: {
  readonly title?: ReactNode;
  readonly tools?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className={cx(styles.screen)}>
      {title !== undefined || tools !== undefined ? (
        <div className={cx(styles.screenHead)}>
          {title === undefined ? (
            <span />
          ) : (
            <h1 className={cx(styles.heading)}>{title}</h1>
          )}
          {tools}
        </div>
      ) : null}
      {children}
    </div>
  );
}

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

/** One line of a list: label at the start, details at the end. */
export function Item({
  children,
  as: Tag = 'li',
}: {
  readonly children: ReactNode;
  readonly as?: ElementType;
}) {
  return <Tag className={cx(styles.item)}>{children}</Tag>;
}

/** Text of lower emphasis. */
export function Muted({ children }: { readonly children: ReactNode }) {
  return <span className={cx(styles.muted)}>{children}</span>;
}

/** A figure in the number font. */
export function Num({
  children,
  tone,
}: {
  readonly children: ReactNode;
  readonly tone?: 'good' | 'bad' | undefined;
}) {
  return (
    <span
      className={cx(
        styles.number,
        tone === 'good' && styles.good,
        tone === 'bad' && styles.bad,
      )}
    >
      {children}
    </span>
  );
}

/** Text that reads as a success or a failure. */
export function Tone({
  children,
  tone,
}: {
  readonly children: ReactNode;
  readonly tone: 'good' | 'bad';
}) {
  return (
    <span className={cx(tone === 'good' ? styles.good : styles.bad)}>
      {children}
    </span>
  );
}

/** A marked box that stands in for a part that is not built yet. */
export function Placeholder({
  id,
  children,
}: {
  readonly id: string;
  readonly children?: ReactNode;
}) {
  return (
    <div className={cx(styles.placeholder)} data-placeholder={id}>
      <code>{id}</code>
      {children}
    </div>
  );
}
