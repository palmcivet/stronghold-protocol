/**
 * Ground routes baked into stages. Same flow field the client uses: 4-direction SPFA from the goal,
 * crate cost 1000, Bresenham smoothing, then the blockable-ground preference.
 * Row 0 is the bottom. The compiled field is the whole 19×21 map.
 */

const ROWS: number = 19
const COLS: number = 21
const OBSTACLE_COST: number = 1000
const OB_BLOCK: number = 1
const OB_CRATE: number = 2
const FIELD_CACHE_MAX: number = 64
const FOUR_WAYS: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 0], [0, -1]]

interface LegendEntry {
  readonly glyph: string
  readonly key: string
  readonly height: string
  readonly build: string
  readonly pass: string
  readonly terrain: string | null
  readonly special: string | null
}

interface GridRect {
  readonly r0: number
  readonly r1: number
  readonly c0: number
  readonly c1: number
}

interface GroundStage {
  readonly rows?: readonly string[]
  readonly legend?: Readonly<Record<string, any>>
}

interface FlowField {
  dest: number
  dist: Int32Array
  parent: Int32Array
  pen: Int32Array
  next: Int32Array
  official: Int32Array
  cost: Int32Array
  version: number
  allowDiagonal: boolean
  ignore: boolean
}

interface Spfa {
  readonly dist: Int32Array
  readonly parent: Int32Array
  readonly pen: Int32Array
}

const DEFAULT_LEGEND: Readonly<Record<string, Omit<LegendEntry, "glyph">>> = Object.freeze({
  "#": { height: "HIGH", build: "NONE", pass: "FLY", key: "tile_forbidden", terrain: null, special: null },
  X: { height: "HIGH", build: "NONE", pass: "NONE", key: "tile_forbidden", terrain: null, special: null },
  r: { height: "LOW", build: "ALL", pass: "ALL", key: "tile_road", terrain: null, special: null },
  R: { height: "LOW", build: "NONE", pass: "ALL", key: "tile_road", terrain: null, special: null },
  f: { height: "LOW", build: "NONE", pass: "ALL", key: "tile_floor", terrain: null, special: null },
  p: { height: "LOW", build: "NONE", pass: "ALL", key: "tile_floor", terrain: null, special: null },
  h: { height: "HIGH", build: "RANGED", pass: "FLY", key: "tile_wall", terrain: null, special: null },
  b: { height: "LOW", build: "ALL", pass: "FLY", key: "tile_fence_bound", terrain: null, special: null },
  a: { height: "HIGH", build: "NONE", pass: "FLY", key: "tile_achand", terrain: null, special: null },
  A: { height: "HIGH", build: "NONE", pass: "FLY", key: "tile_achand", terrain: null, special: null },
  S: { height: "LOW", build: "NONE", pass: "ALL", key: "tile_start", terrain: null, special: "start" },
  E: { height: "LOW", build: "NONE", pass: "ALL", key: "tile_end", terrain: null, special: "end" },
  I: { height: "LOW", build: "NONE", pass: "ALL", key: "tile_telin", terrain: null, special: "telin" },
  O: { height: "LOW", build: "NONE", pass: "ALL", key: "tile_telout", terrain: null, special: "telout" },
  m: { height: "LOW", build: "ALL", pass: "ALL", key: "tile_mire", terrain: "mire", special: null },
  g: { height: "LOW", build: "ALL", pass: "ALL", key: "tile_smog", terrain: "smog", special: null },
  d: { height: "LOW", build: "NONE", pass: "ALL", key: "tile_deepsea", terrain: "deepsea", special: null },
  i: { height: "LOW", build: "ALL", pass: "ALL", key: "tile_infection", terrain: "infection", special: null },
})

/** Tile keys whose mechanism refuses deployment. 深水区 is the only one. */
export const DEPLOY_REFUSED_TILES: ReadonlySet<string> = Object.freeze(new Set(["tile_deepsea"]))

