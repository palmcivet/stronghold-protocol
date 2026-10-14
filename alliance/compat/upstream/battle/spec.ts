/**
 * Master's `b.start.spec` → mission-core `BattleSpec`. Tiles come from the stage map; operators and enemies from
 * combat defs. Skill records become `SkillSpec` (SP body / trigger / attribute mods); custom blackboard hooks stay
 * for content skill-kit modules. Terrain, special notes and 风机 devices assemble into BattleSpec.
 */
import type {
  BattleSpec,
  Direction,
  SpawnSpec,
  TileSpec,
  UnitSpec,
} from 'arknights-mission-core';
import type { StageDevice, StageMap } from '#data/view/stage-map.js';
import type {
  CombatChessDef,
  CombatDefs,
  CombatEnemyDef,
  CombatStats,
} from '#data/view/combat-def.js';
import { skillScriptOf, skillSpecOf } from '#battle/skill.js';

const FACINGS: readonly Direction[] = ['UP', 'RIGHT', 'DOWN', 'LEFT'];

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function facingOf(value: unknown): Direction {
  return FACINGS.find((facing) => facing === value) ?? 'RIGHT';
}

function attributesOf(stats: CombatStats): Readonly<Record<string, number>> {
  return {
    hp: stats.maxHp,
    atk: stats.atk,
    def: stats.def,
    res: stats.res,
    atkInterval: stats.bat,
    attackSpeed: stats.aspd,
    moveSpeed: stats.moveSpeed,
    block: stats.blockCnt,
  };
}

function attackRangeCells(
  def: CombatChessDef | CombatEnemyDef,
): readonly { readonly x: number; readonly y: number }[] {
  return def.attackRange.map(([x, y]) => ({ x, y }));
}

function damageKindOf(
  stats: CombatStats,
): 'physical' | 'arts' | 'heal' {
  return stats.dmgType === 'arts' ? 'arts' : 'physical';
}

function operatorOf(
  entry: Readonly<Record<string, unknown>>,
  defs: CombatDefs,
  colOffset: number,
): UnitSpec | null {
  const chessId =
    typeof entry.chessId === 'string'
      ? entry.chessId
      : typeof entry.id === 'string'
        ? entry.id
        : null;
  if (!chessId) {
    return null;
  }
  const def = defs.chess[chessId];
  if (!def) {
    return null;
  }
  const row = entry.row;
  const col = entry.col;
  if (typeof row !== 'number' || typeof col !== 'number') {
    return null;
  }
  const uid = entry.uid;
  const id =
    typeof uid === 'number' || typeof uid === 'string'
      ? `op:${uid}`
      : `op:${chessId}:${row}:${col}`;
  const heal = def.profession === 'MEDIC';
  const skill = skillSpecOf(def.skill, heal ? { heal: true } : {});
  const script = skillScriptOf(def.skill);
  return {
    id,
    side: 'ally',
    kind: 'operator',
    ...(typeof entry.owner === 'string' ? { owner: entry.owner } : {}),
    attributes: attributesOf(def.stats),
    skills: skill ? [skill] : [],
    attackRange: attackRangeCells(def),
    tags: [...def.tags],
    deployPositions: ['ground'],
    x: col + colOffset,
    y: row,
    facing: facingOf(entry.dir),
    motion: 'WALK',
    attackShape: { damage: heal ? 'heal' : damageKindOf(def.stats) },
    ...(def.attackClip ? { attackClip: def.attackClip } : {}),
    ...(Object.keys(script).length ? { script } : {}),
  };
}

function enemyUnitOf(
  enemyKey: string,
  defs: CombatDefs,
  x: number,
  y: number,
  id: string,
  route: NonNullable<UnitSpec['route']>,
): UnitSpec | null {
  const def = defs.enemies[enemyKey];
  if (!def) {
    return null;
  }
  return {
    id,
    side: 'enemy',
    kind: 'enemy',
    attributes: attributesOf(def.stats),
    skills: [],
    attackRange: attackRangeCells(def),
    tags: [...def.tags],
    deployPositions: def.stats.motion === 'FLY' ? ['fly'] : ['ground'],
    x,
    y,
    facing: 'LEFT',
    motion: def.stats.motion,
    route,
    attackShape: { damage: damageKindOf(def.stats) },
    ...(def.attackClip ? { attackClip: def.attackClip } : {}),
  };
}

function tilesOf(stage: StageMap): readonly TileSpec[] {
  return stage.tiles.map((tile) => ({
    x: tile.x,
    y: tile.y,
    height: tile.height,
    deployable: tile.deployable,
    walkableBy: tile.walkableBy,
    ...(tile.objective ? { objective: true } : {}),
    ...(tile.terrain ? { terrain: tile.terrain } : {}),
  }));
}

