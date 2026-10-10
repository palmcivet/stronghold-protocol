import type { HitArea } from "#contract/spec.js"
import { hypot } from "#kernel/math/hypot.js"

export interface BodyUnit {
  readonly x: number
  readonly y: number
  readonly hitArea: HitArea | null
}

export interface BodyRect {
  readonly x0: number
  readonly x1: number
  readonly y0: number
  readonly y1: number
}

/** 格子坐标的闭区间。区间外的重叠不算占据。 */
export interface BoardSpan {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

type KeyCollection = { has(key: string): boolean } | readonly string[]

export function tileKey(x: number, y: number): string {
  return `${x},${y}`
}

export function normHitArea(area: HitArea | null): HitArea | null {
  if (!area) return null
  const w = Number(area.w)
  const h = Number(area.h)
  const dx = Number(area.dx ?? 0)
  const dy = Number(area.dy ?? 0)
  if (!(w > 0) || !(h > 0) || !Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(dx) || !Number.isFinite(dy)) {
    return null
  }
  return { w, h, dx, dy }
}

/** 大体型的世界矩形。点单位没有矩形。 */
export function bodyRect(unit: BodyUnit): BodyRect | null {
  const area = normHitArea(unit.hitArea)
  if (!area) return null
  const cx = unit.x + area.dx
  const cy = unit.y + area.dy
  return { x0: cx - area.w / 2, x1: cx + area.w / 2, y0: cy - area.h / 2, y1: cy + area.h / 2 }
}

function insideSpan(span: BoardSpan, x: number, y: number): boolean {
  return x >= span.x0 && x <= span.x1 && y >= span.y0 && y <= span.y1
}

function positionKey(unit: BodyUnit, span: BoardSpan): string | null {
  const x = Math.round(unit.x)
  const y = Math.round(unit.y)
  if (!insideSpan(span, x, y)) return null
  return tileKey(x, y)
}

/** 单位占据的格子键。点单位是所在格；大体型是矩形盖住的每一格。只擦到边的格子不算。 */
export function bodyKeys(unit: BodyUnit, span: BoardSpan): readonly string[] {
  const rect = bodyRect(unit)
  if (!rect) {
    const key = positionKey(unit, span)
    return key === null ? [] : [key]
  }
  const y0 = Math.max(span.y0, Math.floor(rect.y0 + 0.5 + 1e-9))
  const y1 = Math.min(span.y1, Math.ceil(rect.y1 - 0.5 - 1e-9))
  const x0 = Math.max(span.x0, Math.floor(rect.x0 + 0.5 + 1e-9))
  const x1 = Math.min(span.x1, Math.ceil(rect.x1 - 0.5 - 1e-9))
  const keys: string[] = []
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) keys.push(tileKey(x, y))
  }
  return keys
}

/** 单位是否占据格子 (x, y)。x 是列，y 是行。 */
export function bodyOnTile(unit: BodyUnit, x: number, y: number): boolean {
  const rect = bodyRect(unit)
  if (!rect) return Math.round(unit.y) === y && Math.round(unit.x) === x
  return x + 0.5 > rect.x0 + 1e-9 && x - 0.5 < rect.x1 - 1e-9 && y + 0.5 > rect.y0 + 1e-9 && y - 0.5 < rect.y1 - 1e-9
}

function hasKey(keys: KeyCollection, key: string): boolean {
  if (typeof (keys as { has?: unknown }).has === "function") return (keys as { has(key: string): boolean }).has(key)
  return (keys as readonly string[]).includes(key)
}

/** 单位是否占据 keys 里的任一格。 */
export function bodyInKeys(unit: BodyUnit, keys: KeyCollection, span: BoardSpan): boolean {
  if (!keys) return false
  if (!normHitArea(unit.hitArea)) {
    const key = positionKey(unit, span)
    return key !== null && hasKey(keys, key)
  }
  for (const key of bodyKeys(unit, span)) if (hasKey(keys, key)) return true
  return false
}

/** 点 (x, y) 到身体的距离。在矩形内部是 0。点单位量到站位。 */
export function bodyDist(unit: BodyUnit, x: number, y: number): number {
  const rect = bodyRect(unit)
  if (!rect) return hypot(unit.x - x, unit.y - y)
  const dx = x < rect.x0 ? rect.x0 - x : x > rect.x1 ? x - rect.x1 : 0
  const dy = y < rect.y0 ? rect.y0 - y : y > rect.y1 ? y - rect.y1 : 0
  return hypot(dx, dy)
}

/** 身体是否在点 (x, y) 的 r 格以内。 */
export function bodyInRadius(unit: BodyUnit, x: number, y: number, radius: number): boolean {
  return bodyDist(unit, x, y) <= radius + 1e-9
}

/** 格子 (x, y) 到身体的切比雪夫距离。占据该格时是 0。 */
export function bodyTileReach(unit: BodyUnit, x: number, y: number, span: BoardSpan): number {
  if (!normHitArea(unit.hitArea)) return Math.max(Math.abs(Math.round(unit.y) - y), Math.abs(Math.round(unit.x) - x))
  let best = Infinity
  for (const key of bodyKeys(unit, span)) {
    const [col, row] = key.split(",")
    const tileX = Number(col)
    const tileY = Number(row)
    const distance = Math.max(Math.abs(tileY - y), Math.abs(tileX - x))
    if (distance < best) best = distance
  }
  return best
}
