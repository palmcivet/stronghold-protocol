import { expect, test } from "vitest"
import type { AssetKey } from "arknights-assets-catalog"
import { buildBoardTiles, type BoardTextureReader } from "#compiler/media/derive/board/atlas.js"
import { encodePng } from "#compiler/media/derive/board/png.js"
import { ATLAS_SOURCES, MATERIALS } from "#compiler/media/derive/board/material.js"
import { BOARD_SURFACES } from "#compiler/media/derive/board/surface.js"

/** Textures with a gradient in every channel, so that every rectangle has contrast and is fully opaque. */
function texturePng(w: number, h: number): Buffer {
  const rgba = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const offset = (y * w + x) * 4
      rgba[offset] = (x * 7 + y * 3) & 255
      rgba[offset + 1] = ((x * 5) ^ (y * 11)) & 255
      rgba[offset + 2] = (x ^ y) & 255
      rgba[offset + 3] = 255
    }
  }
  return encodePng(w, h, rgba)
}

function readerOf(textures: Partial<Record<AssetKey, Uint8Array>>): BoardTextureReader {
  return async (key) => textures[key] ?? null
}

function completeTextures(): Partial<Record<AssetKey, Uint8Array>> {
  return Object.fromEntries(
    Object.values(ATLAS_SOURCES).map((source) => [source.key, new Uint8Array(texturePng(source.w, source.h))]),
  )
}

test("a complete set of textures gives tiles for every material and surface without problems", async () => {
  const build = await buildBoardTiles(readerOf(completeTextures()))
  expect(build.status).toBe("built")
  if (build.status !== "built") return
  expect(build.problems).toEqual([])
  const tiles = JSON.parse(build.text) as {
    source: Record<string, { key: string; w: number; h: number }>
    materials: Record<string, unknown>
    backdrop: unknown
    board3d: Record<string, unknown>
  }
  expect(Object.keys(tiles.materials).sort()).toEqual(Object.keys(MATERIALS).sort())
  expect(Object.keys(tiles.board3d).sort()).toEqual(Object.keys(BOARD_SURFACES).sort())
  expect(Object.keys(tiles.source).sort()).toEqual(["BG", "D", "common"])
  expect(tiles.source["D"]).toEqual({ key: ATLAS_SOURCES.D.key, w: 2048, h: 2048 })
  expect(tiles.backdrop).not.toBeNull()
}, 60_000)

test("without the main texture no tiles are built and the missing keys are listed", async () => {
  const textures = completeTextures()
  delete textures[ATLAS_SOURCES.D.key]
  const build = await buildBoardTiles(readerOf(textures))
  expect(build).toEqual({ status: "missing", missing: [ATLAS_SOURCES.D.key], problems: [] })
}, 60_000)

test("a texture of the wrong size is reported and left out of the tiles", async () => {
  const textures = completeTextures()
  textures[ATLAS_SOURCES.common.key] = new Uint8Array(texturePng(1000, 1000))
  const build = await buildBoardTiles(readerOf(textures))
  expect(build.status).toBe("built")
  if (build.status !== "built") return
  expect(build.problems).toEqual([`${ATLAS_SOURCES.common.key}: 1000×1000, expected 1024×1024`])
  const tiles = JSON.parse(build.text) as { source: Record<string, unknown> }
  expect(Object.keys(tiles.source).sort()).toEqual(["BG", "D"])
}, 60_000)