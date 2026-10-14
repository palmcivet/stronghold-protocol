import type { Battle } from 'arknights-mission-core';

/** Fields of a `b.progress` frame beside `battleId`, from the engine ledger. */
export interface UpstreamBattleProgress {
  readonly gt: number;
  readonly killed: number;
  readonly total: number;
  readonly resolved: number;
  /** Ally deploy-cost pool (master's `b.snap.dp` / combat HUD COST). */
  readonly dp?: number;
  readonly done?: boolean;
}

/** Ally COST from the cost module's exported resource, when the battle carries one. */
export function allyCostOf(battle: Battle): number | null {
  const pools = battle.export().resources['economy:cost'];
  if (
    pools !== null &&
    typeof pools === 'object' &&
    !Array.isArray(pools) &&
    typeof (pools as { readonly ally?: unknown }).ally === 'number' &&
    Number.isFinite((pools as { readonly ally: number }).ally)
  ) {
    return (pools as { readonly ally: number }).ally;
  }
  return null;
}

/** Progress of a running or finished battle for master's `b.progress`. */
export function battleProgressOf(battle: Battle): UpstreamBattleProgress {
  const ledger = battle.ledger().battle;
  const result = battle.result();
  const tick = battle.snapshot().tick;
  const dp = allyCostOf(battle);
  return {
    gt: Math.round((tick / 30) * 1000) / 1000,
    killed: ledger.killedInTotal,
    total: ledger.total,
    resolved: ledger.resolved,
    ...(dp !== null ? { dp } : {}),
    ...(result.finished ? { done: true } : {}),
  };
}
