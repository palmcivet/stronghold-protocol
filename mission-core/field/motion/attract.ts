import type { Motion } from "#contract/spec.js"
import type { FieldGrid } from "#field/grid/index.js"
import type { GridPoint } from "#field/grid/sight.js"

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
