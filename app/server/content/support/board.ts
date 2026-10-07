import type { Direction } from "arknights-mission-core"
import { frontTile, offsetTile as offsetTilePair, oppositeDirection, rotateOffset as rotatePair } from "arknights-mission-core"

export const DIRS: readonly Direction[] = Object.freeze(["UP", "RIGHT", "DOWN", "LEFT"])
export const DEFAULT_DIR: Direction = "RIGHT"

const FORWARD: Readonly<Record<Direction, readonly [number, number]>> = {
  UP: [1, 0],
  RIGHT: [0, 1],
  DOWN: [-1, 0],
  LEFT: [0, -1],
}

export function isDir(value: unknown): value is Direction {
  return value === "UP" || value === "RIGHT" || value === "DOWN" || value === "LEFT"
}

export function normDir(value: unknown, fallback: Direction = DEFAULT_DIR): Direction {
  if (typeof value === "string") {
    const text = value.trim().toUpperCase()
    if (isDir(text)) return text
  }
  if (typeof value === "number" && Number.isFinite(value) && value !== 0) return value < 0 ? "LEFT" : "RIGHT"
  return isDir(fallback) ? fallback : DEFAULT_DIR
}

export function dirVec(facing: unknown): readonly [number, number] {
  return FORWARD[normDir(facing)]
}

export const DIR_VEC: Readonly<Record<Direction, readonly [number, number]>> = FORWARD

export function rotateOffset(dRow: number, dCol: number, facing: unknown): readonly [number, number] {
  return rotatePair(dRow, dCol, normDir(facing))
}

export function toLocalOffset(dRow: number, dCol: number, facing: unknown): readonly [number, number] {
  const direction = normDir(facing)
  if (direction === "UP") return [0 - dCol, dRow]
  if (direction === "LEFT") return [0 - dRow, 0 - dCol]
  if (direction === "DOWN") return [dCol, 0 - dRow]
  return [dRow, dCol]
}

export const toLocal = toLocalOffset

export function hSign(facing: unknown): number {
  return normDir(facing) === "LEFT" ? -1 : 1
}

export function mirrorDir(facing: unknown): Direction {
  const direction = normDir(facing)
  if (direction === "LEFT") return "RIGHT"
  if (direction === "RIGHT") return "LEFT"
  return direction
}

export function oppositeDir(facing: unknown): Direction {
  return oppositeDirection(normDir(facing))
}

export function perpendicular(left: unknown, right: unknown): boolean {
  const [ar, ac] = dirVec(left)
  const [br, bc] = dirVec(right)
  return ar * br + ac * bc === 0
}

export function dirFromDelta(dRow: number, dCol: number, fallback: Direction = DEFAULT_DIR): Direction {
  const row = Number(dRow) || 0
  const col = Number(dCol) || 0
  if (row === 0 && col === 0) return normDir(fallback)
  if (Math.abs(col) >= Math.abs(row)) return col > 0 ? "RIGHT" : "LEFT"
  return row > 0 ? "UP" : "DOWN"
}

export function offsetTile(row: number, col: number, dRow: number, dCol: number, facing: unknown): readonly [number, number] {
  return offsetTilePair(row, col, dRow, dCol, normDir(facing))
}

export function frontOf(row: number, col: number, facing: unknown, steps = 1): readonly [number, number] {
  return frontTile(row, col, normDir(facing), steps)
}

export function localOrder(dRow: number, dCol: number, facing: unknown): readonly [number, number] {
  return toLocalOffset(dRow, dCol, facing)
}

export function localBefore(left: readonly [number, number] | null, right: readonly [number, number] | null): boolean {
  if (!right) return true
  if (!left) return false
  return left[0] < right[0] || (left[0] === right[0] && left[1] < right[1])
}
