import { describe, expect, it, vi } from "vitest"
import {
  createAssetResolver,
  packFileRoot,
  packManifestAddress,
  RESOURCE_ROOT,
  type AssetKey,
  type AssetKind,
  type FileFormat,
  type PackAsset,
  type PackFile,
  type PackManifest,
} from "arknights-assets-catalog"
import { createRendererResourcePort, type RendererResourceLoaders } from "./resource.js"

const ORIGIN = "https://cdn.example"
const HASH = "e3".repeat(32)
const pack = { type: "base", id: "base", version: "1.0.0-r1", contentHash: "0f".repeat(32) } as const

const IMAGE: AssetKey = "image:char/avatar/char_002_amiya"
const FALLBACK_IMAGE: AssetKey = "image:char/avatar/default"
const SPINE: AssetKey = "spine:enemy/slime"
const MODEL: AssetKey = "model:map/gate"
const JSON_KEY: AssetKey = "json:board/tiles"

const singleFile = (format: FileFormat): PackFile[] => [{ role: "main", name: null, format, bytes: 1, hash: HASH }]
const SPINE_FILES: PackFile[] = [
  { role: "skel", name: "slime.skel", format: "skel", bytes: 1, hash: HASH },
  { role: "atlas", name: "slime.atlas", format: "atlas", bytes: 1, hash: HASH },
  { role: "page", name: "slime.png", format: "png", bytes: 1, hash: HASH },
]

function asset(kind: AssetKind, files: PackFile[], fallbackId: AssetKey | null = null): PackAsset {
  return { kind, files, dependsOn: [], fallbackId, preloadGroup: null }
}

const manifest: PackManifest = {
  schemaVersion: 1,
  pack,
  requires: [],
  fileRoot: packFileRoot(pack),
  assets: {
    [IMAGE]: asset("image", singleFile("png"), FALLBACK_IMAGE),
    [FALLBACK_IMAGE]: asset("image", singleFile("png")),
    [SPINE]: asset("spine", SPINE_FILES),
    [MODEL]: asset("model", singleFile("obj")),
    [JSON_KEY]: asset("json", singleFile("json")),
  },
}

const manifestUrl = new URL(`${RESOURCE_ROOT}${packManifestAddress(pack)}`, ORIGIN)
const imageUrl = `${ORIGIN}/res/files/image/char/avatar/char_002_amiya.png?v=${HASH.slice(0, 12)}`
const fallbackImageUrl = `${ORIGIN}/res/files/image/char/avatar/default.png?v=${HASH.slice(0, 12)}`

function loadersWith(overrides: Partial<RendererResourceLoaders> = {}): RendererResourceLoaders {
  return {
    resolver: createAssetResolver([{ manifest, url: manifestUrl }]),
    image: async (url) => url,
    spine: async (source) => ({ key: source.key }),
    model: async (url) => `model:${url}`,
    json: async (url) => ({ url }),
    retryDelays: [0],
    ...overrides,
  }
}

describe("renderer resource port", () => {
  it("shares one image load between callers and loads again after the last release", async () => {
    const image = vi.fn(async (url: string) => url)
    const port = createRendererResourcePort(loadersWith({ image }))
    await port.image(IMAGE)
    await port.image(IMAGE)
    expect(image).toHaveBeenCalledTimes(1)
    port.release(IMAGE)
    port.release(IMAGE)
    await port.image(IMAGE)
    expect(image).toHaveBeenCalledTimes(2)
  })

  it("retries a failed image load before it gives up", async () => {
    let calls = 0
    const image = vi.fn(async (url: string) => {
      calls += 1
      if (calls === 1) throw new Error("network")
      return url
    })
    const port = createRendererResourcePort(loadersWith({ image }))
    await expect(port.image(IMAGE)).resolves.toBe(imageUrl)
    expect(image).toHaveBeenCalledTimes(2)
  })

  it("answers the fallback once the primary keeps failing", async () => {
    const image = vi.fn(async (url: string) => {
      if (url === imageUrl) throw new Error("gone")
      return url
    })
    const port = createRendererResourcePort(loadersWith({ image }))
    await expect(port.image(IMAGE)).resolves.toBe(fallbackImageUrl)
  })

  it("loads a spine model once for every holder", async () => {
    const spine = vi.fn(async (source: { key: AssetKey }) => ({ key: source.key }))
    const port = createRendererResourcePort(loadersWith({ spine }))
    await port.spine(SPINE)
    await port.spine(SPINE)
    expect(spine).toHaveBeenCalledTimes(1)
  })
})
