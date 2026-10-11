import type { TileCoord, UnitSnapshot } from "arknights-mission-core"
import type { MissionPointerHit } from "#contract/view.js"
import type { MissionBoardTransform } from "#runtime/camera/index.js"

const UNIT_REACH = 0.4
const SAME_DISTANCE = 1e-6

function closer(unit: UnitSnapshot, distance: number, best: UnitSnapshot, bestDistance: number): boolean {
  if (Math.abs(distance - bestDistance) > SAME_DISTANCE) return distance < bestDistance
  if (unit.height !== best.height) return unit.height > best.height
  return unit.y < best.y
}

/**
 * The unit or tile under a screen point. A unit within reach is chosen before the tile it stands on; among several,
 * the nearest wins, then the one drawn on top: the higher, then the one in the nearer row.
 */
export function pickBoard(
  screenX: number,
  screenY: number,
  transform: MissionBoardTransform | null,
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
  let picked: UnitSnapshot | null = null
  let pickedDistance = Infinity
  for (const unit of units) {
    if (unit.tags.includes("hidden")) continue
    const distance = Math.hypot(unit.x - gridX, unit.y - gridY)
    if (distance > UNIT_REACH) continue
    if (picked && !closer(unit, distance, picked, pickedDistance)) continue
    picked = unit
    pickedDistance = distance
  }
  if (picked) return { type: "unit", unitId: picked.id }
  const x = Math.floor(localX / tileSize)
  const y = rows - Math.floor(localY / tileSize) - 1
  if (x < 0 || y < 0 || x >= cols || y >= rows) return { type: "empty" }
  if (tiles.some((tile) => tile.x === x && tile.y === y)) return { type: "tile", x, y }
  return { type: "empty" }
}