/** 风机 → device unit with blower tag; attack range is facing-RIGHT cells; blackboard → script. */
function blowerUnitOf(device: StageDevice, index: number): UnitSpec | null {
  if (device.role !== 'blower' || !device.active) {
    return null;
  }
  const attackRange =
    device.attackRange.length > 0
      ? device.attackRange.map(([x, y]) => ({ x, y }))
      : [
          { x: 1, y: 0 },
          { x: 2, y: 0 },
          { x: 3, y: 0 },
        ];
  const id = device.alias ? `device:${device.alias}` : `device:blower:${index}`;
  const script: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(device.script)) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      script[key] = value;
    }
  }
  return {
    id,
    side: 'ally',
    kind: 'device',
    attributes: {
      hp: 100,
      atk: 0,
      def: 0,
      res: 0,
      atkInterval: 1,
      attackSpeed: 100,
      moveSpeed: 0,
      block: 0,
    },
    skills: [],
    attackRange,
    tags: ['blower'],
    deployPositions: ['ground'],
    x: device.x,
    y: device.y,
    facing: facingOf(device.facing),
    motion: 'WALK',
    ...(Object.keys(script).length ? { script } : {}),
  };
}

type RouteCheckpoint =
  | { readonly type: 'move'; readonly x: number; readonly y: number }
  | { readonly type: 'wait'; readonly time: number };

interface NormalizedRoute {
  readonly start: { readonly x: number; readonly y: number };
  readonly end: { readonly x: number; readonly y: number };
  readonly checkpoints: readonly RouteCheckpoint[];
}

/** Master `[row, col]` (or `{row,col}` / `{r,c}`) → mission-core `{x:col, y:row}`. */
function tileOf(value: unknown): { readonly x: number; readonly y: number } | null {
  if (Array.isArray(value) && value.length >= 2) {
    const row = value[0];
    const col = value[1];
    if (typeof row === 'number' && typeof col === 'number') {
      return { x: col, y: row };
    }
  }
  if (!isRecord(value)) {
    return null;
  }
  const x = value.col ?? value.x ?? value.c;
  const y = value.row ?? value.y ?? value.r;
  return typeof x === 'number' && typeof y === 'number' ? { x, y } : null;
}

/**
 * Master `b.start.spec.routes` is an array of `{ start:[row,col], end, checkpoints }` (simdata normalizeRoute).
 * Compat tests also pass a record of `{row,col}[]` paths keyed by id — both shapes are accepted.
 */
function routesOf(raw: unknown): readonly NormalizedRoute[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((entry) => {
      const route = normalizeMasterRoute(entry);
      return route ? [route] : [];
    });
  }
  if (!isRecord(raw)) {
    return [];
  }
  return Object.values(raw).flatMap((entry) => {
    if (Array.isArray(entry)) {
      const checkpoints: RouteCheckpoint[] = [];
      for (const point of entry) {
        const tile = tileOf(point);
        if (tile) {
          checkpoints.push({ type: 'move', ...tile });
        } else if (isRecord(point) && typeof point.wait === 'number') {
          checkpoints.push({ type: 'wait', time: point.wait });
        }
      }
      const first = checkpoints.find((point) => point.type === 'move');
      const last = [...checkpoints].reverse().find((point) => point.type === 'move');
      if (!first || first.type !== 'move' || !last || last.type !== 'move') {
        return [];
      }
      return [
        {
          start: { x: first.x, y: first.y },
          end: { x: last.x, y: last.y },
          checkpoints,
        },
      ];
    }
    const route = normalizeMasterRoute(entry);
    return route ? [route] : [];
  });
}

function normalizeMasterRoute(raw: unknown): NormalizedRoute | null {
  if (!isRecord(raw)) {
    return null;
  }
  const start = tileOf(raw.start ?? raw.s ?? raw.startPosition);
  const end = tileOf(raw.end ?? raw.e ?? raw.endPosition) ?? start;
  if (!start || !end) {
    return null;
  }
  const checkpoints: RouteCheckpoint[] = [];
  for (const cp of Array.isArray(raw.checkpoints)
    ? raw.checkpoints
    : Array.isArray(raw.cp)
      ? raw.cp
      : []) {
    if (Array.isArray(cp) && typeof cp[0] === 'number' && typeof cp[1] === 'number') {
      checkpoints.push({ type: 'move', x: cp[1], y: cp[0] });
      continue;
    }
    if (!isRecord(cp)) {
      continue;
    }
    const type = String(cp.type ?? 'move').toLowerCase();
    if (type === 'wait' || type === 'w') {
      const time = typeof cp.time === 'number' ? cp.time : typeof cp.t === 'number' ? cp.t : 0;
      checkpoints.push({ type: 'wait', time });
      continue;
    }
    const tile = tileOf(cp.pos ?? cp.position ?? cp) ?? tileOf([cp.row, cp.col]);
    if (tile) {
      checkpoints.push({ type: 'move', ...tile });
    }
  }
  if (checkpoints.length === 0) {
    checkpoints.push({ type: 'move', x: end.x, y: end.y });
  }
  return { start, end, checkpoints };
}

