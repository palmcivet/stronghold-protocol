import type { CSSProperties, ReactNode } from 'react';
import { cx } from '#infra/theme/class-name.js';
import styles from './game.module.css';

/** An operator's or item's tier, colored by `--wsde-color-tier-N`. */
export function TierChip({
  tier,
  label,
}: {
  readonly tier: number;
  readonly label?: string;
}) {
  return (
    <span
      role="img"
      className={cx(styles.tier)}
      style={{ '--tier': `var(--wsde-color-tier-${tier})` } as CSSProperties}
      aria-label={label}
    >
      {tier}
    </span>
  );
}

/** A price in the hexagon; dimmed when it cannot be paid. */
export function PriceHex({
  price,
  affordable = true,
  label,
}: {
  readonly price: number;
  readonly affordable?: boolean;
  readonly label?: string;
}) {
  return (
    <span
      role="img"
      className={cx(styles.price)}
      data-short={!affordable || undefined}
      aria-label={label}
    >
      {price}
    </span>
  );
}

/** A bond's disc: its short name and the count toward the next level. */
export function BondDisc({
  label,
  count,
  next,
  state,
}: {
  readonly label: string;
  readonly count: number;
  readonly next?: number;
  readonly state: 'off' | 'on' | 'max';
}) {
  return (
    <span className={cx(styles.bond)} data-state={state}>
      <span className={cx(styles.bondName)}>{label}</span>
      <span className={cx(styles.bondCount)}>
        {count}
        {next === undefined ? '' : `/${next}`}
      </span>
    </span>
  );
}

/** Life points as a column of segments; `max` sets the scale. */
export function LpTower({
  lp,
  max,
  label,
}: {
  readonly lp: number;
  readonly max: number;
  readonly label: string;
}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, lp / max)) : 0;
  return (
    <span
      role="img"
      aria-label={label}
      className={cx(styles.lp)}
      data-low={ratio <= 0.25 || undefined}
    >
      <span className={cx(styles.lpBar)}>
        <span
          className={cx(styles.lpFill)}
          style={{ height: `${ratio * 100}%` }}
        />
      </span>
      <span aria-hidden="true" className={cx(styles.lpValue)}>
        {lp}
      </span>
    </span>
  );
}

/** Digits in the seven-segment face of the clock. */
export function SevenSeg({
  value,
  warn = false,
  label,
}: {
  readonly value: string;
  readonly warn?: boolean;
  readonly label?: string;
}) {
  return (
    <span
      role="img"
      className={cx(styles.seg)}
      data-warn={warn || undefined}
      aria-label={label}
    >
      <span aria-hidden="true" className={cx(styles.segGhost)}>
        {value.replace(/\d/g, '8')}
      </span>
      <span className={cx(styles.segValue)}>{value}</span>
    </span>
  );
}

/** The phase capsule: its name and, in combat, a progress such as kills of total or the boss's health. */
export function PhaseCapsule({
  label,
  detail,
  progress,
  tone = 'prep',
}: {
  readonly label: string;
  readonly detail?: ReactNode;
  readonly progress?: number;
  readonly tone?: 'prep' | 'combat' | 'boss';
}) {
  return (
    <span className={cx(styles.capsule)} data-tone={tone}>
      <span>{label}</span>
      {detail === undefined ? null : (
        <span className={cx(styles.capsuleDetail)}>{detail}</span>
      )}
      {progress === undefined ? null : (
        <span className={cx(styles.capsuleTrack)} aria-hidden="true">
          <span
            className={cx(styles.capsuleFill)}
            style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
          />
        </span>
      )}
    </span>
  );
}

/** A difficulty's tag, colored by `--wsde-color-difficulty-<id>`. */
export function DifficultyTag({
  id,
  label,
}: {
  readonly id: string;
  readonly label: string;
}) {
  return (
    <span
      className={cx(styles.difficulty)}
      style={
        {
          '--difficulty': `var(--wsde-color-difficulty-${id}, var(--wsde-color-amber))`,
        } as CSSProperties
      }
    >
      {label}
    </span>
  );
}

/** A unit's portrait with its tier frame; without art, its name. */
export function UnitThumb({
  name,
  src,
  tier,
  elite = false,
  size = 'md',
}: {
  readonly name: string;
  readonly src?: string | null;
  readonly tier?: number;
  readonly elite?: boolean;
  readonly size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <span
      className={cx(styles.thumb)}
      data-size={size}
      data-elite={elite || undefined}
      style={
        tier === undefined
          ? undefined
          : ({ '--tier': `var(--wsde-color-tier-${tier})` } as CSSProperties)
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

/** An emote's picture; without art, its label. */
export function EmoteArt({
  label,
  src,
}: {
  readonly label: string;
  readonly src?: string | null;
}) {
  return (
    <span className={cx(styles.emote)} role="img" aria-label={label}>
      {src ? <img src={src} alt="" /> : <span aria-hidden="true">{label}</span>}
    </span>
  );
}
