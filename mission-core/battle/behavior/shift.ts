import type { Motion } from "#contract/spec.js"
import type { Random } from "#random/index.js"
import type { FieldGrid } from "#battle/space/grid/index.js"
import type { GridPoint } from "#battle/space/grid/sight.js"

/** 恐惧扇形半径。 */
export const FEAR_RADIUS = 10
/** 扇形半角的余弦。 */
export const FEAR_HALF_COS: number = Math.SQRT1_2
/** 检查点最远的四向步数。 */
export const FEAR_REACH = 5
/** 检查点周围随机偏移正方形的边长。 */
export const FEAR_JITTER = 0.5

export interface FearMove {
  readonly key: string
  readonly goal: GridPoint
  readonly points: readonly GridPoint[]
}

function passable(grid: FieldGrid, fly: boolean, x: number, y: number): boolean {
  return fly ? grid.flyPassable(x, y) : grid.walkable(x, y, true)
}

function openTile(grid: FieldGrid, fly: boolean, x: number, y: number): boolean {
  return passable(grid, fly, x, y) && (fly || !grid.isObstacle(x, y))
}

function hereOf(grid: FieldGrid, x: number, y: number): GridPoint {
  return {
    x: Math.max(grid.rect.x0, Math.min(grid.rect.x1, Math.round(x))),
    y: Math.max(grid.rect.y0, Math.min(grid.rect.y1, Math.round(y))),
  }
}

/**
 * 恐惧可达地块，按行从下到上、列从左到右。
 * 自身、没有来源或来源就在受击点上时没有可达格。
 */
export function fearReachableTiles(
  grid: FieldGrid,
  motion: Motion,
  hitX: number,
  hitY: number,
  sourceX: number,
  sourceY: number,
  selfFear: boolean,
  goal: GridPoint | null,
): readonly string[] {
  if (selfFear) return []
  const dx = hitX - sourceX
  const dy = hitY - sourceY
  const length = Math.hypot(dx, dy)
  if (!(length > 1e-9)) return []
  const ux = dx / length
  const uy = dy / length
  const fly = motion === "FLY"
  const goalField = !fly && goal ? grid.flowField(goal.x, goal.y) : null
  const goalFieldOpen = !fly && goal ? grid.flowField(goal.x, goal.y, { ignoreObstacles: true }) : null
  const out: string[] = []
  for (let y = grid.rect.y0; y <= grid.rect.y1; y += 1) {
    for (let x = grid.rect.x0; x <= grid.rect.x1; x += 1) {
      const vx = x - hitX
      const vy = y - hitY
      const reach = Math.hypot(vx, vy)
      if (reach > FEAR_RADIUS + 1e-9) continue
      if (reach > 1e-9 && vx * ux + vy * uy < FEAR_HALF_COS * reach - 1e-9) continue
      if (!passable(grid, fly, x, y) || grid.at(x, y)?.objective) continue
      if (goalField && goalFieldOpen) {
        const key = grid.key(x, y)
        if ((goalField.dist[key] ?? -1) < 0 && (goalFieldOpen.dist[key] ?? -1) < 0) continue
      }
      out.push(`${x},${y}`)
    }
  }
  return out
}

/** 四向步数。超过 limit，或终点不能站，返回 Infinity。 */
export function fearSteps(
  grid: FieldGrid,
  motion: Motion,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  limit: number,
): number {
  if (fromX === toX && fromY === toY) return 0
  const fly = motion === "FLY"
  if (!openTile(grid, fly, toX, toY)) return Infinity
  let frontier = [`${fromX},${fromY}`]
  const seen = new Set(frontier)
  for (let distance = 1; distance <= limit && frontier.length > 0; distance += 1) {
    const next: string[] = []
    for (const key of frontier) {
      const [colText, rowText] = key.split(",")
      const x = Number(colText)
      const y = Number(rowText)
      for (const [dRow, dCol] of [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ] as const) {
        const nextX = x + dCol
        const nextY = y + dRow
        if (!grid.inBounds(nextX, nextY)) continue
        const nextKey = `${nextX},${nextY}`
        if (seen.has(nextKey)) continue
        if (nextX === toX && nextY === toY) return distance
        seen.add(nextKey)
        if (openTile(grid, fly, nextX, nextY)) next.push(nextKey)
      }
    }
    frontier = next
  }
  return Infinity
}

