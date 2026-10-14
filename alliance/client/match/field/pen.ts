import type {
  EnemyPreview,
  FieldRect,
} from '@alliance/contract/server-message.js';
import type { BattleSnapshot, UnitSnapshot } from 'arknights-mission-core';

/**
 * Enemy preview pen (master render/pen.js — research 08 §4.2 / 09 §2).
 * Pure layout: camera pans here; figures idle for the coming wave.
 */

export const PEN_RECT: FieldRect = Object.freeze({
  r0: 14,
  r1: 18,
  c0: 7,
  c1: 13,
});

export const PEN_MAX = 50;
export const MAX_PREVIEW = PEN_MAX;
export const PER_TILE = 3;

/** Cluster offsets (tiles; x = col, y = row) of 1–6 figures sharing a tile. */
const CLUSTER: readonly (readonly (readonly [number, number])[])[] =
  Object.freeze([
    Object.freeze([Object.freeze([0, 0] as const)]),
    Object.freeze([
      Object.freeze([-0.17, 0.13] as const),
      Object.freeze([0.17, -0.13] as const),
    ]),
    Object.freeze([
      Object.freeze([-0.22, 0.16] as const),
      Object.freeze([0.2, 0.18] as const),
      Object.freeze([-0.02, -0.2] as const),
    ]),
    Object.freeze([
      Object.freeze([-0.22, 0.2] as const),
      Object.freeze([0.22, 0.2] as const),
      Object.freeze([-0.22, -0.2] as const),
      Object.freeze([0.22, -0.2] as const),
    ]),
    Object.freeze([
      Object.freeze([-0.25, 0.22] as const),
      Object.freeze([0.25, 0.22] as const),
      Object.freeze([0, 0] as const),
      Object.freeze([-0.25, -0.22] as const),
      Object.freeze([0.25, -0.22] as const),
    ]),
    Object.freeze([
      Object.freeze([-0.27, 0.22] as const),
      Object.freeze([0, 0.26] as const),
      Object.freeze([0.27, 0.22] as const),
      Object.freeze([-0.27, -0.22] as const),
      Object.freeze([0, -0.26] as const),
      Object.freeze([0.27, -0.22] as const),
    ]),
  ]);

export interface PenFigure {
  readonly key: string;
  readonly enemyKey: string;
  readonly row: number;
  readonly col: number;
  /** Sub-tile offset for cluster / jitter (master x/y). */
  readonly x: number;
  readonly y: number;
  readonly fly?: boolean;
  readonly elite?: boolean;
  readonly boss?: boolean;
  readonly t?: number;
  readonly zone?: 'lower' | 'upper';
}

interface PenEntry {
  readonly enemyKey: string;
  readonly count: number;
  readonly gate: 'upper' | 'lower';
  readonly t: number;
  readonly fly: boolean;
  readonly boss: boolean;
  readonly elite: boolean;
  readonly i: number;
}

interface PenZone {
  readonly anchor: readonly [number, number];
  readonly tiles: [number, number][];
}

interface PenZones {
  readonly rect: FieldRect;
  readonly lower: PenZone;
  readonly upper: PenZone;
}

