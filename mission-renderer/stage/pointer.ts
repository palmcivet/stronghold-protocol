import type { TileCoord, UnitSnapshot } from "arknights-mission-core"
import type { MissionPointerHit } from "#contract/view.js"
import type { BoardTransform } from "./projection.js"

const UNIT_REACH = 0.4

/** The unit or tile under a screen point. A unit within reach is chosen before the tile it stands on. */
export function pickBoard(
  screenX: number,
  screenY: number,
  transform: BoardTransform | null,
  tileSize: number,
  cols: number,
  rows: number,
  units: readonly UnitSnapshot[],
  tiles: readonly TileCoord[],
): MissionPointerHit {
  if (!transform || !(tileSize > 0) || !(transform.scale > 0)) return { type: "empty" }
  const localX = (screenX - transform.x) / transform.scale
  const localY = (screenY - transform.y) / transform.scale
  const gridX = localX / tileSize - 0.5
  const gridY = rows - localY / tileSize - 0.5
  for (const unit of units) {
    if (unit.tags.includes("hidden")) continue
    if (Math.hypot(unit.x - gridX, unit.y - gridY) <= UNIT_REACH) return { type: "unit", unitId: unit.id }
  }
  const x = Math.floor(localX / tileSize)
  const y = rows - Math.floor(localY / tileSize) - 1
  if (x < 0 || y < 0 || x >= cols || y >= rows) return { type: "empty" }
  if (tiles.some((tile) => tile.x === x && tile.y === y)) return { type: "tile", x, y }
  return { type: "empty" }
}
