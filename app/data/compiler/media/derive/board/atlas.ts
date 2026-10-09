// 从棋盘贴图裁出每个材质的矩形，校验覆盖和对比度，生成 tiles.json 的文本。材质表在 material.ts，三维表面表在 surface.ts。

import { formatAssetKey, type AssetKey } from "arknights-assets-catalog"
import { ATLAS_SOURCES, BACKDROP, BOARD_THEME, MATERIALS, type AtlasSourceName, type CropLayer, type MaterialLayer } from "#compiler/media/derive/board/material.js"
import { decodePng, pngSize, rectStats, type PngImage } from "#compiler/media/derive/board/png.js"
import { BOARD_SURFACES, type BoardSurface } from "#compiler/media/derive/board/surface.js"

/** Key of the board tiles file of the board theme. */
export const BOARD_TILES_KEY: AssetKey = formatAssetKey("json", `board/${BOARD_THEME}/tiles`)

/** Bytes of a texture by key, or null when the texture is not available. */
export type BoardTextureReader = (key: AssetKey) => Promise<Uint8Array | null>

export type BoardTilesBuild =
  | { readonly status: "missing"; readonly missing: readonly AssetKey[]; readonly problems: readonly string[] }
  | { readonly status: "built"; readonly text: string; readonly problems: readonly string[]; readonly report: readonly string[] }

/**
 * Tiles of the board theme. The main texture decides whether tiles exist; the other textures only add
 * their own materials, and a texture of the wrong size or format is reported and left out.
 */
export async function buildBoardTiles(readTexture: BoardTextureReader): Promise<BoardTilesBuild> {
  const problems: string[] = []
  const missing: AssetKey[] = []
  const source: Partial<Record<AtlasSourceName, { key: AssetKey; w: number; h: number }>> = {}
  const images: Partial<Record<AtlasSourceName, PngImage>> = {}
  for (const name of Object.keys(ATLAS_SOURCES) as AtlasSourceName[]) {
    const spec = ATLAS_SOURCES[name]
    const bytes = await readTexture(spec.key)
    if (!bytes) {
      missing.push(spec.key)
      continue
    }
    const buf = Buffer.from(bytes)
    try {
      const size = pngSize(buf)
      if (size.w !== spec.w || size.h !== spec.h) {
        problems.push(`${spec.key}: ${size.w}×${size.h}, expected ${spec.w}×${spec.h}`)
        continue
      }
      images[name] = decodePng(buf)
      source[name] = { key: spec.key, w: size.w, h: size.h }
    } catch (cause) {
      problems.push(`${spec.key}: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }
  if (!images.D) return { status: "missing", missing, problems }

  const report: string[] = []
  for (const [name, layers] of Object.entries(MATERIALS)) {
    for (const row of layers) {
      if (!isCrop(row)) continue
      const spec = ATLAS_SOURCES[row.src]
      const image = images[row.src]
      const [x, y, w, h] = row.rect
      if (!(x >= 0 && y >= 0 && w > 8 && h > 8 && x + w <= spec.w && y + h <= spec.h)) {
        problems.push(`${name}: rect ${row.rect.join(",")} outside ${row.src}`)
        continue
      }
      if (!image) continue
      const stats = rectStats(image, row.rect)
      report.push(
        `${name.padEnd(14)} ${row.src.padEnd(6)} [${row.rect.join(",")}]  opaque ${(stats.opaque * 100).toFixed(0)}%  mean ${stats.mean.toFixed(0)}  std ${stats.std.toFixed(1)}`,
      )
      const decal = row !== layers[0] || row.scale != null
      if (!decal && stats.opaque < 0.9) problems.push(`${name}: rect ${row.rect.join(",")} of ${row.src} is ${(100 - stats.opaque * 100).toFixed(0)}% transparent`)
      if (decal && stats.opaque < 0.05) problems.push(`${name}: decal rect ${row.rect.join(",")} of ${row.src} is empty`)
      if (stats.std < 2) problems.push(`${name}: rect ${row.rect.join(",")} of ${row.src} is flat (std ${stats.std.toFixed(1)})`)
    }
  }
  for (const [name, surface] of Object.entries(BOARD_SURFACES)) {
    const spec = ATLAS_SOURCES[surface.src]
    const [x, y, w, h] = surface.rect
    if (!(x >= 0 && y >= 0 && w > 8 && h > 8 && x + w <= spec.w && y + h <= spec.h)) {
      problems.push(`board3d ${name}: rect ${surface.rect.join(",")} outside ${surface.src}`)
      continue
    }
    const image = images[surface.src]
    if (!image) continue
    const stats = rectStats(image, surface.rect)
    report.push(
      `3d ${name.padEnd(12)} ${surface.src.padEnd(6)} [${surface.rect.join(",")}]  opaque ${(stats.opaque * 100).toFixed(0)}%  mean ${stats.mean.toFixed(0)}  std ${stats.std.toFixed(1)}`,
    )
    if (surface.src === "D" && stats.opaque < 0.9) problems.push(`board3d ${name}: rect ${surface.rect.join(",")} is ${(100 - stats.opaque * 100).toFixed(0)}% transparent`)
    if (surface.src === "common" && stats.opaque < 0.05) problems.push(`board3d ${name}: decal rect ${surface.rect.join(",")} is empty`)
    if (stats.std < 2) problems.push(`board3d ${name}: rect ${surface.rect.join(",")} is flat (std ${stats.std.toFixed(1)})`)
  }

  const board3d = Object.fromEntries(Object.entries(BOARD_SURFACES).map(([key, surface]) => [key, copySurface(surface)]))
  const out = {
    version: 2,
    generatedBy: "app/data/compiler/media/derive/board/atlas.ts",
    cell: 256,
    source,
    materials: MATERIALS,
    backdrop: source.BG ? BACKDROP : null,
    board3d,
  }
  return { status: "built", text: JSON.stringify(out, null, 1) + "\n", problems, report }
}

function isCrop(layer: MaterialLayer): layer is CropLayer {
  return !("proc" in layer)
}

function copySurface(surface: BoardSurface): { src: BoardSurface["src"]; rect: number[]; rot?: BoardSurface["rot"]; flipX?: boolean; tint?: string } {
  const copy: { src: BoardSurface["src"]; rect: number[]; rot?: BoardSurface["rot"]; flipX?: boolean; tint?: string } = {
    src: surface.src,
    rect: [...surface.rect],
  }
  if (surface.rot !== undefined) copy.rot = surface.rot
  if (surface.flipX !== undefined) copy.flipX = surface.flipX
  if (surface.tint !== undefined) copy.tint = surface.tint
  return copy
}
