import type { TileSpec } from "#contract/spec.js"
import { OB_BLOCK, OB_CRATE, buildField, fieldLength, type FieldSource, type FlowField } from "#battle/space/grid/field.js"
import { allowsFly, allowsGround } from "#battle/space/grid/pass.js"
import { bresenhamTiles, straightClear, type GridPoint } from "#battle/space/grid/sight.js"

export type { FlowField } from "#battle/space/grid/field.js"
export type { GridPoint } from "#battle/space/grid/sight.js"

export interface GridRect {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

export interface FieldOptions {
  readonly allowDiagonal?: boolean
  readonly ignoreObstacles?: boolean
}

export interface FieldGrid extends FieldSource {
  readonly rect: GridRect
  flyPassable(x: number, y: number): boolean
  groundPassable(x: number, y: number, ignoreObstacles?: boolean): boolean
  at(x: number, y: number): TileSpec | null
  setObstacle(x: number, y: number, on: boolean, kind?: "block" | "crate"): void
  isObstacle(x: number, y: number): boolean
  isCrate(x: number, y: number): boolean
  isBlocked(x: number, y: number): boolean
  flowField(x: number, y: number, options?: FieldOptions): FlowField
  fieldLength(field: FlowField, key: number): number
  waypoints(x0: number, y0: number, x1: number, y1: number, options?: FieldOptions): GridPoint[] | null
  findPath(x0: number, y0: number, x1: number, y1: number, options?: FieldOptions): GridPoint[] | null
  straightClear(x: number, y: number, point: GridPoint): boolean
}

const FIELD_CACHE_MAX = 64

export function createGrid(tiles: readonly TileSpec[], span: readonly GridPoint[] = []): FieldGrid {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  const consider = (x: number, y: number): void => {
    const col = Math.round(x)
    const row = Math.round(y)
    if (col < minX) minX = col
    if (col > maxX) maxX = col
    if (row < minY) minY = row
    if (row > maxY) maxY = row
  }
  for (const tile of tiles) consider(tile.x, tile.y)
  for (const point of span) consider(point.x, point.y)
  const empty = !Number.isFinite(minX)
  const originX = empty ? 0 : minX
  const originY = empty ? 0 : minY
  const cols = empty ? 0 : maxX - minX + 1
  const rows = empty ? 0 : maxY - minY + 1
  const count = cols * rows
  const rect: GridRect = empty
    ? { x0: 0, y0: 0, x1: -1, y1: -1 }
    : { x0: originX, y0: originY, x1: originX + cols - 1, y1: originY + rows - 1 }
  const specs = new Array<TileSpec | null>(count).fill(null)
  const ground = new Uint8Array(count)
  const fly = new Uint8Array(count)
  const unblockable = new Uint8Array(count)
  const obstacle = new Uint8Array(count)
  const placed = new Map<string, TileSpec>()
  for (const tile of tiles) placed.set(`${Math.round(tile.x)},${Math.round(tile.y)}`, tile)
  for (const [key, tile] of placed) {
    const [colText, rowText] = key.split(",")
    const x = Number(colText)
    const y = Number(rowText)
    const index = (y - originY) * cols + (x - originX)
    specs[index] = tile
    const walks = allowsGround(tile.walkableBy)
    const flies = allowsFly(tile.walkableBy)
    ground[index] = walks ? 1 : 0
    fly[index] = flies ? 1 : 0
    const blockable = walks && tile.deployable && tile.height <= 0
    unblockable[index] = walks && !blockable ? 1 : 0
  }

  let version = 0
  const fields = new Map<string, FlowField>()

  const inBounds = (x: number, y: number): boolean =>
    Number.isInteger(x) && Number.isInteger(y) && x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1

  const keyOf = (x: number, y: number): number => {
    if (!inBounds(x, y)) return -1
    return (y - originY) * cols + (x - originX)
  }

  const pointOf = (key: number): GridPoint => {
    const row = cols === 0 ? 0 : (key / cols) | 0
    const col = cols === 0 ? 0 : key - row * cols
    return { x: col + originX, y: row + originY }
  }

  const bits = (x: number, y: number): number => {
    const key = keyOf(x, y)
    if (key < 0) return 0
    return obstacle[key] ?? 0
  }

  const grid: FieldGrid = {
    cols,
    rows,
    originX,
    originY,
    rect,
    unblockable,
    obstacle,
    get version() {
      return version
    },
    inBounds,
    key: keyOf,
    point: pointOf,
    at(x, y) {
      const key = keyOf(Math.round(x), Math.round(y))
      if (key < 0) return null
      return specs[key] ?? null
    },
    walkable(x, y, ignoreObstacles = false) {
      const key = keyOf(x, y)
      if (key < 0 || ground[key] !== 1) return false
      return ignoreObstacles || ((obstacle[key] ?? 0) & OB_BLOCK) === 0
    },
    groundPassable(x, y, ignoreObstacles = false) {
      const key = keyOf(x, y)
      if (key < 0 || ground[key] !== 1) return false
      return ignoreObstacles || (obstacle[key] ?? 0) === 0
    },
    flyPassable(x, y) {
      const key = keyOf(x, y)
      return key >= 0 && fly[key] === 1
    },
    setObstacle(x, y, on, kind = "block") {
      const key = keyOf(x, y)
      if (key < 0) return
      const bit = kind === "crate" ? OB_CRATE : OB_BLOCK
      const current = obstacle[key] ?? 0
      const next = on ? current | bit : current & ~bit
      if (current === next) return
      obstacle[key] = next
      version += 1
      fields.clear()
    },
    isObstacle(x, y) {
      return bits(x, y) !== 0
    },
    isCrate(x, y) {
      return (bits(x, y) & OB_CRATE) !== 0
    },
    isBlocked(x, y) {
      return (bits(x, y) & OB_BLOCK) !== 0
    },
    flowField(x, y, options) {
      const allowDiagonal = options?.allowDiagonal ?? true
      const ignoreObstacles = options?.ignoreObstacles ?? false
      const cacheKey = `${x},${y},${allowDiagonal ? 1 : 0},${ignoreObstacles ? 1 : 0}`
      const cached = fields.get(cacheKey)
      if (cached) return cached
      const built = buildField(grid, x, y, allowDiagonal, ignoreObstacles)
      if (fields.size >= FIELD_CACHE_MAX) {
        const oldest = fields.keys().next().value
        if (oldest !== undefined) fields.delete(oldest)
      }
      fields.set(cacheKey, built)
      return built
    },
    fieldLength(field, key) {
      return fieldLength(grid, field, key)
    },
    waypoints(x0, y0, x1, y1, options) {
      if (!inBounds(x0, y0) || !inBounds(x1, y1)) return null
      const start = keyOf(x0, y0)
      const goal = keyOf(x1, y1)
      if (start === goal) return [{ x: x0, y: y0 }]
      const field = grid.flowField(x1, y1, options)
      if ((field.dist[start] ?? -1) < 0) return null
      const out: GridPoint[] = [{ x: x0, y: y0 }]
      let cursor = start
      let guard = count
      while (cursor !== goal && guard > 0) {
        guard -= 1
        cursor = field.next[cursor] ?? -1
        if (cursor < 0) return null
        out.push(pointOf(cursor))
      }
      return cursor === goal ? out : null
    },
    findPath(x0, y0, x1, y1, options) {
      const points = grid.waypoints(x0, y0, x1, y1, options)
      if (!points) return null
      const out: GridPoint[] = []
      const first = points[0]
      if (!first) return null
      out.push(first)
      for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1]
        const current = points[index]
        if (!previous || !current) continue
        const segment = bresenhamTiles(previous, current)
        for (let step = 1; step < segment.length; step += 1) {
          const tile = segment[step]
          if (tile) out.push(tile)
        }
      }
      return out
    },
    straightClear(x, y, point) {
      return straightClear(
        (tileX, tileY) => grid.walkable(tileX, tileY, false),
        (tileX, tileY) => grid.isCrate(tileX, tileY),
        x,
        y,
        point,
        4 * Math.max(cols, rows, 1),
      )
    },
  }
  return grid
}
