import { rotateOffset } from "#server/content/support/board.js"
import { COLS } from "#server/content/support/constants.js"
import { noteBlocked } from "#server/content/support/blocked.js"

function pair(cell: unknown): readonly [number, number] {
  if (Array.isArray(cell)) return [Number(cell[0]) || 0, Number(cell[1]) || 0]
  if (cell && typeof cell === "object") {
    const record = cell as { r?: number; c?: number; y?: number; x?: number; row?: number; col?: number }
    const row = record.r ?? record.row ?? record.y ?? 0
    const col = record.c ?? record.col ?? record.x ?? 0
    return [row, col]
  }
  return [0, 0]
}

/** Facing-RIGHT range cells rotated onto the board. Keys are `row * COLS + col`. */
export function absoluteRangeKeys(grid: readonly unknown[] | null | undefined, row: number, col: number, facing: unknown, extend = 0): number[] {
  const keys: number[] = []
  for (const cell of grid ?? []) {
    const [dRow, dCol] = pair(cell)
    const [absoluteRow, absoluteCol] = rotateOffset(dRow, dCol + extend, facing)
    keys.push((row + absoluteRow) * COLS + (col + absoluteCol))
  }
  return keys
}

export function extendedGrid(grid: readonly unknown[] | null | undefined, extend = 0): unknown[] {
  return (grid ?? []).map((cell) => {
    const [dRow, dCol] = pair(cell)
    return [dRow, dCol + extend]
  })
}

export function sortEnemyTargets(_battle: unknown, _unit: unknown, list: unknown[], _priority?: unknown): unknown[] {
  return list
}

export function sortAllyTargets(_battle: unknown, _unit: unknown, list: unknown[], _priority?: unknown): unknown[] {
  return list
}

export function canTargetEnemy(unit: { hidden?: boolean; untargetable?: boolean; alive?: boolean } | null | undefined): boolean {
  if (!unit) return false
  if (unit.hidden || unit.untargetable) return false
  return unit.alive !== false
}

export function canTargetAlly(unit: { hidden?: boolean; untargetable?: boolean; alive?: boolean } | null | undefined): boolean {
  return canTargetEnemy(unit)
}

export function aggroCmp(left: { aggroSeq?: number; id?: string }, right: { aggroSeq?: number; id?: string }): number {
  return (left.aggroSeq ?? 0) - (right.aggroSeq ?? 0) || String(left.id).localeCompare(String(right.id))
}

export function enemyStealthed(unit: { flags?: { has?(flag: string): boolean }; hidden?: boolean } | null | undefined): boolean {
  if (!unit) return false
  if (unit.hidden) return true
  return unit.flags?.has?.("stealth") === true
}

export function areaSelectable(unit: { hidden?: boolean; untargetable?: boolean; alive?: boolean } | null | undefined): boolean {
  return canTargetEnemy(unit)
}

export function auraSelectable(unit: { hidden?: boolean; alive?: boolean } | null | undefined): boolean {
  return !!unit && unit.hidden !== true && unit.alive !== false
}

export function noteTargeting(name: string): void {
  noteBlocked(`targeting.${name}`)
}