function routeOf(
  routes: readonly NormalizedRoute[],
  index: number,
  fallback: { readonly x: number; readonly y: number },
): NormalizedRoute {
  const picked = routes[index] ?? routes[0];
  if (picked) {
    return picked;
  }
  return {
    start: fallback,
    end: fallback,
    checkpoints: [{ type: 'move', x: fallback.x, y: fallback.y }],
  };
}

/** Game ticks per second in mission-core. */
const TICKS = 30;

export interface BattleSpecContext {
  readonly defs: CombatDefs;
  /** Stage boards by id; `stageId` of the master spec picks one. */
  readonly stages: Readonly<Record<string, StageMap>>;
}

/**
 * Mission-core battle of a master `b.start.spec`, or null when the stage or combat defs are missing so the battle
 * cannot be run here yet.
 */
export function battleSpecOf(
  raw: unknown,
  context: BattleSpecContext,
): BattleSpec | null {
  if (!isRecord(raw)) {
    return null;
  }
  const stageId = typeof raw.stageId === 'string' ? raw.stageId : null;
  const stage = stageId ? context.stages[stageId] : null;
  if (!stage) {
    return null;
  }
  const seed =
    typeof raw.seed === 'number' && Number.isFinite(raw.seed)
      ? raw.seed >>> 0
      : 1;
  const units: UnitSpec[] = [];
  const players = Array.isArray(raw.players) ? raw.players : [];
  for (const player of players) {
    if (!isRecord(player)) {
      continue;
    }
    const colOffset =
      typeof player.colOffset === 'number' ? player.colOffset : 0;
    const owner =
      typeof player.playerId === 'string' ? player.playerId : undefined;
    const list = Array.isArray(player.units) ? player.units : [];
    for (const entry of list) {
      if (!isRecord(entry) || entry.kind === 'token') {
        continue;
      }
      const unit = operatorOf(
        owner ? { ...entry, owner } : entry,
        context.defs,
        colOffset,
      );
      if (unit) {
        units.push(unit);
      }
    }
  }

  (stage.devices ?? []).forEach((device, index) => {
    const blower = blowerUnitOf(device, index);
    if (blower) {
      units.push(blower);
    }
  });

  const routes = routesOf(raw.routes);
  // Master spawnEnemy fallback: [rect.r0, rect.c1] of the field (top-right of the own half).
  const fieldFallback = { x: Math.max(0, stage.cols - 1), y: 0 };
  const spawns: SpawnSpec[] = [];
  const list = Array.isArray(raw.spawns) ? raw.spawns : [];
  list.forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.enemyKey !== 'string') {
      return;
    }
    const def = context.defs.enemies[entry.enemyKey];
    if (!def) {
      return;
    }
    const time = typeof entry.time === 'number' ? entry.time : 0;
    const routeIndex =
      typeof entry.routeIndex === 'number'
        ? entry.routeIndex
        : typeof entry.route === 'number'
          ? entry.route
          : 0;
    const route = routeOf(routes, routeIndex, fieldFallback);
    const explicit = tileOf(entry.pos) ?? (
      typeof entry.col === 'number' && typeof entry.row === 'number'
        ? { x: entry.col, y: entry.row }
        : typeof entry.x === 'number' && typeof entry.y === 'number'
          ? { x: entry.x, y: entry.y }
          : null
    );
    const start = explicit ?? route.start;
    const id = `spawn:${index}:${entry.enemyKey}`;
    const unit = enemyUnitOf(
      entry.enemyKey,
      context.defs,
      start.x,
      start.y,
      id,
      route,
    );
    if (!unit) {
      return;
    }
    spawns.push({
      atTick: Math.max(0, Math.round(time * TICKS)),
      unit,
      ...(def.notCountInTotal ? { inTotal: false } : {}),
    });
  });

  return {
    seed,
    modules: [
      'cost',
      'deploy',
      'redeploy',
      'block',
      'leak',
      'official-funnel',
      'official-terrain',
      'official-rank',
    ],
    tiles: tilesOf(stage),
    units,
    spawns,
    deployStrategy: null,
    cost: {
      ally: { initial: 10, regen: 1, cap: 99 },
      enemy: { initial: 0, regen: 0, cap: 0 },
    },
    notes: {
      kind: typeof raw.kind === 'string' ? raw.kind : 'normal',
      stageId,
      fieldId: typeof raw.fieldId === 'string' ? raw.fieldId : null,
      waveId: typeof raw.waveId === 'string' ? raw.waveId : null,
      ...((stage.special && Object.keys(stage.special).length)
        ? { special: stage.special }
        : {}),
    },
  };
}
