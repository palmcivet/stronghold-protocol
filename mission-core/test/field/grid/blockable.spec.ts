import { describe, expect, test } from "vitest"
import { createGrid, type FieldGrid, type TileSpec } from "arknights-mission-core"
import { OBSTACLE_COST } from "#field/grid/field.js"
import { bresenhamTiles, crossTiles, type GridPoint } from "#field/grid/sight.js"

/**
 * 参考实现的平地关卡第 9–12 行，按行给字符串，第 c 个字符是第 c 列：r 路（可放、可阻挡），f 地板（能走、不能阻挡），
 * E / S 终点与入口（能走、不能阻挡），h 高台与 # 墙（不能走）。x 是列，y 是行；cols 是参考实现的模拟矩形宽度。
 */
const FLAT: Readonly<Record<number, string>> = {
  9: "##ErrrrrrrSrrrrrrrS##",
  10: "##hrrrrrrrfrrrrrrrf##",
  11: "##hrrrrrrrfrrrrrrrf##",
  12: "##hrrrrrrrSrrrrrrrS##",
}

function tile(x: number, y: number, char: string): TileSpec {
  const walks = char === "r" || char === "f" || char === "E" || char === "S"
  return { x, y, height: char === "h" ? 1 : 0, deployable: char === "r", walkableBy: walks ? ["ground"] : [] }
}

function stage(rows: Readonly<Record<number, string>>, cols = 11): FieldGrid {
  const tiles: TileSpec[] = []
  for (let y = 9; y <= 12; y += 1) {
    const row = rows[y] ?? FLAT[y] ?? ""
    for (let x = 0; x < cols; x += 1) tiles.push(tile(x, y, row[x] ?? "#"))
  }
  return createGrid(tiles)
}

/** 官方算法：不偏好可阻挡的地面。 */
function pure(rows: Readonly<Record<number, string>>, cols = 11): FieldGrid {
  const grid = stage(rows, cols)
  grid.unblockable.fill(0)
  return grid
}

const at = (x: number, y: number): GridPoint => ({ x, y })

function segment(from: GridPoint, to: GridPoint): GridPoint[] {
  const out: GridPoint[] = []
  crossTiles(from.x, from.y, to.x, to.y, (x, y) => {
    out.push({ x, y })
  })
  return out
}

/** 平滑路线的官方视线覆盖：Bresenham 格子，加上斜走一步两侧的格子。 */
function covered(points: readonly GridPoint[]): GridPoint[] {
  const first = points[0]
  const out: GridPoint[] = first ? [first] : []
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]
    if (!from || !to) continue
    const line = bresenhamTiles(from, to)
    for (let step = 1; step < line.length; step += 1) {
      const a = line[step - 1]
      const b = line[step]
      if (!a || !b) continue
      if (a.x !== b.x && a.y !== b.y) out.push(at(a.x, b.y), at(b.x, a.y))
      out.push(b)
    }
  }
  return out
}

/** 敌人位置穿过的格子（只碰到角不算）。 */
function crossed(points: readonly GridPoint[]): GridPoint[] {
  const first = points[0]
  const out: GridPoint[] = first ? [first] : []
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]
    if (from && to) out.push(...segment(from, to).slice(1))
  }
  return out
}

/** 看格子本身：能走、可放、低地。官方算法的格子把 unblockable 清零了，也照样分得出地板。 */
const blockable = (grid: FieldGrid, x: number, y: number): boolean => {
  const spec = grid.at(x, y)
  return spec !== null && grid.walkable(x, y, true) && spec.deployable && spec.height <= 0
}

/** 从 s 到 e 穿过的不能阻挡的格子（不含起点终点），按路线顺序。 */
function floorCrossed(grid: FieldGrid, start: GridPoint, end: GridPoint): string[] {
  const points = grid.waypoints(start.x, start.y, end.x, end.y)
  expect(points).not.toBeNull()
  for (const point of covered(points ?? [])) expect(grid.walkable(point.x, point.y, false)).toBe(true)
  const seen = new Set<string>()
  for (const point of crossed(points ?? [])) {
    if ((point.x === start.x && point.y === start.y) || (point.x === end.x && point.y === end.y) || blockable(grid, point.x, point.y)) continue
    expect(grid.walkable(point.x, point.y, false)).toBe(true)
    seen.add(`${point.x},${point.y}`)
  }
  return [...seen]
}

