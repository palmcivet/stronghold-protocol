import { Badge, Text, type ToneName } from '@alliance/ui';

/** The color of a tier, `--wsde-color-tier-N`. */
export function tierColor(tier: number): string {
  return `var(--wsde-color-tier-${tier})`;
}

/** A unit's tier, a square in its color. */
export function TierBadge({
  tier,
  label,
}: {
  readonly tier: number;
  readonly label?: string;
}) {
  return (
    <Badge
      shape="square"
      color={tierColor(tier)}
      {...(label === undefined ? {} : { label })}
    >
      {tier}
    </Badge>
  );
}

/** A difficulty's name, colored by `--wsde-color-difficulty-<id>`. */
export function DifficultyBadge({
  difficulty,
  label,
}: {
  /** The difficulty's id, such as `HARD`. */
  readonly difficulty: string;
  readonly label: string;
}) {
  return (
    <Badge
      color={`var(--wsde-color-difficulty-${difficulty.toLowerCase()}, var(--wsde-tone-amber-base))`}
    >
      {label}
    </Badge>
  );
}

const BOND_COLOR = {
  off: 'var(--wsde-color-bond-off)',
  on: 'var(--wsde-color-bond-on)',
  max: 'var(--wsde-color-bond-max)',
} as const;

/** A bond's short name and the count toward its next level. */
export function BondBadge({
  label,
  count,
  next,
  state,
}: {
  readonly label: string;
  readonly count: number;
  readonly next?: number;
  readonly state: keyof typeof BOND_COLOR;
}) {
  return (
    <Badge shape="pill" color={BOND_COLOR[state]} glow={state === 'max'}>
      {label}
      <Text variant="number">
        {count}
        {next === undefined ? '' : `/${next}`}
      </Text>
    </Badge>
  );
}

/** Round trips under this read as a good link; under `FAIR_MS` as a fair one. */
const GOOD_MS = 60;

const FAIR_MS = 200;

/** How good a link with this round trip is, as the tone that colors it. */
export function pingTone(ms: number | null, online: boolean): ToneName {
  if (!online || ms === null) {
    return 'neutral';
  }
  return ms < GOOD_MS ? 'accent' : ms < FAIR_MS ? 'amber' : 'danger';
}

/** The link's round trip in milliseconds, colored by how good it is. */
export function PingBadge({
  ms,
  online,
  label,
  offlineText,
}: {
  /** Round trip time; `null` while there is no sample. */
  readonly ms: number | null;
  readonly online: boolean;
  /** The full sentence, shown on hover. */
  readonly label: string;
  /** Shown instead of the number when there is no link. */
  readonly offlineText: string;
}) {
  const live = online && ms !== null;
  return (
    <Badge shape="pill" icon="signal" tone={pingTone(ms, online)} title={label}>
      {live ? (
        <>
          <Text variant="number">{Math.min(9999, Math.round(ms))}</Text>ms
        </>
      ) : (
        offlineText
      )}
    </Badge>
  );
}
