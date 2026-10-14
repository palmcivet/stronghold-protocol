/**
 * Master's stage record (`stages.json`: `rows` of glyphs, row 0 at the bottom, and a `tiles` table by glyph) mapped to
 * the neutral board the battlefield draws: one tile per cell with its glyph, height, deployability and who may walk it.
 * Terrain / special / devices feed BattleSpec assembly.
 */

/** Official terrain ids written on TileSpec.terrain. */
const OFFICIAL_TERRAINS: ReadonlySet<string> = new Set([
  'mire',
  'smog',
  'deepsea',
  'infection',
]);

export interface StageTile {
  readonly x: number;
  readonly y: number;
  /** Master's glyph of the cell. */
  readonly glyph: string;
  readonly height: number;
  readonly deployable: boolean;
  readonly walkableBy: readonly ('ground' | 'fly')[];
  readonly objective: boolean;
  /** mission-core terrain id when the cell carries one. */
  readonly terrain?: string;
}

/** A stage device (crate, blower, …) placed by the level's predefines. */
export interface StageDevice {
  readonly key: string;
  readonly alias: string | null;
  /** Board column (x). */
  readonly x: number;
  /** Board row (y). */
  readonly y: number;
  readonly facing: string;
  readonly role: string | null;
  readonly active: boolean;
  /** Facing-RIGHT attack cells as `[x, y]` (from master's `rangeGrid` [row, col]). */
  readonly attackRange: readonly (readonly [number, number])[];
  /** Skill blackboard for UnitSpec.script (风机气流等). */
  readonly script: Readonly<Record<string, unknown>>;
}

export interface StageMap {
  readonly cols: number;
  readonly rows: number;
  readonly tiles: readonly StageTile[];
  /** Level-wide special blocks (mire / smog / blower.bb …) → BattleSpec.notes.special. */
  readonly special?: Readonly<Record<string, unknown>>;
  readonly devices?: readonly StageDevice[];
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function terrainOf(
  tile: Readonly<Record<string, unknown>>,
): string | undefined {
  if (typeof tile.terrain === 'string' && tile.terrain) {
    return tile.terrain;
  }
  if (typeof tile.special === 'string' && OFFICIAL_TERRAINS.has(tile.special)) {
    return tile.special;
  }
  return undefined;
}

function tileOf(glyph: string, x: number, y: number, spec: unknown): StageTile {
  const tile = isRecord(spec) ? spec : {};
  const walkableBy: ('ground' | 'fly')[] = [];
  if (tile.groundPassable === true) {
    walkableBy.push('ground');
  }
  if (tile.flyPassable === true) {
    walkableBy.push('fly');
  }
  const terrain = terrainOf(tile);
  return {
    x,
    y,
    glyph,
    height: tile.height === 'HIGH' ? 1 : 0,
    deployable: typeof tile.buildable === 'string' && tile.buildable !== 'NONE',
    walkableBy,
    objective: tile.tileKey === 'tile_end',
    ...(terrain ? { terrain } : {}),
  };
}

/** Master rangeGrid cell `[row, col]` → facing-RIGHT `{x: col, y: row}`. */
function attackRangeOf(value: unknown): readonly (readonly [number, number])[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((cell): (readonly [number, number])[] => {
    if (!Array.isArray(cell) || cell.length < 2) {
      return [];
    }
    const row = cell[0];
    const col = cell[1];
    if (typeof row !== 'number' || typeof col !== 'number') {
      return [];
    }
    return [[col, row]];
  });
}

function scriptOf(
  device: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const skill = isRecord(device.skill) ? device.skill : null;
  const bb = skill && isRecord(skill.bb) ? skill.bb : null;
  return bb ? { ...bb } : {};
}

function deviceOf(raw: unknown): StageDevice | null {
  if (!isRecord(raw) || typeof raw.key !== 'string') {
    return null;
  }
  const pos = Array.isArray(raw.pos) ? raw.pos : null;
  const row = pos && typeof pos[0] === 'number' ? pos[0] : null;
  const col = pos && typeof pos[1] === 'number' ? pos[1] : null;
  if (row === null || col === null) {
    return null;
  }
  return {
    key: raw.key,
    alias: typeof raw.alias === 'string' ? raw.alias : null,
    x: col,
    y: row,
    facing: typeof raw.dir === 'string' ? raw.dir : 'RIGHT',
    role: typeof raw.role === 'string' ? raw.role : null,
    active: raw.active !== false && raw.hidden !== true,
    attackRange: attackRangeOf(raw.rangeGrid),
    script: scriptOf(raw),
  };
}

/** The board of a master stage record, or null when it has no rows. */
export function stageMapOf(stage: unknown): StageMap | null {
  if (!isRecord(stage) || !Array.isArray(stage.rows)) {
    return null;
  }
  const lines = stage.rows.filter(
    (line): line is string => typeof line === 'string',
  );
  const cols = Math.max(0, ...lines.map((line) => line.length));
  if (lines.length === 0 || cols === 0) {
    return null;
  }
  const table = isRecord(stage.tiles) ? stage.tiles : {};
  const tiles = lines.flatMap((line, y) =>
    [...line.padEnd(cols, '#')].map((glyph, x) =>
      tileOf(glyph, x, y, table[glyph]),
    ),
  );
  const special = isRecord(stage.special) ? { ...stage.special } : {};
  const devices = Array.isArray(stage.devices)
    ? stage.devices.flatMap((entry) => {
        const device = deviceOf(entry);
        return device ? [device] : [];
      })
    : [];
  return { cols, rows: lines.length, tiles, special, devices };
}