function planFearPath(
  grid: FieldGrid,
  motion: Motion,
  x: number,
  y: number,
  tileX: number,
  tileY: number,
  goal: GridPoint,
): GridPoint[] | null {
  const here = hereOf(grid, x, y)
  const points: GridPoint[] = []
  if (motion !== "FLY" && (tileX !== here.x || tileY !== here.y)) {
    if (!openTile(grid, false, tileX, tileY)) return null
    const waypoints = grid.waypoints(here.x, here.y, tileX, tileY)
    if (!waypoints) return null
    for (let index = 1; index < waypoints.length - 1; index += 1) {
      const point = waypoints[index]
      if (point) points.push(point)
    }
    const first = points[0] ?? { x: tileX, y: tileY }
    if ((x !== here.x || y !== here.y) && !grid.straightClear(x, y, first)) points.unshift({ x: here.x, y: here.y })
  }
  points.push(goal)
  return points
}

/**
 * 在可达格里抽一个 5 步内的检查点，否则留在自己的格子。
 * 抽中太远的格子会从列表里去掉。
 */
export function planFearMove(
  grid: FieldGrid,
  motion: Motion,
  x: number,
  y: number,
  tiles: string[],
  random: Random,
): FearMove {
  const here = hereOf(grid, x, y)
  let tileX = here.x
  let tileY = here.y
  if (tiles.length > 0) {
    const index = Math.floor(random() * tiles.length)
    const candidate = tiles[index]
    if (candidate) {
      const [colText, rowText] = candidate.split(",")
      const candX = Number(colText)
      const candY = Number(rowText)
      if (fearSteps(grid, motion, here.x, here.y, candX, candY, FEAR_REACH) <= FEAR_REACH) {
        tileX = candX
        tileY = candY
      } else tiles.splice(index, 1)
    }
  }
  const offsetX = (random() - 0.5) * FEAR_JITTER
  const offsetY = (random() - 0.5) * FEAR_JITTER
  const aim = (aimX: number, aimY: number): GridPoint[] | null =>
    planFearPath(grid, motion, x, y, aimX, aimY, { x: aimX + offsetX, y: aimY + offsetY })
  let planned = aim(tileX, tileY)
  if (!planned) {
    tileX = here.x
    tileY = here.y
    planned = aim(tileX, tileY) ?? [{ x: tileX + offsetX, y: tileY + offsetY }]
  }
  return {
    key: `${tileX},${tileY}`,
    goal: { x: tileX + offsetX, y: tileY + offsetY },
    points: planned,
  }
}

/** 诱导：地面走流场，走不通时忽略障碍再找；飞行直线到目标点。 */
export function attractPoints(grid: FieldGrid, motion: Motion, x: number, y: number, targetX: number, targetY: number): GridPoint[] {
  if (motion === "FLY") return [{ x: targetX, y: targetY }]
  const startX = Math.round(x)
  const startY = Math.round(y)
  const path =
    grid.waypoints(startX, startY, targetX, targetY) ??
    grid.waypoints(startX, startY, targetX, targetY, { ignoreObstacles: true })
  if (!path) return [{ x: targetX, y: targetY }]
  const points: GridPoint[] = []
  for (let index = 0; index < path.length; index += 1) {
    const point = path[index]
    if (!point) continue
    if (index === 0 && Math.abs(x - point.x) < 1e-6 && Math.abs(y - point.y) < 1e-6) continue
    points.push(point)
  }
  return points.length > 0 ? points : [{ x: targetX, y: targetY }]
}
