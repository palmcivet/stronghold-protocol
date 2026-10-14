/**
 * mission-core `Battle` → master's `b.result` shape (`perPlayer` from the ledger's owners).
 */
import type {
  Battle,
  BattleLedger,
  UnitSnapshot,
} from 'arknights-mission-core';

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export interface BattleResultContext {
  /** Player ids that must appear in `perPlayer` even with an empty ledger row (from `b.start.spec.players`). */
  readonly playerIds?: readonly string[];
}

function reasonOf(
  winner: 'ally' | 'enemy' | null,
): 'cleared' | 'timeout' | 'forced' {
  if (winner === 'ally') {
    return 'cleared';
  }
  if (winner === 'enemy') {
    return 'forced';
  }
  return 'timeout';
}

function emptyRow() {
  return {
    kills: 0,
    leaks: 0,
    damage: 0,
    healing: 0,
    deaths: 0,
    total: 0,
    killedInTotal: 0,
    leakedInTotal: 0,
    resolved: 0,
  };
}

/**
 * Ally operator end states. Core snapshots omit `owner`, so multi-player seats get an empty list unless there is only
 * one seat (then every ally operator is that player's).
 */
function unitsEndOf(
  units: readonly UnitSnapshot[],
  soleOwner: boolean,
): readonly Readonly<Record<string, unknown>>[] {
  if (!soleOwner) {
    return [];
  }
  return units
    .filter((unit) => unit.side === 'ally' && unit.kind === 'operator')
    .slice(0, 64)
    .map((unit) => {
      const maxHp = Math.max(1, unit.maxHp || 1);
      const hp =
        typeof unit.attributes.hp === 'number' ? unit.attributes.hp : 0;
      const skill = unit.skills[0];
      const spCost = skill && skill.spCost > 0 ? skill.spCost : 0;
      const sp = skill ? skill.sp : 0;
      return {
        uid: null,
        hpPct: Math.max(0, Math.min(1, hp / maxHp)),
        sp: spCost > 0 ? Math.max(0, Math.min(1e5, sp)) : 0,
        alive: !unit.downed && hp > 0,
        ...(skill ? { skillActive: skill.active } : {}),
        defId: null,
      };
    });
}

/**
 * Players that own an ally unit in the start spec, else ledger owners, else a single synthetic seat.
 */
function playerIdsOf(
  context: BattleResultContext | undefined,
  ledger: BattleLedger,
): readonly string[] {
  if (context?.playerIds?.length) {
    return context.playerIds;
  }
  const owners = Object.keys(ledger.owners);
  if (owners.length > 0) {
    return owners;
  }
  return ['p1'];
}

/** Full `b.result` payload: protocol reasons + per-player ledger rows. */
export function battleResultOf(
  battle: Battle,
  context?: BattleResultContext,
): Readonly<Record<string, unknown>> {
  const ledger = battle.ledger();
  const result = battle.result();
  const tick = battle.snapshot().tick;
  const snapshot = battle.snapshot();
  const ids = playerIdsOf(context, ledger);
  const battleRow = ledger.battle;
  const perPlayer: Record<string, Readonly<Record<string, unknown>>> = {};
  for (const playerId of ids) {
    const row = ledger.owners[playerId] ?? emptyRow();
    const killed = row.killedInTotal;
    const total = Math.max(row.total, battleRow.total);
    const killedClamped = Math.min(killed, total);
    perPlayer[playerId] = {
      killed: killedClamped,
      total,
      leaked: [],
      perfect: row.leakedInTotal === 0 && result.winner === 'ally',
      layerGains: {},
      unitsEnd: unitsEndOf(snapshot.units, ids.length === 1),
      coins: 0,
      damageDealt: row.damage,
      bossDamage: 0,
      healingDone: row.healing,
      deaths: row.deaths,
    };
  }
  return {
    reason: reasonOf(result.winner),
    time: Math.round((tick / 30) * 1000) / 1000,
    killed: battleRow.killedInTotal,
    total: battleRow.total,
    resolved: battleRow.resolved,
    perfect: battleRow.leakedInTotal === 0 && result.winner === 'ally',
    perPlayer,
  };
}

/** Player ids listed on a master `b.start.spec`. */
export function playerIdsOfSpec(raw: unknown): readonly string[] {
  if (!isRecord(raw) || !Array.isArray(raw.players)) {
    return [];
  }
  const ids: string[] = [];
  for (const player of raw.players) {
    if (isRecord(player) && typeof player.playerId === 'string') {
      ids.push(player.playerId);
    }
  }
  return ids;
}
