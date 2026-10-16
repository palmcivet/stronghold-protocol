import type { ReactNode } from 'react';
import { cx } from '#ui/base/class-name.js';
import type { ToneName } from '#ui/base/tone.js';
import { Icon, type IconName } from '#ui/components/icon/icon.js';
import styles from './hex-badge.module.css';

/** A hexagon that grows with its content, such as an amount. */
export function HexBadge({
  children,
  tone = 'gold',
  size = 'md',
  icon,
  label,
}: {
  readonly children: ReactNode;
  readonly tone?: ToneName;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly icon?: IconName;
  /** Reads the badge out as one image with this name, instead of its text. */
  readonly label?: string;
}) {
  return (
    <span
      className={cx(styles.hex)}
      data-tone={tone}
      data-size={size}
      {...(label === undefined ? {} : { role: 'img', 'aria-label': label })}
    >
      <span className={cx(styles.fill)}>
        {icon ? <Icon name={icon} /> : null}
        <span className={cx(styles.value)}>{children}</span>
      </span>
    </span>
  );
}
