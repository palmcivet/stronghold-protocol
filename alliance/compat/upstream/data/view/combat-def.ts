/**
 * Combat attributes the battle adapter needs from master's chess / enemies tables. Not part of the UI catalog.
 * Attack fields are normalized to mission-core UnitSpec names (attackRange / attackClip / attack-moves).
 */
export interface CombatSkillSource {
  readonly skillId?: string | null;
  readonly skillType?: string | null;
  readonly durationType?: string | null;
  readonly duration?: number | null;
  readonly spType?: string | null;
  readonly spCost?: number | null;
  readonly initSp?: number | null;
  readonly maxChargeTime?: number | null;
  readonly bb?: Readonly<Record<string, unknown>> | null;
  readonly rangeGrid?: unknown;
  readonly trigger?: unknown;
  readonly index?: number | null;
}

export interface CombatStats {
  readonly maxHp: number;
  readonly atk: number;
  readonly def: number;
  readonly res: number;
  readonly bat: number;
  readonly aspd: number;
  readonly moveSpeed: number;
  readonly blockCnt: number;
  /** Source-table radius, used when the record has no attack cells. */
  readonly rangeRadius: number;
  readonly motion: 'WALK' | 'FLY';
  readonly dmgType: 'physical' | 'arts' | 'true';
}

export interface AttackClip {
  readonly duration: number;
  readonly hit: number;
}

export interface CombatChessDef {
  readonly id: string;
  readonly charId: string | null;
  readonly profession: string | null;
  readonly stats: CombatStats;
  /** Facing RIGHT attack cells as `[x, y]` offsets (normalized; from master `rangeGrid` or radius). */
  readonly attackRange: readonly (readonly [number, number])[];
  /** Source-table attack cells. An empty grid becomes `[[1, 0]]`. */
  readonly rangeGrid: readonly (readonly [number, number])[];
  readonly attackClip: AttackClip | null;
  readonly tags: readonly string[];
  /** The loadout skill this chess fights with (`skill`), when present. */
  readonly skill: CombatSkillSource | null;
}

export interface CombatEnemyDef {
  readonly id: string;
  readonly stats: CombatStats;
  readonly notCountInTotal: boolean;
  /** Facing RIGHT attack cells (normalized from `attackRange` or `rangeRadius`). */
  readonly attackRange: readonly (readonly [number, number])[];
  readonly attackClip: AttackClip | null;
  /** Includes `attack-moves` when the enemy keeps walking through attacks. */
  readonly tags: readonly string[];
}

