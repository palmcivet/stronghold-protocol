import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { catalogPackageRoot } from "arknights-assets-catalog/compile"
import { expect, test } from "vitest"
import { decodePng } from "#compiler/media/board/atlas.js"

const catalogRoot = catalogPackageRoot()
const manifestPath = join(catalogRoot, "product/media/local-assets.json")
const fxDir = join(catalogRoot, "product/media/local/map/fx")

interface LocalEntry {
  readonly path?: string
}

interface LocalManifest {
  readonly groups?: Record<string, Record<string, LocalEntry>>
}

const manifest = ((): LocalManifest | null => {
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8")) as LocalManifest
  } catch {
    return null
  }
})()

const ready = !!manifest?.groups?.["map/fx"] && existsSync(fxDir)

function onDisk(assetPath: string): string {
  const decoded = decodeURIComponent(assetPath).replace(/^\//, "")
  const rel = decoded.startsWith("assets/") ? decoded.slice("assets/".length) : decoded
  return join(catalogRoot, "product/media", rel)
}

const pngOf = (assetPath: string): string => assetPath.replace(/\.webp$/, ".png")

test.skipIf(!ready)("derived maps point out of the surface and mirror smoothness", () => {
  const group = manifest?.groups?.["map/autochess"]
  const normalPath = group?.["TX_autochessi_N_rgb"]?.path
  const metalPath = group?.["TX_autochessi_M"]?.path
  const roughPath = group?.["TX_autochessi_M_rough"]?.path
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
