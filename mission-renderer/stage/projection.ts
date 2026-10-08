import type { MissionCamera } from "#contract/view.js"

export interface BoardTransform {
  readonly x: number
  readonly y: number
  readonly scale: number
  readonly worldX: number
  readonly worldY: number
  readonly worldWidth: number
  readonly worldHeight: number
}

export function calculateBoardTransform(
  cols: number,
  rows: number,
  camera: MissionCamera | null,
  tileSize: number,
  viewportWidth: number,
  viewportHeight: number,
): BoardTransform | null {
  if (cols <= 0 || rows <= 0 || tileSize <= 0 || viewportWidth <= 0 || viewportHeight <= 0) return null

  const mapWidth = cols * tileSize
  const mapHeight = rows * tileSize
  const margin = Math.max(0, camera?.margin ?? 0) * tileSize
  const worldX = camera ? camera.x * tileSize : 0
  const worldY = camera ? (rows - camera.y - camera.height) * tileSize : 0
  const worldWidth = (camera?.width ?? cols) * tileSize
  const worldHeight = (camera?.height ?? rows) * tileSize
  const contentWidth = worldWidth + margin * 2
  const contentHeight = worldHeight + margin * 2
  const fit = Math.min(viewportWidth / contentWidth, viewportHeight / contentHeight)
  const scale = camera ? fit : fit * 0.9
  const x = (viewportWidth - contentWidth * scale) / 2 - (worldX - margin) * scale
  const y = (viewportHeight - contentHeight * scale) / 2 - (worldY - margin) * scale

  return {
    x,
    y,
    scale,
    worldX,
    worldY,
    worldWidth: camera ? worldWidth : mapWidth,
    worldHeight: camera ? worldHeight : mapHeight,
  }
}