export interface CombatDefs {
  readonly chess: Readonly<Record<string, CombatChessDef>>;
  readonly enemies: Readonly<Record<string, CombatEnemyDef>>;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function statsOf(
  raw: Readonly<Record<string, unknown>>,
  dmgFallback: string | null,
): CombatStats {
  const motion = raw.motion === 'FLY' ? 'FLY' : 'WALK';
  const dmg =
    raw.dmgType === 'arts' || raw.dmgType === 'true'
      ? raw.dmgType
      : dmgFallback === 'arts' || dmgFallback === 'true'
        ? dmgFallback
        : 'physical';
  return {
    maxHp: Math.max(1, num(raw.maxHp, 100)),
    atk: Math.max(0, num(raw.atk, 10)),
    def: Math.max(0, num(raw.def, 0)),
    res: Math.max(0, num(raw.res, 0)),
    bat: Math.max(0.1, num(raw.bat, 1)),
    aspd: Math.max(1, num(raw.aspd, 100)),
    moveSpeed: Math.max(0, num(raw.moveSpeed, 1)),
    blockCnt: Math.max(0, Math.trunc(num(raw.blockCnt, 1))),
    rangeRadius: Math.max(0, num(raw.rangeRadius, 0)),
    motion,
    dmgType: dmg,
  };
}

function cellsOf(value: unknown): readonly (readonly [number, number])[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((cell): (readonly [number, number])[] => {
    if (!Array.isArray(cell) || cell.length < 2) {
      return [];
    }
    const x = cell[0];
    const y = cell[1];
    if (typeof x !== 'number' || typeof y !== 'number') {
      return [];
    }
    return [[x, y]];
  });
}

/** Circle of facing-RIGHT cells from a range radius. */
export function attackRangeFromRadius(
  radius: number,
): readonly (readonly [number, number])[] {
  if (!(radius > 0)) {
    return [[1, 0]];
  }
  const cells: [number, number][] = [];
  const r = Math.ceil(radius);
  for (let y = -r; y <= r; y += 1) {
    for (let x = -r; x <= r; x += 1) {
      if (x === 0 && y === 0) {
        continue;
      }
      if (x * x + y * y <= radius * radius + 0.01) {
        cells.push([x, y]);
      }
    }
  }
  return cells.length > 0 ? cells : [[1, 0]];
}

function attackClipOf(value: unknown): AttackClip | null {
  if (!isRecord(value)) {
    return null;
  }
  const duration = num(value.duration, Number.NaN);
  const hit = num(value.hit, Number.NaN);
  if (!(duration >= 0) || !(hit >= 0)) {
    return null;
  }
  return { duration, hit };
}

function tagsOf(
  raw: Readonly<Record<string, unknown>>,
  attackMoves: boolean,
): readonly string[] {
  const base = Array.isArray(raw.tags)
    ? raw.tags.filter((tag): tag is string => typeof tag === 'string')
    : [];
  if (!attackMoves && raw.attackMoves !== true) {
    return base;
  }
  return base.includes('attack-moves') ? base : [...base, 'attack-moves'];
}

function attackRangeOf(
  raw: Readonly<Record<string, unknown>>,
  stats: CombatStats,
  fallbackGrid: unknown,
): readonly (readonly [number, number])[] {
  const normalized = cellsOf(raw.attackRange);
  if (normalized.length > 0) {
    return normalized;
  }
  const grid = cellsOf(fallbackGrid);
  if (grid.length > 0) {
    return grid;
  }
  return attackRangeFromRadius(stats.rangeRadius);
}

function skillOf(value: unknown): CombatSkillSource | null {
  if (!isRecord(value) || typeof value.skillId !== 'string' || !value.skillId) {
    return null;
  }
  const bb = isRecord(value.bb) ? { ...value.bb } : null;
  return {
    skillId: value.skillId,
    skillType: typeof value.skillType === 'string' ? value.skillType : null,
    durationType:
      typeof value.durationType === 'string' ? value.durationType : null,
    duration: typeof value.duration === 'number' ? value.duration : null,
    spType: typeof value.spType === 'string' ? value.spType : null,
    spCost: typeof value.spCost === 'number' ? value.spCost : null,
    initSp: typeof value.initSp === 'number' ? value.initSp : null,
    maxChargeTime:
      typeof value.maxChargeTime === 'number' ? value.maxChargeTime : null,
    bb,
    rangeGrid: value.rangeGrid ?? null,
    trigger: value.trigger ?? null,
    index: typeof value.index === 'number' ? value.index : null,
  };
}

/** Combat defs of master `chess.json` / `enemies.json` tables. */
export function combatDefsOf(chess: unknown, enemies: unknown): CombatDefs {
  const chessOut: Record<string, CombatChessDef> = {};
  if (isRecord(chess)) {
    for (const [key, record] of Object.entries(chess)) {
      if (!isRecord(record) || !isRecord(record.stats)) {
        continue;
      }
      const id =
        typeof record.chessId === 'string'
          ? record.chessId
          : typeof record.key === 'string'
            ? record.key
            : key;
      const dmg =
        typeof record.dmgType === 'string'
          ? record.dmgType === 'phys'
            ? 'physical'
            : record.dmgType
          : null;
      const stats = statsOf(record.stats, dmg);
      const rangeGrid = cellsOf(record.rangeGrid);
      const attackRange = attackRangeOf(
        record,
        stats,
        rangeGrid.length > 0 ? rangeGrid : [[1, 0]],
      );
      chessOut[id] = {
        id,
        charId: typeof record.charId === 'string' ? record.charId : null,
        profession:
          typeof record.profession === 'string' ? record.profession : null,
        stats,
        attackRange,
        rangeGrid: rangeGrid.length > 0 ? rangeGrid : [[1, 0]],
        attackClip: attackClipOf(record.attackClip ?? record.attackAnim),
        tags: tagsOf(record, false),
        skill: skillOf(record.skill),
      };
    }
  }
  const enemyOut: Record<string, CombatEnemyDef> = {};
  if (isRecord(enemies)) {
    for (const [key, record] of Object.entries(enemies)) {
      if (!isRecord(record) || !isRecord(record.stats)) {
        continue;
      }
      const id = typeof record.key === 'string' ? record.key : key;
      const dmg =
        typeof record.stats.dmgType === 'string'
          ? record.stats.dmgType === 'phys'
            ? 'physical'
            : record.stats.dmgType
          : null;
      const stats = statsOf(record.stats, dmg);
      enemyOut[id] = {
        id,
        stats,
        notCountInTotal: record.notCountInTotal === true,
        attackRange: attackRangeOf(record, stats, null),
        attackClip: attackClipOf(record.attackClip ?? record.attackAnim),
        tags: tagsOf(record, record.attackMoves === true),
      };
    }
  }
  return { chess: chessOut, enemies: enemyOut };
}
