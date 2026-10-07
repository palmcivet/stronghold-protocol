import { frontTile, offsetTile, type Direction } from "arknights-mission-core"

export function asDirection(value: unknown): Direction {
  if (value === "UP" || value === "RIGHT" || value === "DOWN" || value === "LEFT") return value
  return "RIGHT"
}

/** Tile `steps` ahead of a board piece. A negative count steps behind it. */
export function frontOf(row: number, col: number, facing: unknown, steps = 1): readonly [number, number] {
  return frontTile(row, col, asDirection(facing), steps)
}

/** `[dRow, dCol]` written facing RIGHT, rotated into `facing`. */
export function offsetOf(row: number, col: number, dRow: number, dCol: number, facing: unknown): readonly [number, number] {
  return offsetTile(row, col, dRow, dCol, asDirection(facing))
}