describe("偏好可阻挡的地面", () => {
  test("等长的两条道：不管在哪边，走路面那条，不走地板那条", () => {
    for (const [left, right, lane] of [["r", "f", 8], ["f", "r", 9]] as const) {
      const rows = { 12: "##hrrrrrrrh", 11: `##hrhhhh${left}${right}h`, 10: `##hrhhhh${left}${right}h`, 9: "##Er####rrS" }
      const grid = stage(rows)
      const field = grid.flowField(2, 9)
      expect(field.dist[grid.key(10, 9)]).toBe(14)
      expect(field.pen[grid.key(10, 9)]).toBe(1)
      const path = (grid.findPath(10, 9, 2, 9) ?? []).map((point) => `${point.x},${point.y}`)
      for (const y of [10, 11]) expect(path).toContain(`${lane},${y}`)
      expect(floorCrossed(grid, at(10, 9), at(2, 9))).toEqual([])
    }
  })

  test("平滑不会斜穿格子路线没走过的地板", () => {
    const rows = { 12: "##hrrrrrrrfS", 11: "##hrrrrrrrf", 10: "##hrrrrrrrf", 9: "##ErrrrrrrrS" }
    const grid = stage(rows)
    for (const start of [at(9, 9), at(10, 9)]) {
      for (const point of crossed(grid.waypoints(start.x, start.y, 3, 12) ?? [])) {
        expect(blockable(grid, point.x, point.y) || (point.x === start.x && point.y === start.y)).toBe(true)
      }
    }
    expect(grid.waypoints(9, 9, 3, 12)).toEqual([at(9, 9), at(3, 12)])
  })

  test("只擦过地板格角的斜线是官方那条；穿过地板的不是", () => {
    const rows = { 12: "##hhhhhhhhh", 11: "##hhhhhhhhh", 10: "##hrrrrrrf#", 9: "##Err###rrS" }
    const grid = stage(rows)
    expect(grid.waypoints(10, 9, 2, 9)).toEqual(pure(rows).waypoints(10, 9, 2, 9))
    expect(grid.waypoints(10, 9, 2, 9)?.[1]).toEqual(at(7, 10))
    expect(floorCrossed(grid, at(10, 9), at(2, 9))).toEqual([])
    const next = { 12: "##hrrrrrrrfS", 11: "##hhhhhhrf#", 10: "##hhhhhhrf#", 9: "##Er###rrS#" }
    const official = pure(next)
    expect(official.waypoints(9, 9, 3, 12)).toEqual([at(9, 9), at(8, 12), at(3, 12)])
    expect(floorCrossed(official, at(9, 9), at(3, 12))).toEqual(["9,10"])
    const preferred = stage(next)
    expect(preferred.waypoints(9, 9, 3, 12)).toEqual([at(9, 9), at(8, 9), at(8, 12), at(3, 12)])
    expect(floorCrossed(preferred, at(9, 9), at(3, 12))).toEqual([])
  })

  test("随机布局：长度是官方的；pen 是等长链里最少的地板数；每段都是官方视线；穿过的地板不多于官方路线；换指针只为更少地板或只跳过官方路点", () => {
    let seed = 20260929
    const random = (): number => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
      return seed / 4294967296
    }
    const COLS = 21
    for (let layout = 0; layout < 400; layout += 1) {
      const rows: Record<number, string> = {}
      for (let y = 9; y <= 12; y += 1) {
        rows[y] = Array.from({ length: COLS }, () => {
          const roll = random()
          return roll < 0.55 ? "r" : roll < 0.85 ? "f" : "#"
        }).join("")
      }
      const grid = stage(rows, COLS)
      const official = pure(rows, COLS)
      for (let count = Math.floor(random() * 5); count > 0; count -= 1) {
        const y = 9 + Math.floor(random() * 4)
        const x = Math.floor(random() * COLS)
        grid.setObstacle(x, y, true, "crate")
        official.setObstacle(x, y, true, "crate")
      }
      for (let count = Math.floor(random() * 3); count > 0; count -= 1) {
        const y = 9 + Math.floor(random() * 4)
        const x = Math.floor(random() * COLS)
        grid.setObstacle(x, y, true)
        official.setObstacle(x, y, true)
      }
      const endY = 9 + Math.floor(random() * 4)
      const endX = Math.floor(random() * COLS)
      const dest = grid.key(endX, endY)
      const field = grid.flowField(endX, endY)
      const plain = official.flowField(endX, endY)
      const what = `layout ${layout} → (${endX},${endY})`
      expect([...field.dist], what).toEqual([...plain.dist])
      const count = field.dist.length
      const order = [...Array(count).keys()].filter((key) => (field.dist[key] ?? -1) >= 0).sort((a, b) => (field.dist[a] ?? 0) - (field.dist[b] ?? 0))
      const best = new Int32Array(count).fill(1e9)
      for (const key of order) {
        if (key === dest) {
          best[key] = 0
          continue
        }
        const here = grid.point(key)
        const step = grid.isCrate(here.x, here.y) ? OBSTACLE_COST : 1
        for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
          const near = grid.key(here.x + dx, here.y + dy)
          if (near >= 0 && (field.dist[near] ?? -1) >= 0 && (field.dist[near] ?? 0) + step === field.dist[key]) {
            best[key] = Math.min(best[key] ?? 1e9, (best[near] ?? 1e9) + (grid.unblockable[key] ?? 0))
          }
        }
        expect(field.pen[key], `${what}: (${here.x},${here.y}) pen`).toBe(best[key])
      }
      expect([...field.official], `${what}: official pointers`).toEqual([...plain.next])
      const floorOf = (from: number, to: number): number =>
        segment(grid.point(from), grid.point(to))
          .slice(1)
          .filter((point) => grid.unblockable[grid.key(point.x, point.y)] === 1).length
      const officialFloor = new Int32Array(count)
      for (const key of order) {
        if (key === dest) continue
        const next = field.next[key] ?? -1
        expect(next >= 0 && (field.dist[next] ?? 0) < (field.dist[key] ?? 0), `${what}: next of ${key}`).toBe(true)
        const a = grid.point(key)
        const b = grid.point(next)
        if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 1) {
          for (const point of covered([a, b])) {
            if (grid.key(point.x, point.y) === dest) continue
            expect(grid.walkable(point.x, point.y, false) && !grid.isCrate(point.x, point.y), `${what}: (${a.x},${a.y}) → (${b.x},${b.y})`).toBe(true)
          }
        }
        expect(field.cost[key], `${what}: (${a.x},${a.y}) cost`).toBe(floorOf(key, next) + (field.cost[next] ?? 0))
        const plainNext = plain.next[key] ?? -1
        officialFloor[key] = floorOf(key, plainNext) + (officialFloor[plainNext] ?? 0)
        expect(field.cost[key] ?? 0).toBeLessThanOrEqual(officialFloor[key] ?? 0)
        expect(field.cost[key] ?? 0).toBeLessThanOrEqual((field.pen[key] ?? 0) - (grid.unblockable[key] ?? 0) + (grid.unblockable[dest] ?? 0))
        if (next !== plainNext) {
          const viaOfficial = floorOf(key, plainNext) + (field.cost[plainNext] ?? 0)
          const o = grid.point(plainNext)
          const skips =
            field.next[plainNext] === next &&
            (o.y - a.y) * (b.x - a.x) === (o.x - a.x) * (b.y - a.y) &&
            segment(a, b).some((point) => point.x === o.x && point.y === o.y)
          expect((field.cost[key] ?? 0) < viaOfficial || ((field.cost[key] ?? 0) === viaOfficial && skips), `${what}: (${a.x},${a.y}) leaves the official pointer`).toBe(true)
        }
      }
    }
  })
})
