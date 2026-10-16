import type { CSSProperties, ReactNode } from 'react';
import { cx } from '#ui/base/class-name.js';
import type { ToneName } from '#ui/base/tone.js';
import { Icon, type IconName } from '#ui/components/icon/icon.js';
import styles from './badge.module.css';

export interface BadgeProps {
  readonly children: ReactNode;
  /** Color by a tone; `neutral` unless a `color` is given. */
  readonly tone?: ToneName;
  /** Color by any CSS color, such as `var(--wsde-color-tier-3)`; wins over `tone`. */
  readonly color?: string;
  /** `tag` is a small box, `pill` a rounded one, `square` a fixed square for one figure. */
  readonly shape?: 'tag' | 'pill' | 'square';
  readonly icon?: IconName;
  /** A soft halo around the badge. */
  readonly glow?: boolean;
  /** Reads the badge out as one image with this name, instead of its text. */
  readonly label?: string;
  /** Shown on hover as the browser's tooltip. */
  readonly title?: string;
}

/** A short label: a state, a count, a tier, a filter. */
export function Badge({
  children,
  tone,
  color,
  shape = 'tag',
  icon,
  glow = false,
  label,
  title,
}: BadgeProps) {
  return (
    <span
      className={cx(styles.badge)}
      data-tone={color === undefined ? (tone ?? 'neutral') : undefined}
      data-shape={shape}
      data-glow={glow || undefined}
      style={
        color === undefined
          ? undefined
          : ({ '--badge': color } as CSSProperties)
      }
      title={title}
      {...(label === undefined ? {} : { role: 'img', 'aria-label': label })}
    >
      {icon ? <Icon name={icon} /> : null}
      {children}
    </span>
  );
}
