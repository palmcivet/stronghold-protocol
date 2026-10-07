import { bodyDist as coreDist, bodyInRadius as coreInRadius, bodyRect, type HitArea } from "arknights-mission-core"
import { COLS, ROWS } from "#server/content/support/constants.js"

interface LooseBody {
  readonly x: number
  readonly y: number
  readonly hitArea?: { w: number; h: number; dx?: number; dy?: number } | null
}

function asBody(unit: LooseBody): { x: number; y: number; hitArea: HitArea | null } {
  const area = unit.hitArea
  if (!area) return { x: unit.x, y: unit.y, hitArea: null }
  return { x: unit.x, y: unit.y, hitArea: { w: area.w, h: area.h, dx: area.dx ?? 0, dy: area.dy ?? 0 } }
}

export function bodyDist(unit: LooseBody, x: number, y: number): number {
  return coreDist(asBody(unit), x, y)
}

export function bodyInRadius(unit: LooseBody, x: number, y: number, radius: number): boolean {
  return coreInRadius(asBody(unit), x, y, radius)
}

function positionKey(unit: LooseBody): number {
  const row = Math.round(unit.y)
  const col = Math.round(unit.x)
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return -1
  return row * COLS + col
}

/** Tile keys `row * COLS + col` the body occupies. */
export function bodyKeys(unit: LooseBody): number[] {
  const rect = bodyRect(asBody(unit))
  if (!rect) {
    const key = positionKey(unit)
    return key < 0 ? [] : [key]
  }
  const row0 = Math.max(0, Math.floor(rect.y0 + 0.5 + 1e-9))
  const row1 = Math.min(ROWS - 1, Math.ceil(rect.y1 - 0.5 - 1e-9))
  const col0 = Math.max(0, Math.floor(rect.x0 + 0.5 + 1e-9))
  const col1 = Math.min(COLS - 1, Math.ceil(rect.x1 - 0.5 - 1e-9))
  const keys: number[] = []
  for (let row = row0; row <= row1; row += 1) {
    for (let col = col0; col <= col1; col += 1) keys.push(row * COLS + col)
  }
  return keys
}

/** `(unit, row, col)`. Column is `x`, row is `y`. */
export function bodyOnTile(unit: LooseBody, row: number, col: number): boolean {
  const rect = bodyRect(asBody(unit))
  if (!rect) return Math.round(unit.y) === row && Math.round(unit.x) === col
  return col + 0.5 > rect.x0 + 1e-9 && col - 0.5 < rect.x1 - 1e-9 && row + 0.5 > rect.y0 + 1e-9 && row - 0.5 < rect.y1 - 1e-9
}

export function bodyInKeys(unit: LooseBody | null, keys: { has(key: number): boolean } | readonly number[] | null): boolean {
  if (!unit || !keys) return false
  const has = typeof (keys as { has?: unknown }).has === "function"
    ? (key: number) => (keys as { has(key: number): boolean }).has(key)
    : (key: number) => (keys as readonly number[]).includes(key)
  if (!unit.hitArea) {
    const key = positionKey(unit)
    return key >= 0 && has(key)
  }
  for (const key of bodyKeys(unit)) if (has(key)) return true
  return false
}

export function bodyTileReach(unit: LooseBody, row: number, col: number): number {
  if (!unit.hitArea) return Math.max(Math.abs(Math.round(unit.y) - row), Math.abs(Math.round(unit.x) - col))
  let best = Infinity
  for (const key of bodyKeys(unit)) {
    const keyRow = Math.floor(key / COLS)
    const keyCol = key % COLS
    const distance = Math.max(Math.abs(keyRow - row), Math.abs(keyCol - col))
    if (distance < best) best = distance
  }
  return best
}