const TERRAIN_BY_KEY: Readonly<Record<string, string>> = {
  tile_mire: "mire",
  tile_smog: "smog",
  tile_deepsea: "deepsea",
  tile_infection: "infection",
  tile_deepwater: "deepsea",
}
const SPECIAL_BY_KEY: Readonly<Record<string, string>> = {
  tile_start: "start",
  tile_end: "end",
  tile_telin: "telin",
  tile_telout: "telout",
}

const EMPTY_TILE: LegendEntry = Object.freeze({
  glyph: "X",
  key: "tile_forbidden",
  height: "HIGH",
  build: "NONE",
  pass: "NONE",
  terrain: null,
  special: null,
})

function readI32(data: Int32Array, index: number, missing: number): number {
  const value = data[index]
  return value === undefined ? missing : value
}

function readU8(data: Uint8Array, index: number): number {
  return data[index] ?? 0
}

function normPass(value: unknown): string {
  if (value === true) return "ALL"
  if (value === false) return "NONE"
  const text = String(value ?? "").toUpperCase()
  if (text === "ALL" || text === "GROUND" || text === "WALK") return "ALL"
  if (text.includes("FLY")) return "FLY"
  if (text === "NONE" || text === "") return "NONE"
  return "ALL"
}

function normalizeLegendEntry(glyph: string, entry: any): LegendEntry {
  const base = DEFAULT_LEGEND[glyph] ?? { height: "LOW", build: "NONE", pass: "ALL", key: "tile_floor", terrain: null, special: null }
  if (!entry || typeof entry !== "object") return { ...base, glyph }
  const key = entry.tileKey ?? entry.key ?? entry.tile ?? base.key
  const heightRaw = entry.height ?? entry.heightType
  const height = heightRaw == null ? base.height : (/HIGH/i.test(String(heightRaw)) ? "HIGH" : "LOW")
  const buildRaw = entry.build ?? entry.buildable ?? entry.buildableType
  const build = DEPLOY_REFUSED_TILES.has(key) ? "NONE"
    : buildRaw == null ? base.build : (buildRaw === true ? "ALL" : buildRaw === false ? "NONE" : String(buildRaw).toUpperCase())
  let pass: string
  if (entry.pass != null) pass = normPass(entry.pass)
  else if (entry.passable != null || entry.passableMask != null) pass = normPass(entry.passable ?? entry.passableMask)
  else if (entry.groundPassable != null) pass = entry.groundPassable ? "ALL" : (entry.flyPassable === false ? "NONE" : "FLY")
  else pass = base.pass
  const terrain = entry.terrain ?? TERRAIN_BY_KEY[key] ?? base.terrain ?? null
  const special = entry.special ?? SPECIAL_BY_KEY[key] ?? base.special ?? null
  return { glyph, key, height, build, pass, terrain, special }
}

function isBlockableTile(tile: LegendEntry): boolean {
  return tile.height === "LOW" && (tile.build === "ALL" || tile.build === "MELEE")
}

function smoothChains(parent: Int32Array, dist: Int32Array, los: (from: number, to: number) => boolean, begin: ((tile: number) => void) | null): Int32Array {
  const next = new Int32Array(parent)
  for (let tile = 0; tile < parent.length; tile++) {
    if (readI32(dist, tile, -1) < 0 || readI32(next, tile, -1) < 0) continue
    if (begin) begin(tile)
    let pointer = readI32(next, tile, -1)
    while (readI32(next, pointer, -1) >= 0 && los(tile, readI32(next, pointer, -1))) pointer = readI32(next, pointer, -1)
    next[tile] = pointer
  }
  return next
}

