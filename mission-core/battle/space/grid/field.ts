import { bresenhamClear, crossTiles, onSegment, segmentClear, type GridPoint } from "#battle/space/grid/sight.js"

/** 箱子的移动代价。 */
export const OBSTACLE_COST = 1000
export const OB_BLOCK = 1
export const OB_CRATE = 2

const FOUR_WAYS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
]

export interface FlowField {
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
  len: Float64Array | null
}

export interface FieldSource {
  readonly cols: number
  readonly rows: number
  readonly originX: number
  readonly originY: number
  readonly unblockable: Uint8Array
  readonly obstacle: Uint8Array
  readonly version: number
  inBounds(x: number, y: number): boolean
  walkable(x: number, y: number, ignoreObstacles: boolean): boolean
  key(x: number, y: number): number
  point(key: number): GridPoint
}

interface Spfa {
  readonly dist: Int32Array
  readonly parent: Int32Array
  readonly pen: Int32Array
}

// MARK: 流场

export function buildField(source: FieldSource, destX: number, destY: number, allowDiagonal: boolean, ignore: boolean): FlowField {
  const count = source.rows * source.cols
  const field: FlowField = {
    dest: -1,
    dist: new Int32Array(count).fill(-1),
    parent: new Int32Array(count).fill(-1),
    pen: new Int32Array(count),
    next: new Int32Array(count).fill(-1),
    official: new Int32Array(count).fill(-1),
    cost: new Int32Array(count),
    version: source.version,
    allowDiagonal,
    ignore,
    len: null,
  }
  if (!source.inBounds(destX, destY) || count === 0) return field
  const dest = source.key(destX, destY)
  field.dest = dest
  const official = spfa(source, dest, ignore, null)
  const preferred = spfa(source, dest, ignore, source.unblockable)
  const dist = preferred.dist
  const walk = (x: number, y: number): boolean =>
    source.walkable(x, y, ignore) && (ignore || (obstacleBit(source, x, y) & OB_CRATE) === 0)
  const ray = (from: number, to: number, clear: (x: number, y: number) => boolean): boolean => {
    const start = source.point(from)
    const goal = source.point(to)
    return allowDiagonal
      ? bresenhamClear(start.x, start.y, goal.x, goal.y, clear)
      : segmentClear(start.x, start.y, goal.x, goal.y, clear)
  }
  const nextOfficial = smoothChains(official.parent, dist, (from, to) => ray(from, to, walk), null)
  const onChain = new Int32Array(count).fill(-1)
  let fromKey = -1
  let toKey = -1
  const walkPreferred = (x: number, y: number): boolean => {
    if (!walk(x, y)) return false
    const key = source.key(x, y)
    const penalty = key >= 0 ? (source.unblockable[key] ?? 0) : 0
    return penalty === 0 || (onChain[key] === fromKey && (dist[key] ?? -1) >= (dist[toKey] ?? -1))
  }
  const nextPreferred = smoothChains(
    preferred.parent,
    dist,
    (from, to) => {
      fromKey = from
      toKey = to
      return ray(from, to, walkPreferred)
    },
    (tile) => {
      for (let cursor = tile, guard = count; cursor >= 0 && guard > 0; guard -= 1) {
        onChain[cursor] = tile
        cursor = preferred.parent[cursor] ?? -1
      }
    },
  )
  const order: number[] = []
  for (let key = 0; key < count; key += 1) if ((dist[key] ?? -1) >= 0) order.push(key)
  order.sort((left, right) => (dist[left] ?? 0) - (dist[right] ?? 0) || left - right)
  const through = (from: number, to: number): number => {
    const start = source.point(from)
    const goal = source.point(to)
    let crossed = -(source.unblockable[from] ?? 0)
    crossTiles(start.x, start.y, goal.x, goal.y, (x, y) => {
      const key = source.key(x, y)
      if (key >= 0) crossed += source.unblockable[key] ?? 0
    })
    return crossed
  }
  const next = new Int32Array(count).fill(-1)
  const cost = new Int32Array(count)
  for (const key of order) {
    const officialNext = nextOfficial[key] ?? -1
    const preferredNext = nextPreferred[key] ?? -1
    if (officialNext < 0) continue
    let use = officialNext
    let best = through(key, officialNext) + (cost[officialNext] ?? 0)
    if (preferredNext >= 0 && preferredNext !== officialNext) {
      const preferredCost = through(key, preferredNext) + (cost[preferredNext] ?? 0)
      const officialPoint = source.point(officialNext)
      const preferredPoint = source.point(preferredNext)
      const here = source.point(key)
      const skipsOfficial =
        (next[officialNext] ?? -1) === preferredNext &&
        onSegment(here.x, here.y, officialPoint.x, officialPoint.y, preferredPoint.x, preferredPoint.y)
      if (preferredCost < best || (preferredCost === best && skipsOfficial)) {
        use = preferredNext
        best = preferredCost
      }
    }
    next[key] = use
    cost[key] = best
  }
  field.dist = dist
  field.parent = preferred.parent
  field.pen = preferred.pen
  field.next = next
  field.official = nextOfficial
  field.cost = cost
  return field
}

