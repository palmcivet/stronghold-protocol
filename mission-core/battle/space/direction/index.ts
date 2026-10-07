import type { Direction } from "#contract/spec.js"

export const DEFAULT_DIRECTION: Direction = "RIGHT"

const FORWARD: Readonly<Record<Direction, readonly [number, number]>> = {
  UP: [1, 0],
  RIGHT: [0, 1],
  DOWN: [-1, 0],
  LEFT: [0, -1],
}

const OPPOSITE: Readonly<Record<Direction, Direction>> = {
  UP: "DOWN",
  DOWN: "UP",
  RIGHT: "LEFT",
  LEFT: "RIGHT",
}

const MIRROR: Readonly<Record<Direction, Direction>> = {
  UP: "UP",
  DOWN: "DOWN",
  RIGHT: "LEFT",
  LEFT: "RIGHT",
}

export function isDirection(value: string): value is Direction {
  return value === "UP" || value === "RIGHT" || value === "DOWN" || value === "LEFT"
}

/** 朝向名、大小写或旧的左右符号。无法识别时用 fallback。 */
export function normDirection(value: unknown, fallback: Direction = DEFAULT_DIRECTION): Direction {
  if (typeof value === "string") {
    const text = value.trim().toUpperCase()
    if (isDirection(text)) return text
  }
  if (typeof value === "number" && Number.isFinite(value) && value !== 0) return value < 0 ? "LEFT" : "RIGHT"
  return fallback
}

/** 朝向的前向 [dRow, dCol]。row 增大是向上，row 0 在底部。 */
export function directionVector(facing: Direction): readonly [number, number] {
  return FORWARD[normDirection(facing)]
}

/**
 * 把面向 RIGHT 撰写的偏移 [dRow, dCol] 旋成绝对偏移。
 * RIGHT (dr,dc) · UP (dc,−dr) · LEFT (−dr,−dc) · DOWN (−dc,dr)
 */
export function rotateOffset(dRow: number, dCol: number, facing: Direction): readonly [number, number] {
  switch (normDirection(facing)) {
    case "UP":
      return [dCol, 0 - dRow]
    case "LEFT":
      return [0 - dRow, 0 - dCol]
    case "DOWN":
      return [0 - dCol, dRow]
    default:
      return [dRow, dCol]
  }
}

/** rotateOffset 的逆：绝对偏移回到面向 RIGHT 的坐标系。 */
export function toLocal(dRow: number, dCol: number, facing: Direction): readonly [number, number] {
  switch (normDirection(facing)) {
    case "UP":
      return [0 - dCol, dRow]
    case "LEFT":
      return [0 - dRow, 0 - dCol]
    case "DOWN":
      return [dCol, 0 - dRow]
    default:
      return [dRow, dCol]
  }
}

/** LEFT 为 −1，其余朝向为 +1。 */
export function horizontalSign(facing: Direction): number {
  return normDirection(facing) === "LEFT" ? -1 : 1
}

/** RIGHT 与 LEFT 对调，UP 与 DOWN 不变。 */
export function mirrorDirection(facing: Direction): Direction {
  return MIRROR[normDirection(facing)]
}

export function oppositeDirection(facing: Direction): Direction {
  return OPPOSITE[normDirection(facing)]
}

export function perpendicular(left: Direction, right: Direction): boolean {
  const [ar, ac] = directionVector(left)
  const [br, bc] = directionVector(right)
  return ar * br + ac * bc === 0
}

/** 位移的主轴朝向。列差和行差一样大时取水平方向；零位移用 fallback。 */
export function directionFromDelta(dRow: number, dCol: number, fallback: Direction = DEFAULT_DIRECTION): Direction {
  const row = Number(dRow) || 0
  const col = Number(dCol) || 0
  if (row === 0 && col === 0) return normDirection(fallback)
  if (Math.abs(col) >= Math.abs(row)) return col > 0 ? "RIGHT" : "LEFT"
  return row > 0 ? "UP" : "DOWN"
}

/** 从 (row, col) 按面向 RIGHT 的偏移走到的格子。 */
export function offsetTile(
  row: number,
  col: number,
  dRow: number,
  dCol: number,
  facing: Direction,
): readonly [number, number] {
  const [dAbsoluteRow, dAbsoluteCol] = rotateOffset(dRow, dCol, facing)
  return [row + dAbsoluteRow, col + dAbsoluteCol]
}

/** 朝向前方 k 格。k 为负时在身后。 */
export function frontTile(row: number, col: number, facing: Direction, steps = 1): readonly [number, number] {
  const [dRow, dCol] = directionVector(facing)
  return [row + dRow * steps, col + dCol * steps]
}

/** 绝对位移在该朝向的面向 RIGHT 坐标系里的 [localRow, localCol]。 */
export function localOrder(dRow: number, dCol: number, facing: Direction): readonly [number, number] {
  return toLocal(dRow, dCol, facing)
}

/** 两个 localOrder 的字典序。后一个缺省时前一个更小。 */
export function localBefore(
  left: readonly [number, number] | null,
  right: readonly [number, number] | null,
): boolean {
  if (!right) return true
  if (!left) return false
  return left[0] < right[0] || (left[0] === right[0] && left[1] < right[1])
}
