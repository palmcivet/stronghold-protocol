import {
  createAssetResolver,
  createSpineCache,
  fileAddress,
  isPackManifest,
  packFileRoot,
  packManifestAddress,
  RESOURCE_ROOT,
  spineSource,
  type AssetKey,
  type PackManifest,
} from "arknights-assets-catalog"
import { expect, test } from "vitest"

const SAME_BYTES = "e3".repeat(32)
const OTHER = "0f".repeat(32)
const ORIGIN = "https://cdn.example"

const spineFiles = (stem: string, hash: string) => [
  { role: "skel", name: `${stem}.skel`, format: "skel", bytes: 48211, hash },
  { role: "atlas", name: `${stem}.atlas`, format: "atlas", bytes: 1302, hash },
  { role: "page", name: `${stem}.png`, format: "png", bytes: 210337, hash },
] as const

const pack = { type: "base", id: "base", version: "1.0.0-r1", contentHash: OTHER } as const

const base: PackManifest = {
  schemaVersion: 1,
  pack,
  requires: [],
  fileRoot: packFileRoot(pack),
  assets: {
    "image:char/avatar/char_002_amiya": {
      kind: "image",
      files: [{ role: "main", name: null, format: "png", bytes: 20817, hash: SAME_BYTES }],
      dependsOn: [],
      fallbackId: null,
      preloadGroup: "shop",
    },
    "image:skin/portrait/char_002_amiya_1": {
      kind: "image",
      files: [{ role: "main", name: null, format: "png", bytes: 20817, hash: SAME_BYTES }],
      dependsOn: [],
      fallbackId: null,
      preloadGroup: null,
    },
    "spine:enemy/enemy_1007_slime": { kind: "spine", files: spineFiles("enemy_1007_slime", SAME_BYTES), dependsOn: [], fallbackId: null, preloadGroup: null },
    "spine:enemy/enemy_1007_slime_2": { kind: "spine", files: spineFiles("enemy_1007_slime", SAME_BYTES), dependsOn: [], fallbackId: null, preloadGroup: null },
  },
  refs: { enemies: { enemy_1007_slime: { spine: "spine:enemy/enemy_1007_slime" }, enemy_1007_slime_2: { spine: "spine:enemy/enemy_1007_slime_2" } } },
}

const baseUrl = new URL(`${RESOURCE_ROOT}${packManifestAddress(pack)}`, ORIGIN)

test("the same bytes under two keys stay two assets with two addresses", () => {
  expect(isPackManifest(base)).toBe(true)
  const resolver = createAssetResolver([{ manifest: base, url: baseUrl }])
  const avatar = resolver.resolve("image:char/avatar/char_002_amiya")
  const portrait = resolver.resolve("image:skin/portrait/char_002_amiya_1")
  expect(avatar?.key).toBe("image:char/avatar/char_002_amiya")
  expect(portrait?.key).toBe("image:skin/portrait/char_002_amiya_1")
  expect(avatar?.files[0]?.url).toBe(`${ORIGIN}/res/files/image/char/avatar/char_002_amiya.png?v=${SAME_BYTES.slice(0, 12)}`)
  expect(portrait?.files[0]?.url).toBe(`${ORIGIN}/res/files/image/skin/portrait/char_002_amiya_1.png?v=${SAME_BYTES.slice(0, 12)}`)
  expect(avatar?.asset.preloadGroup).toBe("shop")
  expect(portrait?.asset.preloadGroup).toBeNull()
})

test("refs lead to keys, keys to files, and the spine cache keeps one model per key", async () => {
  const resolver = createAssetResolver([{ manifest: base, url: baseUrl }])
  const loads: AssetKey[] = []
  const cache = createSpineCache({
    load: async (source) => {
      loads.push(source.key)
      return { key: source.key }
    },
    unload: () => {},
  })
  const sources = ["enemies.enemy_1007_slime.spine", "enemies.enemy_1007_slime_2.spine"].map((path) => {
    const key = resolver.ref(path)
    expect(key).not.toBeNull()
    const resolved = resolver.resolve(key as AssetKey)
    return resolved ? spineSource(resolved) : null
  })
  const [first, second] = sources
  expect(first?.skel).toBe(`${ORIGIN}/res/files/${fileAddress("spine:enemy/enemy_1007_slime", { name: "enemy_1007_slime.skel", format: "skel" })}?v=${SAME_BYTES.slice(0, 12)}`)
  expect(second?.skel).toBe(`${ORIGIN}/res/files/spine/enemy/enemy_1007_slime_2/enemy_1007_slime.skel?v=${SAME_BYTES.slice(0, 12)}`)
  const one = await cache.acquire(first!)
  const two = await cache.acquire(second!)
  expect(one).not.toBe(two)
  expect(loads).toEqual(["spine:enemy/enemy_1007_slime", "spine:enemy/enemy_1007_slime_2"])
  expect(cache.peek("spine:enemy/enemy_1007_slime")).toBe(one)
  expect(cache.peek("spine:enemy/enemy_1007_slime_2")).toBe(two)
})
