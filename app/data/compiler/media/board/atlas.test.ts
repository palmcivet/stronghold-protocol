import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { dataWorkspace } from "#workspace.js"
import { expect, test } from "vitest"
import { decodePng } from "#compiler/media/board/atlas.js"

const catalog = dataWorkspace().catalog
const mediaDir = catalog.mediaDir
const ready = existsSync(join(mediaDir, "map/autochess/TX_autochessi_N_rgb.png"))

function onDisk(assetPath: string): string {
  const decoded = decodeURIComponent(assetPath).replace(/^\//, "")
  const rel = decoded.startsWith("assets/") ? decoded.slice("assets/".length) : decoded
  return join(catalog.mediaDir, rel)
}

const pngOf = (assetPath: string): string => assetPath.replace(/\.webp$/, ".png")

test.skipIf(!ready)("derived maps point out of the surface and mirror smoothness", () => {
  const normalPath = "/assets/map/autochess/TX_autochessi_N_rgb.png"
  const metalPath = "/assets/map/autochess/TX_autochessi_M.png"
  const roughPath = "/assets/map/autochess/TX_autochessi_M_rough.png"
  expect(normalPath && metalPath && roughPath).toBeTruthy()
  if (!normalPath || !metalPath || !roughPath) return
  const normal = decodePng(readFileSync(onDisk(pngOf(normalPath))))
  let zSum = 0
  let count = 0
  for (let index = 0; index < normal.rgba.length; index += 4 * 97) {
    zSum += normal.rgba[index + 2] ?? 0
    count += 1
  }
  expect(zSum / count).toBeGreaterThan(230)
  const metal = decodePng(readFileSync(onDisk(metalPath)))
  const rough = decodePng(readFileSync(onDisk(pngOf(roughPath))))
  expect([rough.w, rough.h]).toEqual([metal.w, metal.h])
  for (let index = 0; index < metal.rgba.length; index += 4 * 131) {
    expect(rough.rgba[index + 1]).toBe(255 - (metal.rgba[index + 3] ?? 0))
  }
})
