import type { CombatChessDef, CombatEnemyDef } from '@alliance/compat-upstream';
import type { UnitStatsEntry } from '@alliance/contract/message.js';
import { unitStatsEntry } from '@alliance/contract/message.js';
import type { UnitSnapshot } from 'arknights-mission-core';

export type LiveStatsSource = 'battle' | 'prep' | 'catalog';

export interface LiveStatsView {
  readonly src: LiveStatsSource;
  readonly hp: number;
  readonly maxHp: number;
  readonly atk: number;
  readonly def: number;
  readonly res: number;
  readonly interval: number | null;
  readonly blockCnt: number;
  readonly moveSpeed: number;
  readonly range?: ReadonlyArray<readonly [number, number]>;
  readonly base: {
    readonly maxHp: number;
    readonly atk: number;
    readonly def: number;
    readonly res: number;
    readonly interval: number | null;
    readonly blockCnt: number;
  };
  readonly silenced: boolean;
}

function fromEntry(
  entry: UnitStatsEntry,
  src: 'battle' | 'prep',
): LiveStatsView {
  return {
    src,
    hp: entry.hp,
    maxHp: entry.maxHp,
    atk: entry.atk,
    def: entry.def,
    res: entry.res,
    interval: entry.interval,
    blockCnt: entry.blockCnt,
    moveSpeed: entry.moveSpeed,
    ...(entry.range ? { range: entry.range } : {}),
    base: {
      maxHp: entry.base.maxHp,
      atk: entry.base.atk,
      def: entry.base.def,
      res: entry.base.res,
      interval: entry.base.interval,
      blockCnt: entry.base.blockCnt,
    },
    silenced: entry.silenced,
  };
}

function fromDef(
  def: CombatChessDef | CombatEnemyDef,
  kind: 'chess' | 'enemy',
): LiveStatsView {
  const { stats } = def;
  const interval =
    stats.bat > 0
      ? Math.round(((stats.bat * 100) / stats.aspd) * 100) / 100
      : null;
  const range =
    kind === 'chess' && 'rangeGrid' in def ? def.rangeGrid : undefined;
  return {
    src: 'catalog',
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    atk: stats.atk,
    def: stats.def,
    res: stats.res,
    interval,
    blockCnt: stats.blockCnt,
    moveSpeed: stats.moveSpeed,
    ...(range?.length ? { range } : {}),
    base: {
      maxHp: stats.maxHp,
      atk: stats.atk,
      def: stats.def,
      res: stats.res,
      interval,
      blockCnt: stats.blockCnt,
    },
    silenced: false,
  };
}

/** Local sim unit → display entry (mission-core attributes). */
export function liveStatsFromUnit(
  unit: UnitSnapshot,
  catalogFallback: CombatChessDef | CombatEnemyDef | null,
  kind: 'chess' | 'enemy',
): LiveStatsView {
  const attrs = unit.attributes;
  const baseDef = catalogFallback ? fromDef(catalogFallback, kind) : null;
  const entry = unitStatsEntry(
    {
      id: null,
      uid: null,
      defId: null,
      hp: attrs.hp ?? unit.maxHp,
      alive: !unit.downed,
      side: unit.side,
      base: {
        maxHp: baseDef?.base.maxHp ?? unit.maxHp,
        atk: baseDef?.base.atk ?? attrs.atk,
        def: baseDef?.base.def ?? attrs.def,
        res: baseDef?.base.res ?? attrs.res,
        bat: attrs.atkInterval ?? attrs.bat,
        aspd: attrs.attackSpeed ?? attrs.aspd ?? 100,
        blockCnt: baseDef?.base.blockCnt ?? attrs.block ?? attrs.blockCnt,
        moveSpeed: baseDef?.moveSpeed ?? attrs.moveSpeed,
      },
      liveRangeGrid: unit.attackRange?.map(
        (t) => [t.x, t.y] as [number, number],
      ),
    },
    {
      maxHp: unit.maxHp,
      atk: attrs.atk,
      def: attrs.def,
      res: attrs.res,
      bat: attrs.atkInterval ?? attrs.bat,
      aspd: attrs.attackSpeed ?? attrs.aspd ?? 100,
      blockCnt: attrs.block ?? attrs.blockCnt,
      moveSpeed: attrs.moveSpeed,
      flags: { silence: attrs.silence ? true : undefined },
    },
  );
  return fromEntry(entry, 'battle');
}

/** Catalog-only fallback. */
export function liveStatsFromCatalog(
  def: CombatChessDef | CombatEnemyDef | null,
  kind: 'chess' | 'enemy',
): LiveStatsView | null {
  return def ? fromDef(def, kind) : null;
}

/** Prep `m.unitStats` entry, else catalog. */
export function liveStatsFromPrep(
  entry: UnitStatsEntry | null | undefined,
  def: CombatChessDef | CombatEnemyDef | null,
  kind: 'chess' | 'enemy',
): LiveStatsView | null {
  if (entry) {
    return fromEntry(entry, 'prep');
  }
  return liveStatsFromCatalog(def, kind);
}

/** Stage unit id of an own board piece in a local upstream battle. */
export function battleOpId(uid: number): string {
  return `op:${uid}`;
}