function isObj(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Parse a configBlackBoard rect "((r0,c0),(r1,c1))" → FieldRect. */
export function parsePenRect(value: unknown): FieldRect | null {
  if (typeof value !== 'string') {
    return null;
  }
  const n = value
    .replace(/[()\s]/g, '')
    .split(',')
    .map(Number);
  if (n.length !== 4 || !n.every(Number.isInteger)) {
    return null;
  }
  return {
    r0: Math.min(n[0]!, n[2]!),
    r1: Math.max(n[0]!, n[2]!),
    c0: Math.min(n[1]!, n[3]!),
    c1: Math.max(n[1]!, n[3]!),
  };
}

/**
 * Pen zones for a stage (defaults when missing): lower / upper by Manhattan to gate anchors.
 * Stage shape: `{ config?: { enemy_place_rect? }, rows?: string[], tiles?: Record }`.
 */
export function penZones(stage?: unknown): PenZones {
  const record = isObj(stage) ? stage : {};
  const config = isObj(record.config) ? record.config : {};
  const rect = parsePenRect(config.enemy_place_rect) ?? { ...PEN_RECT };
  const rows = Array.isArray(record.rows) ? (record.rows as unknown[]) : null;
  const legend = isObj(record.tiles) ? record.tiles : {};
  const glyph = (r: number, c: number): string | null => {
    if (!rows || typeof rows[r] !== 'string') {
      return null;
    }
    return (rows[r] as string)[c] ?? null;
  };
  const anchors: [number, number][] = [];
  const cand: [number, number][] = [];
  for (let r = rect.r0; r <= rect.r1; r++) {
    for (let c = rect.c0; c <= rect.c1; c++) {
      const g = glyph(r, c);
      const def =
        g && isObj(legend[g]) ? (legend[g] as Record<string, unknown>) : null;
      if (rows) {
        if (!def) {
          continue;
        }
        if (def.tileKey === 'tile_start') {
          anchors.push([r, c]);
          continue;
        }
        const bb = isObj(def.bb) ? def.bb : null;
        if (bb?.previewNotAlloed) {
          continue;
        }
        if (def.passable && def.passable !== 'ALL') {
          continue;
        }
        cand.push([r, c]);
      } else {
        if (c === rect.c0 && (r === rect.r0 + 1 || r === rect.r1)) {
          anchors.push([r, c]);
          continue;
        }
        if (r === rect.r0 + 2) {
          continue;
        }
        cand.push([r, c]);
      }
    }
  }
  if (!anchors.length) {
    anchors.push([rect.r0 + 1, rect.c0], [rect.r1, rect.c0]);
  }
  anchors.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const zones: PenZone[] = anchors.map((a) => ({
    anchor: a,
    tiles: [] as [number, number][],
  }));
  const dist = (a: readonly [number, number], t: readonly [number, number]) =>
    Math.abs(a[0] - t[0]) + Math.abs(a[1] - t[1]);
  for (const t of cand) {
    let best = zones[0]!;
    let bd = Infinity;
    for (const z of zones) {
      const d = dist(z.anchor, t);
      if (d < bd) {
        bd = d;
        best = z;
      }
    }
    best.tiles.push(t);
  }
  for (const z of zones) {
    z.tiles.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  }
  return {
    rect,
    lower: zones[0]!,
    upper: zones[zones.length - 1]!,
  };
}

export function penEntries(list: readonly EnemyPreview[]): PenEntry[] {
  const out: PenEntry[] = [];
  list.forEach((e, i) => {
    if (!e || typeof e.enemyKey !== 'string' || !e.enemyKey) {
      return;
    }
    const count = Math.max(1, Math.min(200, Math.trunc(Number(e.count) || 1)));
    const boss = !!e.boss || e.tag === 'boss';
    out.push({
      enemyKey: e.enemyKey,
      count,
      gate: e.gate === 'upper' ? 'upper' : 'lower',
      t: Number.isFinite(Number(e.t)) ? Number(e.t) : 0,
      fly: !!e.fly,
      boss,
      elite: !!e.elite || boss,
      i,
    });
  });
  out.sort((a, b) => a.t - b.t || a.i - b.i);
  return out;
}

export function penSignature(list: readonly EnemyPreview[]): string {
  return penEntries(list)
    .map(
      (e) =>
        `${e.enemyKey}:${e.count}:${e.gate[0]}:${e.t}:${e.fly ? 1 : 0}${e.elite ? 1 : 0}${e.boss ? 1 : 0}`,
    )
    .join('|');
}

export function thinPreview(
  entries: readonly PenEntry[],
  max = PEN_MAX,
): { readonly entry: PenEntry; n: number }[] {
  const total = entries.reduce((s, e) => s + e.count, 0);
  const ratio = total > 0 ? Math.min(1, max / total) : 1;
  const plan = entries.map((e) => ({
    entry: e,
    n: e.elite ? e.count : Math.max(1, Math.round(e.count * ratio)),
  }));
  let shown = plan.reduce((s, p) => s + p.n, 0);
  while (shown > max) {
    let big: (typeof plan)[number] | null = null;
    for (const p of plan) {
      if (!p.entry.elite && p.n > 1 && (!big || p.n > big.n)) {
        big = p;
      }
    }
    if (!big) {
      break;
    }
    big.n--;
    shown--;
  }
  for (let i = plan.length - 1; i >= 0 && shown > max; i--) {
    const p = plan[i]!;
    if (p.entry.elite || !p.n) {
      continue;
    }
    p.n--;
    shown--;
  }
  return plan.filter((p) => p.n > 0);
}

export function layoutPen(
  list: readonly EnemyPreview[],
  opts: {
    readonly stage?: unknown;
    readonly max?: number;
    readonly perTile?: number;
  } = {},
): readonly PenFigure[] {
  const entries = penEntries(list);
  const sig = penSignature(list);
  const Z = penZones(opts.stage);
  const max =
    Number.isInteger(opts.max) && (opts.max as number) > 0
      ? (opts.max as number)
      : PEN_MAX;
  const perTile =
    Number.isInteger(opts.perTile) && (opts.perTile as number) > 0
      ? (opts.perTile as number)
      : PER_TILE;
  const plan = thinPreview(entries, max);
  const total = entries.reduce((s, e) => s + e.count, 0);
  const totalShowCnt = Math.max(1, Math.min(max, total));
  const rand = rng(hashStr(sig) || 1);
  const load = new Map<string, number>();
  const keyOf = (t: readonly [number, number]) => `${t[0]},${t[1]}`;
  const hasRoom = (t: readonly [number, number]) =>
    (load.get(keyOf(t)) || 0) < perTile;
  const allTiles = [...Z.lower.tiles, ...Z.upper.tiles];
  const placed: {
    entry: PenEntry;
    tile: [number, number];
    zone: 'lower' | 'upper';
  }[] = [];
  const kOf = { lower: 0, upper: 0 };
  for (const { entry, n } of plan) {
    const zoneName: 'lower' | 'upper' =
      entry.gate === 'upper' ? 'upper' : 'lower';
    const zone = Z[zoneName];
    for (let j = 0; j < n; j++) {
      const k = kOf[zoneName]++;
      const len = zone.tiles.length;
      let tile: [number, number] | null = null;
      if (len) {
        const jitter = rand() < 0.5 ? 1 : 0;
        let idx = Math.round((k / totalShowCnt) * len) - jitter;
        idx = Math.max(0, Math.min(len - 1, idx));
        for (let d = 0; d < len && !tile; d++) {
          for (const ii of d ? [idx + d, idx - d] : [idx]) {
            if (ii >= 0 && ii < len && hasRoom(zone.tiles[ii]!)) {
              tile = zone.tiles[ii]!;
              break;
            }
          }
        }
        if (!tile) {
          let best = Infinity;
          for (let ii = 0; ii < len; ii++) {
            const score =
              (load.get(keyOf(zone.tiles[ii]!)) || 0) * len +
              Math.abs(ii - idx);
            if (score < best) {
              best = score;
              tile = zone.tiles[ii]!;
            }
          }
        }
      }
      if (!tile) {
        tile =
          allTiles.find(hasRoom) ||
          allTiles[0] ||
          ([Z.rect.r0, Z.rect.c1] as [number, number]);
      }
      load.set(keyOf(tile), (load.get(keyOf(tile)) || 0) + 1);
      placed.push({ entry, tile, zone: zoneName });
    }
  }
  const seen = new Map<string, number>();
  return placed.map((p, idx) => {
    const kk = keyOf(p.tile);
    const cnt = Math.min(CLUSTER.length, load.get(kk) || 1);
    const slot = seen.get(kk) || 0;
    seen.set(kk, slot + 1);
    const cluster = CLUSTER[cnt - 1] ?? CLUSTER[0]!;
    const off = cluster[slot % cluster.length] ?? ([0, 0] as const);
    const jx = (rand() - 0.5) * 0.08;
    const jy = (rand() - 0.5) * 0.08;
    const e = p.entry;
    return {
      key: penUnitId(e.enemyKey, idx),
      enemyKey: e.enemyKey,
      row: p.tile[0],
      col: p.tile[1],
      x: p.tile[1] + off[0] + jx,
      y: p.tile[0] + off[1] + jy,
      ...(e.fly ? { fly: true as const } : {}),
      ...(e.elite ? { elite: true as const } : {}),
      ...(e.boss ? { boss: true as const } : {}),
      t: e.t,
      zone: p.zone,
    };
  });
}

export function penUnitId(enemyKey: string, index: number): string {
  return `pen:${enemyKey}:${index}`;
}

export function enemyKeyOfPenUnit(unitId: string): string | null {
  if (!unitId.startsWith('pen:')) {
    return null;
  }
  const parts = unitId.split(':');
  const key = parts.length >= 2 ? parts[1] : undefined;
  return key || null;
}

function unitOf(figure: PenFigure): UnitSnapshot {
  return {
    id: figure.key,
    side: 'enemy',
    kind: 'enemy',
    x: figure.x,
    y: figure.y,
    facing: 'LEFT',
    height: 0,
    attributes: { hp: 1 },
    maxHp: 1,
    tags: [],
    attackRange: [],
    deployPositions: [],
    elements: {},
    blocking: [],
    blockedBy: null,
    skills: [],
    shield: 0,
    downed: false,
    redeploy: null,
    unbalanceUntil: null,
    components: {},
  };
}

/** Snapshot units for pen figures (merged onto the prep board while the pen camera is on). */
export function penUnitsOf(
  enemies: readonly EnemyPreview[],
  stage?: unknown,
): readonly UnitSnapshot[] {
  return layoutPen(enemies, stage ? { stage } : {}).map(unitOf);
}

export function isPenRect(rect: FieldRect): boolean {
  return (
    rect.r0 === PEN_RECT.r0 &&
    rect.r1 === PEN_RECT.r1 &&
    rect.c0 === PEN_RECT.c0 &&
    rect.c1 === PEN_RECT.c1
  );
}

export function penSnapshotOf(
  enemies: readonly EnemyPreview[],
  tick = 0,
  stage?: unknown,
): BattleSnapshot {
  return { tick, units: penUnitsOf(enemies, stage) };
}