function onSegment(start: number, middle: number, end: number): boolean {
  const startRow = (start / COLS) | 0
  const startCol = start - startRow * COLS
  const middleRow = (middle / COLS) | 0
  const middleCol = middle - middleRow * COLS
  const endRow = (end / COLS) | 0
  const endCol = end - endRow * COLS
  return (middleRow - startRow) * (endCol - startCol) === (middleCol - startCol) * (endRow - startRow)
    && (middleRow - startRow) * (endRow - middleRow) + (middleCol - startCol) * (endCol - middleCol) > 0
}

function bresenhamClear(start: number, end: number, clear: (row: number, col: number) => boolean): boolean {
  let row = (start / COLS) | 0
  let col = start - row * COLS
  const endRow = (end / COLS) | 0
  const endCol = end - endRow * COLS
  const rowDelta = Math.abs(endRow - row)
  const colDelta = Math.abs(endCol - col)
  const rowStep = endRow > row ? 1 : -1
  const colStep = endCol > col ? 1 : -1
  let error = colDelta - rowDelta
  if (!clear(row, col)) return false
  while (row !== endRow || col !== endCol) {
    const doubled = 2 * error
    let nextRow = row
    let nextCol = col
    if (doubled > -rowDelta) {
      error -= rowDelta
      nextCol += colStep
    }
    if (doubled < colDelta) {
      error += colDelta
      nextRow += rowStep
    }
    if (nextRow !== row && nextCol !== col && !(clear(nextRow, col) && clear(row, nextCol))) return false
    row = nextRow
    col = nextCol
    if (!clear(row, col)) return false
  }
  return true
}

function segmentClear(start: number, end: number, clear: (row: number, col: number) => boolean): boolean {
  let row = (start / COLS) | 0
  let col = start - row * COLS
  const endRow = (end / COLS) | 0
  const endCol = end - endRow * COLS
  if (row !== endRow && col !== endCol) return false
  const rowStep = Math.sign(endRow - row)
  const colStep = Math.sign(endCol - col)
  if (!clear(row, col)) return false
  while (row !== endRow || col !== endCol) {
    row += rowStep
    col += colStep
    if (!clear(row, col)) return false
  }
  return true
}

function bresenhamTiles(from: readonly [number, number], to: readonly [number, number]): number[][] {
  let row = from[0]
  let col = from[1]
  const endRow = to[0]
  const endCol = to[1]
  const rowDelta = Math.abs(endRow - row)
  const colDelta = Math.abs(endCol - col)
  const rowStep = endRow > row ? 1 : -1
  const colStep = endCol > col ? 1 : -1
  let error = colDelta - rowDelta
  const out: number[][] = [[row, col]]
  let guard = 256
  while ((row !== endRow || col !== endCol) && guard-- > 0) {
    const doubled = 2 * error
    if (doubled > -rowDelta) {
      error -= rowDelta
      col += colStep
    }
    if (doubled < colDelta) {
      error += colDelta
      row += rowStep
    }
    out.push([row, col])
  }
  return out
}

function crossTiles(start: number, end: number, visit: (row: number, col: number) => boolean | undefined): boolean {
  let row = (start / COLS) | 0
  let col = start - row * COLS
  const endRow = (end / COLS) | 0
  const endCol = end - endRow * COLS
  const rowDelta = Math.abs(endRow - row)
  const colDelta = Math.abs(endCol - col)
  const rowStep = endRow > row ? 1 : -1
  const colStep = endCol > col ? 1 : -1
  if (visit(row, col) === false) return false
  for (let colBoundary = 1, rowBoundary = 1; row !== endRow || col !== endCol;) {
    const colTime = colBoundary <= colDelta ? (2 * colBoundary - 1) * rowDelta : Infinity
    const rowTime = rowBoundary <= rowDelta ? (2 * rowBoundary - 1) * colDelta : Infinity
    if (colTime === rowTime) {
      col += colStep
      row += rowStep
      colBoundary++
      rowBoundary++
    } else if (colTime < rowTime) {
      col += colStep
      colBoundary++
    } else {
      row += rowStep
      rowBoundary++
    }
    if (visit(row, col) === false) return false
  }
  return true
}