function obstacleBit(source: FieldSource, x: number, y: number): number {
  const key = source.key(x, y)
  if (key < 0) return 0
  return source.obstacle[key] ?? 0
}

function spfa(source: FieldSource, dest: number, ignore: boolean, penalty: Uint8Array | null): Spfa {
  const count = source.rows * source.cols
  const dist = new Int32Array(count).fill(-1)
  const parent = new Int32Array(count).fill(-1)
  const pen = new Int32Array(count)
  const queued = new Uint8Array(count)
  const queue = new Int32Array(count * 4 + 8)
  let head = 0
  let tail = 0
  const push = (key: number): void => {
    if (tail >= queue.length) {
      queue.copyWithin(0, head, tail)
      tail -= head
      head = 0
    }
    queue[tail] = key
    tail += 1
  }
  dist[dest] = 0
  push(dest)
  queued[dest] = 1
  while (head < tail) {
    const current = queue[head] ?? 0
    head += 1
    queued[current] = 0
    const here = source.point(current)
    for (const [dRow, dCol] of FOUR_WAYS) {
      const nextX = here.x + dCol
      const nextY = here.y + dRow
      if (!source.walkable(nextX, nextY, ignore)) continue
      const neighbor = source.key(nextX, nextY)
      if (neighbor < 0) continue
      const step = !ignore && ((source.obstacle[neighbor] ?? 0) & OB_CRATE) !== 0 ? OBSTACLE_COST : 1
      const nextDist = (dist[current] ?? 0) + step
      const nextPen = penalty ? (pen[current] ?? 0) + (penalty[neighbor] ?? 0) : 0
      const known = dist[neighbor] ?? -1
      if (known < 0 || nextDist < known || (nextDist === known && nextPen < (pen[neighbor] ?? 0))) {
        dist[neighbor] = nextDist
        pen[neighbor] = nextPen
        parent[neighbor] = current
        if (queued[neighbor] === 0) {
          push(neighbor)
          queued[neighbor] = 1
        }
      }
    }
  }
  return { dist, parent, pen }
}

// MARK: 平滑

function smoothChains(
  parent: Int32Array,
  dist: Int32Array,
  los: (from: number, to: number) => boolean,
  begin: ((tile: number) => void) | null,
): Int32Array {
  const next = new Int32Array(parent)
  for (let tile = 0; tile < parent.length; tile += 1) {
    if ((dist[tile] ?? -1) < 0 || (next[tile] ?? -1) < 0) continue
    if (begin) begin(tile)
    let cursor = next[tile] ?? -1
    while ((next[cursor] ?? -1) >= 0 && los(tile, next[cursor] ?? -1)) cursor = next[cursor] ?? -1
    next[tile] = cursor
  }
  return next
}

/** 平滑路线从 key 到终点的几何长度。 */
export function fieldLength(source: FieldSource, field: FlowField, key: number): number {
  if (!field || key < 0 || (field.dist[key] ?? -1) < 0) return Infinity
  const count = source.rows * source.cols
  if (!field.len) field.len = new Float64Array(count).fill(-1)
  const lengths = field.len
  const stack: number[] = []
  let cursor = key
  while (cursor >= 0 && (lengths[cursor] ?? -1) < 0) {
    if (cursor === field.dest || (field.next[cursor] ?? -1) < 0) {
      lengths[cursor] = 0
      break
    }
    stack.push(cursor)
    cursor = field.next[cursor] ?? -1
    if (stack.length > count) return Infinity
  }
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const from = stack[index]
    if (from === undefined) continue
    const to = field.next[from] ?? -1
    if (to < 0) continue
    const start = source.point(from)
    const goal = source.point(to)
    lengths[from] = (lengths[to] ?? 0) + Math.hypot(goal.y - start.y, goal.x - start.x)
  }
  return lengths[key] ?? Infinity
}
