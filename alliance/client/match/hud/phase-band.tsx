import { cx, Text, type ToneName } from '@alliance/ui';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import styles from './phase-band.module.css';

/** How long the closing animation runs before the band is gone. */
const LEAVE_MS = 260;

/** A row of arrow heads; a pulse runs through them in the direction they point. */
function Arrows({
  direction,
  count = 4,
}: {
  readonly direction: 'left' | 'right';
  readonly count?: number;
}) {
  return (
    <span
      className={cx(styles.arrows)}
      data-direction={direction}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: the heads are identical and never reorder
          key={index}
          style={
            {
              '--step': direction === 'left' ? count - 1 - index : index,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

/** A full-width band that opens for a moment: a micro label, a large title and a subtitle between two rows of arrows. */
export function PhaseBand({
  title,
  sub,
  micro,
  tone = 'accent',
  duration = 0,
  onDone,
}: {
  readonly title: string;
  readonly sub?: string;
  /** English label above the title. */
  readonly micro?: string;
  readonly tone?: ToneName;
  /** Milliseconds it stays before it closes; 0 keeps it. Give it a new `key` to replay. */
  readonly duration?: number;
  /** Called once the band has closed. */
  readonly onDone?: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (duration <= 0) {
      return;
    }
    const leave = setTimeout(() => setLeaving(true), duration);
    const close = setTimeout(() => {
      setGone(true);
      done.current?.();
    }, duration + LEAVE_MS);
    return () => {
      clearTimeout(leave);
      clearTimeout(close);
    };
  }, [duration]);
  if (gone) {
    return null;
  }
  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(styles.banner)}
      data-tone={tone}
      data-leaving={leaving || undefined}
    >
      <div className={cx(styles.band)}>
        <Arrows direction="right" />
        <div className={cx(styles.text)}>
          {micro ? (
            <Text variant="micro" tone={tone}>
              {micro}
            </Text>
          ) : null}
          <strong className={cx(styles.title)}>{title}</strong>
          {sub ? <span className={cx(styles.sub)}>{sub}</span> : null}
        </div>
        <Arrows direction="left" />
      </div>
    </div>
  );
}