function pairOf(point: readonly number[]): [number, number] | null {
  const row = point[0]
  const col = point[1]
  if (typeof row !== "number" || typeof col !== "number") return null
  return [row, col]
}

class Grid {
  private readonly rect: GridRect
  private readonly tiles: LegendEntry[]
  private readonly unblockable: Uint8Array
  private readonly obstacle: Uint8Array
  private version: number
  private readonly fields: Map<string, FlowField>

  constructor(stage: GroundStage, rect: GridRect) {
    this.rect = rect
    this.tiles = new Array(ROWS * COLS)
    const rows = Array.isArray(stage.rows) ? stage.rows : []
    const legend = stage.legend || {}
    const cache = new Map<string, LegendEntry>()
    const info = (glyph: string): LegendEntry => {
      const cached = cache.get(glyph)
      if (cached) return cached
      const entry = Object.freeze(normalizeLegendEntry(glyph, legend[glyph]))
      cache.set(glyph, entry)
      return entry
    }
    for (let row = 0; row < ROWS; row++) {
      const raw = rows[row]
      const line = typeof raw === "string" ? raw : ""
      for (let col = 0; col < COLS; col++) {
        const glyph = line[col]
        this.tiles[row * COLS + col] = glyph ? info(glyph) : EMPTY_TILE
      }
    }
    this.unblockable = new Uint8Array(ROWS * COLS)
    for (let index = 0; index < ROWS * COLS; index++) {
      const tile = this.tiles[index] ?? EMPTY_TILE
      this.unblockable[index] = tile.pass === "ALL" && !isBlockableTile(tile) ? 1 : 0
    }
    this.obstacle = new Uint8Array(ROWS * COLS)
    this.version = 0
    this.fields = new Map()
  }

  private inBounds(row: number, col: number): boolean {
    return row >= 0 && row < ROWS && col >= 0 && col < COLS
  }

  private inRect(row: number, col: number): boolean {
    return row >= this.rect.r0 && row <= this.rect.r1 && col >= this.rect.c0 && col <= this.rect.c1
  }

  private walkable(row: number, col: number, ignoreObstacles: boolean): boolean {
    if (!this.inRect(row, col)) return false
    const index = row * COLS + col
    const tile = this.tiles[index]
    if (!tile || tile.pass !== "ALL") return false
    return ignoreObstacles || (readU8(this.obstacle, index) & OB_BLOCK) === 0
  }

  setObstacle(row: number, col: number, on: boolean, kind = "block"): void {
    if (!this.inBounds(row, col)) return
    const index = row * COLS + col
    const bit = kind === "crate" ? OB_CRATE : OB_BLOCK
    const current = readU8(this.obstacle, index)
    const next = on ? (current | bit) : (current & ~bit)
    if (current === next) return
    this.obstacle[index] = next
    this.version++
    this.fields.clear()
  }

  private flowField(endRow: number, endCol: number, allowDiagonal: boolean, ignoreObstacles: boolean): FlowField {
    const row = endRow | 0
    const col = endCol | 0
    const key = `${row},${col},${allowDiagonal ? 1 : 0},${ignoreObstacles ? 1 : 0}`
    const cached = this.fields.get(key)
    if (cached) return cached
    const field = this.buildField(row, col, allowDiagonal, ignoreObstacles)
    if (this.fields.size >= FIELD_CACHE_MAX) {
      const oldest = this.fields.keys().next().value
      if (oldest !== undefined) this.fields.delete(oldest)
    }
    this.fields.set(key, field)
    return field
  }

