import type { TileSpec } from "arknights-mission-core"
import type { MissionMap } from "#contract/view.js"
import { RAISED_GLYPH_HEIGHT, TILE_HEIGHT, type Vec3 } from "./palette.js"

/** A board tile plus the glyph, device and surface the ground reads when a map carries them. */
export type BoardTile = TileSpec & {
  readonly glyph?: string
  readonly device?: string
  readonly surface?: string
}

export interface TerrainCell {
  readonly x: number
  readonly y: number
  readonly glyph: string
  readonly content: boolean
  readonly raised: boolean
  readonly height: number
  readonly device: string | null
  readonly objective: boolean
  drawn: boolean
  surface: string
  rot: number
  flipX: boolean
  tint: Vec3
  side: string
  sideTint: Vec3
  panels: boolean
}

export type TerrainCells = ReadonlyMap<string, TerrainCell>

export function cellKey(x: number, y: number): string {
  return `${x}:${y}`
}

/**
 * The glyph of a tile. A tile carrying `glyph` keeps it; otherwise the glyph follows its device, objective, height and
 * walkability, so a map without glyphs still builds the same board classes.
 */
export function glyphOf(tile: BoardTile): string {
  if (tile.glyph) return tile.glyph
  if (tile.device === "barrier") return "X"
  if (tile.device === "grate") return "g"
  if (tile.device === "marsh") return "m"
  if (tile.device === "tide") return "d"
  if (tile.objective) return "E"
  if (tile.surface === "high" || tile.height > 0) return "h"
  if (tile.surface === "blocked" || (!tile.deployable && tile.walkableBy.length === 0)) return "#"
  return "r"
}

function hash2(x: number, y: number): number {
  return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0
}

const TINT_NONE: Vec3 = [1, 1, 1]

function neighborGlyph(cells: ReadonlyMap<string, TerrainCell>, x: number, y: number): string | null {
  return cells.get(cellKey(x, y))?.glyph ?? null
}

/** The high-ground plate that joins a raised tile to its raised neighbours (master classifyStage). */
function highPlate(cells: ReadonlyMap<string, TerrainCell>, cell: TerrainCell): { surface: string, rot: number } {
  const left = neighborGlyph(cells, cell.x - 1, cell.y) === "h"
  const right = neighborGlyph(cells, cell.x + 1, cell.y) === "h"
  if (left || right) {
    if (left && right) return { surface: "plateM", rot: 0 }
    return { surface: right ? "plateL" : "plateR", rot: 0 }
  }
  const near = neighborGlyph(cells, cell.x, cell.y - 1) === "h"
  const far = neighborGlyph(cells, cell.x, cell.y + 1) === "h"
  if (near && far) return { surface: "plateM", rot: 90 }
  if (far) return { surface: "plateL", rot: 270 }
  if (near) return { surface: "plateL", rot: 90 }
  return { surface: "plateS", rot: 0 }
}

function styleCell(cell: TerrainCell, cells: ReadonlyMap<string, TerrainCell>): void {
  const hash = hash2(cell.x, cell.y)
  switch (cell.glyph) {
    case "r":
      cell.rot = (hash % 4) * 90
      cell.flipX = ((hash >> 3) & 1) === 1
      break
    case "R":
      cell.surface = "concreteStripe"
      cell.rot = (hash & 1) ? 180 : 0
      break
    case "f":
      cell.surface = "hatch"
      cell.rot = (hash % 4) * 90
      break
    case "p":
      cell.surface = "hatch"
      cell.rot = (hash % 4) * 90
      cell.tint = [0.9, 0.92, 0.95]
      break
    case "b":
      cell.rot = (hash % 4) * 90
      break
    case "S":
      cell.surface = "concreteArrow"
      break
    case "E":
      cell.surface = "ringHatch"
      break
    case "I":
      cell.surface = "lift"
      break
    case "O":
      cell.surface = "lift"
      cell.rot = 180
      break
    case "g":
      cell.surface = "slats"
      cell.tint = [0.72, 0.76, 0.78]
      break
    case "m":
      cell.rot = (hash % 4) * 90
      cell.tint = [0.78, 0.8, 0.7]
      break
    case "i":
      cell.rot = (hash % 4) * 90
      cell.tint = [0.95, 0.88, 0.86]
      break
    case "d":
      cell.surface = "concrete"
      cell.tint = [0.35, 0.42, 0.46]
      break
    case "a":
    case "A": {
      const reserve = cell.y <= 1
      cell.surface = cell.glyph === "a"
        ? (reserve ? "concrete" : "padReinf")
        : (reserve ? "concrete" : "padEquip")
      cell.side = "benchRail"
      if (reserve) {
        cell.tint = [0.3, 0.32, 0.35]
        cell.panels = true
      }
      break
    }
    case "h": {
      const plate = highPlate(cells, cell)
      cell.surface = plate.surface
      cell.rot = plate.rot
      cell.side = "goldSide"
      break
    }
    case "#":
      cell.surface = "hatch"
      cell.rot = (hash & 1) ? 90 : 0
      cell.tint = [0.34, 0.36, 0.39]
      cell.side = "graySide"
      cell.sideTint = [0.52, 0.55, 0.58]
      break
    case "X":
      cell.surface = "hatch"
      cell.tint = [0.36, 0.38, 0.41]
      cell.side = cell.x % 5 === 2 ? "evacPanel" : "restPanel"
      cell.sideTint = [0.8, 0.82, 0.86]
      break
    default:
      break
  }
}

/**
 * Classify every tile of a map: which tiles are built (content plus the forbidden ring around it), their surface,
 * their rotation and tint. Tiles the map does not list are not built.
 */
export function classifyCells(map: MissionMap): TerrainCells {
  const cells = new Map<string, TerrainCell>()
  for (const tile of map.tiles) {
    const styled = tile as BoardTile
    const glyph = glyphOf(styled)
    const heightClass = RAISED_GLYPH_HEIGHT[glyph]
    cells.set(cellKey(styled.x, styled.y), {
      x: styled.x,
      y: styled.y,
      glyph,
      content: glyph !== "#" && glyph !== "X",
      raised: heightClass !== undefined,
      height: heightClass ? TILE_HEIGHT[heightClass] : 0,
      device: styled.device ?? null,
      objective: Boolean(styled.objective),
      drawn: false,
      surface: "concrete",
      rot: 0,
      flipX: false,
      tint: TINT_NONE,
      side: "graySide",
      sideTint: TINT_NONE,
      panels: false,
    })
  }
  for (const cell of cells.values()) {
    if (cell.content) {
      cell.drawn = true
      continue
    }
    for (let dy = -1; dy <= 1 && !cell.drawn; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (cells.get(cellKey(cell.x + dx, cell.y + dy))?.content) {
          cell.drawn = true
          break
        }
      }
    }
  }
  for (const cell of cells.values()) styleCell(cell, cells)
  return cells
}
