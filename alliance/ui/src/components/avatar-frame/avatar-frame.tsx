import { type CSSProperties, useState } from 'react';
import { cx } from '#ui/base/class-name.js';
import type { ToneName } from '#ui/base/tone.js';
import { Icon, type IconName } from '#ui/components/icon/icon.js';
import styles from './avatar-frame.module.css';

/** A small mark on a corner of the frame. */
export interface AvatarMark {
  readonly icon: IconName;
  readonly tone?: ToneName;
}

export interface AvatarFrameProps {
  /** Reads out as the picture's name; its first letter fills in for a missing picture. */
  readonly name: string;
  readonly src?: string | null;
  readonly size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Hue in degrees that tints the plate behind a missing picture. */
  readonly hue?: number;
  /** Shown instead of the first letter when there is no picture. */
  readonly icon?: IconName;
  /** A mark on the top start corner. */
  readonly startMark?: AvatarMark;
  /** A mark on the top end corner. */
  readonly endMark?: AvatarMark;
  /** A short text on the bottom end corner. */
  readonly tag?: string;
  /** Framed in the accent tone, such as for the one whose turn it is or what is chosen. */
  readonly active?: boolean;
  /** Greyed out. */
  readonly dimmed?: boolean;
  /** An open slot: a dashed plate with a plus, and no marks. */
  readonly empty?: boolean;
  /** Overrides `name` as the accessible name. */
  readonly label?: string;
}

/** A square portrait frame with corner marks. */
export function AvatarFrame({
  name,
  src = null,
  size = 'md',
  hue = 162,
  icon,
  startMark,
  endMark,
  tag,
  active = false,
  dimmed = false,
  empty = false,
  label,
}: AvatarFrameProps) {
  // Remember which address failed, so a new one is tried again.
  const [failed, setFailed] = useState<string | null>(null);
  const shown = src && failed !== src ? src : null;
  return (
    <span
      className={cx(styles.frame, 'wsde-brackets')}
      data-size={size}
      data-tone={active ? 'accent' : 'neutral'}
      data-empty={empty || undefined}
      data-dimmed={dimmed || undefined}
      style={{ '--hue': hue } as CSSProperties}
      role="img"
      aria-label={label ?? name}
    >
      <span className={cx(styles.plate)}>
        {empty ? (
          <Icon name="plus" />
        ) : shown ? (
          <img src={shown} alt="" onError={() => setFailed(shown)} />
        ) : icon ? (
          <Icon name={icon} />
        ) : (
          <span className={cx(styles.glyph)} aria-hidden="true">
            {[...name.trim()][0] ?? '?'}
          </span>
        )}
      </span>
      {startMark && !empty ? (
        <span
          className={cx(styles.mark)}
          data-side="start"
          data-tone={startMark.tone ?? 'neutral'}
          aria-hidden="true"
        >
          <Icon name={startMark.icon} />
        </span>
      ) : null}
      {endMark && !empty ? (
        <span
          className={cx(styles.mark)}
          data-side="end"
          data-tone={endMark.tone ?? 'neutral'}
          aria-hidden="true"
        >
          <Icon name={endMark.icon} />
        </span>
      ) : null}
      {tag && !empty ? (
        <span className={cx(styles.tag)} aria-hidden="true">
          {tag}
        </span>
      ) : null}
    </span>
  );
}