  // MARK: flow field
  private buildField(endRow: number, endCol: number, allowDiagonal: boolean, ignore: boolean): FlowField {
    const count = ROWS * COLS
    const field: FlowField = {
      dest: -1,
      dist: new Int32Array(count),
      parent: new Int32Array(count),
      pen: new Int32Array(count),
      next: new Int32Array(count),
      official: new Int32Array(count),
      cost: new Int32Array(count),
      version: this.version,
      allowDiagonal,
      ignore,
    }
    if (!this.inBounds(endRow, endCol)) {
      const none = new Int32Array(count).fill(-1)
      field.dist = none
      field.parent = none
      field.next = none
      field.official = none
      field.pen = new Int32Array(count)
      field.cost = new Int32Array(count)
      return field
    }
    const dest = endRow * COLS + endCol
    field.dest = dest
    const unblockable = this.unblockable
    const official = this.spfa(dest, ignore, null)
    const preference = this.spfa(dest, ignore, unblockable)
    const dist = preference.dist
    const walk = (row: number, col: number): boolean =>
      this.walkable(row, col, ignore) && (ignore || (readU8(this.obstacle, row * COLS + col) & OB_CRATE) === 0)
    const ray = allowDiagonal ? bresenhamClear : segmentClear
    const nextOfficial = smoothChains(official.parent, dist, (from, to) => ray(from, to, walk), null)
    const onChain = new Int32Array(count).fill(-1)
    let fromTile = -1
    let toTile = -1
    const walkPreference = (row: number, col: number): boolean => {
      if (!walk(row, col)) return false
      const index = row * COLS + col
      return readU8(unblockable, index) === 0 || (readI32(onChain, index, -1) === fromTile && readI32(dist, index, -1) >= readI32(dist, toTile, -1))
    }
    const nextPreference = smoothChains(preference.parent, dist, (from, to) => {
      fromTile = from
      toTile = to
      return ray(from, to, walkPreference)
    }, (tile) => {
      for (let cursor = tile, guard = count; cursor >= 0 && guard-- > 0; cursor = readI32(preference.parent, cursor, -1)) onChain[cursor] = tile
    })
    const order: number[] = []
    for (let index = 0; index < count; index++) if (readI32(dist, index, -1) >= 0) order.push(index)
    order.sort((left, right) => readI32(dist, left, -1) - readI32(dist, right, -1) || left - right)
    const through = (start: number, end: number): number => {
      let crossed = -readU8(unblockable, start)
      crossTiles(start, end, (row, col) => {
        crossed += readU8(unblockable, row * COLS + col)
      })
      return crossed
    }
    const next = new Int32Array(count).fill(-1)
    const cost = new Int32Array(count)
    for (const tile of order) {
      const officialPointer = readI32(nextOfficial, tile, -1)
      const preferencePointer = readI32(nextPreference, tile, -1)
      if (officialPointer < 0) continue
      let use = officialPointer
      let best = through(tile, officialPointer) + readI32(cost, officialPointer, 0)
      if (preferencePointer >= 0 && preferencePointer !== officialPointer) {
        const preferenceCost = through(tile, preferencePointer) + readI32(cost, preferencePointer, 0)
        if (preferenceCost < best || (preferenceCost === best && readI32(next, officialPointer, -1) === preferencePointer && onSegment(tile, officialPointer, preferencePointer))) {
          use = preferencePointer
          best = preferenceCost
        }
      }
      next[tile] = use
      cost[tile] = best
    }
    field.dist = dist
    field.parent = preference.parent
    field.pen = preference.pen
    field.next = next
    field.official = nextOfficial
    field.cost = cost
    return field
  }

