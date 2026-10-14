import { PHASE } from '@alliance/contract/match.js';

/** Boss combat phases that carry overtime drain (master matchStatus.js). */
const BOSS_PHASES: ReadonlySet<string> = new Set([
  PHASE.FINAL_ASSAULT,
  PHASE.HIDDEN_CORE,
]);

/** Show the pending DOT this many seconds before drain even while the level clock still runs. */
export const OVERTIME_WARN_BEFORE = 30;

/** Team LP lost per real second of overtime (config.bossOvertimeDrainPerSec, default 1). */
export function overtimeDrainPerSec(rate: number | null | undefined): number {
  return typeof rate === 'number' && Number.isFinite(rate) && rate >= 0
    ? rate
    : 1;
}

export type OvertimeView =
  | { readonly state: 'pending'; readonly secs: number }
  | {
      readonly state: 'drain';
      readonly secs: number;
      readonly lost: number;
      readonly perSec: number;
    };

/**
 * What the red DOT warning shows at `now` (ms epoch), as master's overtimeState.
 * `perSec` is LP/s once drain starts.
 */
export function overtimeState(
  pub: {
    readonly phase: string;
    readonly overtimeAt?: number;
    readonly deadline?: number;
  } | null,
  now: number,
  {
    perSec = 1,
    warnBefore = OVERTIME_WARN_BEFORE,
  }: { readonly perSec?: number; readonly warnBefore?: number } = {},
): OvertimeView | null {
  if (!pub || !BOSS_PHASES.has(pub.phase) || !Number.isFinite(now)) {
    return null;
  }
  const at = Number(pub.overtimeAt);
  if (!(Number.isFinite(at) && at > 0)) {
    return null;
  }
  if (now < at) {
    const secs = Math.ceil((at - now) / 1000);
    const levelOver =
      Number.isFinite(pub.deadline) &&
      (pub.deadline as number) > 0 &&
      now >= (pub.deadline as number);
    if (!levelOver && secs > warnBefore) {
      return null;
    }
    return { state: 'pending', secs };
  }
  const secs = Math.floor((now - at) / 1000);
  const rate = overtimeDrainPerSec(perSec);
  return { state: 'drain', secs, lost: secs * rate, perSec: rate };
}
