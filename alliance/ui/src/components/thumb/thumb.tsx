import type { CSSProperties } from 'react';
import { cx } from '#ui/base/class-name.js';
import styles from './thumb.module.css';

export interface ThumbProps {
  /** Reads out as the picture's name; its first two letters fill in for a missing picture. */
  readonly name: string;
  readonly src?: string | null;
  /** Color of the frame, any CSS color; the default border color without it. */
  readonly color?: string;
  /** A soft halo around the frame. */
  readonly glow?: boolean;
  readonly size?: 'sm' | 'md' | 'lg';
}

/** A small square picture in a colored frame; without a picture, the start of its name. */
export function Thumb({
  name,
  src,
  color,
  glow = false,
  size = 'md',
}: ThumbProps) {
  return (
    <span
      className={cx(styles.thumb)}
      data-size={size}
      data-glow={glow || undefined}
      style={
        color === undefined
          ? undefined
          : ({ '--thumb': color } as CSSProperties)
      }
      role="img"
      aria-label={name}
    >
      {src ? (
        <img src={src} alt="" loading="lazy" />
      ) : (
        <span aria-hidden="true">{[...name].slice(0, 2).join('')}</span>
      )}
    </span>
  );
}