  private spfa(dest: number, ignore: boolean, penalty: Uint8Array | null): Spfa {
    const count = ROWS * COLS
    const dist = new Int32Array(count).fill(-1)
    const parent = new Int32Array(count).fill(-1)
    const pen = new Int32Array(count)
    const queued = new Uint8Array(count)
    const queue = new Int32Array(count * 4 + 8)
    let head = 0
    let tail = 0
    const push = (tile: number): void => {
      if (tail >= queue.length) {
        queue.copyWithin(0, head, tail)
        tail -= head
        head = 0
      }
      queue[tail++] = tile
    }
    dist[dest] = 0
    push(dest)
    queued[dest] = 1
    while (head < tail) {
      const current = readI32(queue, head++, 0)
      queued[current] = 0
      const row = (current / COLS) | 0
      const col = current - row * COLS
      for (const step of FOUR_WAYS) {
        const nextRow = row + step[0]
        const nextCol = col + step[1]
        if (!this.walkable(nextRow, nextCol, ignore)) continue
        const neighbor = nextRow * COLS + nextCol
        const stepCost = !ignore && (readU8(this.obstacle, neighbor) & OB_CRATE) !== 0 ? OBSTACLE_COST : 1
        const nextDist = readI32(dist, current, -1) + stepCost
        const nextPen = penalty ? readI32(pen, current, 0) + readU8(penalty, neighbor) : 0
        const known = readI32(dist, neighbor, -1)
        if (known < 0 || nextDist < known || (nextDist === known && nextPen < readI32(pen, neighbor, 0))) {
          dist[neighbor] = nextDist
          pen[neighbor] = nextPen
          parent[neighbor] = current
          if (readU8(queued, neighbor) === 0) {
            push(neighbor)
            queued[neighbor] = 1
          }
        }
      }
    }
    return { dist, parent, pen }
  }

  private waypoints(startRow: number, startCol: number, endRow: number, endCol: number): number[][] | null {
    if (!this.inBounds(startRow, startCol) || !this.inBounds(endRow, endCol)) return null
    const start = startRow * COLS + startCol
    const goal = endRow * COLS + endCol
    if (start === goal) return [[startRow, startCol]]
    const field = this.flowField(endRow, endCol, true, false)
    if (readI32(field.dist, start, -1) < 0) return null
    const out: number[][] = [[startRow, startCol]]
    let cursor = start
    let guard = ROWS * COLS
    while (cursor !== goal && guard-- > 0) {
      cursor = readI32(field.next, cursor, -1)
      if (cursor < 0) return null
      out.push([(cursor / COLS) | 0, cursor % COLS])
    }
    return out
  }

  findPath(startRow: number, startCol: number, endRow: number, endCol: number): number[][] | null {
    const waypoints = this.waypoints(startRow, startCol, endRow, endCol)
    if (!waypoints) return null
    const first = waypoints[0]
    if (!first) return null
    const out: number[][] = [first]
    for (let index = 1; index < waypoints.length; index++) {
      const previous = waypoints[index - 1]
      const current = waypoints[index]
      if (!previous || !current) return null
      const from = pairOf(previous)
      const to = pairOf(current)
      if (!from || !to) return null
      const segment = bresenhamTiles(from, to)
      for (let step = 1; step < segment.length; step++) {
        const tile = segment[step]
        if (tile) out.push(tile)
      }
    }
    return out
  }
}

export interface GroundDevice {
  readonly pos: readonly number[] | null
  readonly role: string | null
}

/** Tiles an enemy crosses from `start` to `end`, including both ends. Crates cost 1000; other devices block. */
export function findGroundPath(stage: GroundStage, devices: readonly GroundDevice[], start: readonly number[], end: readonly number[]): number[][] | null {
  const grid = new Grid(stage, { r0: 0, r1: 18, c0: 0, c1: 20 })
  for (const device of devices) {
    if (!device.pos) continue
    const row = device.pos[0]
    const col = device.pos[1]
    if (typeof row !== "number" || typeof col !== "number") continue
    if (device.role === "crate") grid.setObstacle(row, col, true, "crate")
    else grid.setObstacle(row, col, true)
  }
  const startPair = pairOf(start)
  const endPair = pairOf(end)
  if (!startPair || !endPair) return null
  return grid.findPath(startPair[0], startPair[1], endPair[0], endPair[1])
}
