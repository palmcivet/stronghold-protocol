import { describe, expect, test } from "vitest"
import type { AssetKey } from "#key/asset-key.js"
import type { PackAsset, PackManifest, PackRefs, PackType } from "#schema/pack-manifest.js"
import { AssetResolveError, createAssetResolver, type AssetLayer } from "#resolver/overlay.js"

const HASH_A = "aa".repeat(32)
const HASH_B = "bb".repeat(32)
const ORIGIN = "https://cdn.example"

function image(hash: string, fallbackId: AssetKey | null = null, dependsOn: readonly AssetKey[] = []): PackAsset {
  return { kind: "image", files: [{ role: "main", name: null, format: "png", bytes: 1, hash }], dependsOn, fallbackId, preloadGroup: null }
}

function layer(type: PackType, id: string, assets: Record<AssetKey, PackAsset>, refs?: PackRefs, path = `/res/packs/${type}/${id}/manifest.json`, fileRoot = "../../../files/"): AssetLayer {
  const manifest: PackManifest = {
    schemaVersion: 1,
    pack: { type, id, version: "1", contentHash: HASH_A },
    requires: [],
    fileRoot,
    assets,
    ...(refs ? { refs } : {}),
  }
  return { manifest, url: `${ORIGIN}${path}` }
}

describe("overlay order", () => {
  const key: AssetKey = "image:char/avatar/char_002_amiya"
  const base = layer("base", "base", { [key]: image(HASH_A), "image:only/base": image(HASH_A) })
  const season = layer("season", "act2autochess", { [key]: image(HASH_B) })
  const mod = layer("mod", "recolor", { [key]: { ...image(HASH_A), preloadGroup: "shop" } })
  const local = layer("local", "local", { [key]: { ...image(HASH_B), files: [{ role: "main", name: null, format: "webp", bytes: 2, hash: HASH_B }] } }, undefined, "/res/local/manifest.json", "../files/")

  test("base < season < mod < local: the highest layer answers with its whole entry", () => {
    const resolver = createAssetResolver([base, season, mod, local])
    const found = resolver.resolve(key)
    expect(found?.pack.type).toBe("local")
    expect(found?.files.map((file) => file.format)).toEqual(["webp"])
    expect(found?.files[0]?.url).toBe(`${ORIGIN}/res/files/image/char/avatar/char_002_amiya.webp?v=${HASH_B.slice(0, 12)}`)
    expect(found?.asset.preloadGroup).toBeNull()
  })

  test("removing a top layer exposes the next one", () => {
    expect(createAssetResolver([base, season, mod]).entry(key)?.pack.type).toBe("mod")
    expect(createAssetResolver([base, season, mod]).entry(key)?.asset.preloadGroup).toBe("shop")
    expect(createAssetResolver([base, season]).entry(key)?.pack.type).toBe("season")
    expect(createAssetResolver([base]).entry(key)?.pack.type).toBe("base")
  })

  test("the caller's order is the overlay order", () => {
    expect(createAssetResolver([season, base]).entry(key)?.pack.type).toBe("base")
  })

  test("keys a higher layer does not have stay visible, with URLs of their own layer", () => {
    const resolver = createAssetResolver([base, season, mod, local])
    expect(resolver.entry("image:only/base")?.pack.type).toBe("base")
    expect(resolver.entry("image:only/base")?.files[0]?.url).toBe(`${ORIGIN}/res/files/image/only/base.png?v=${HASH_A.slice(0, 12)}`)
    expect(resolver.has("image:only/base")).toBe(true)
    expect(resolver.has("image:nowhere")).toBe(false)
    expect([...resolver.keys()].sort()).toEqual(["image:char/avatar/char_002_amiya", "image:only/base"])
  })

  test("an unknown key resolves to null", () => {
    const resolver = createAssetResolver([base])
    expect(resolver.resolve("image:nowhere")).toBeNull()
    expect(resolver.chain("image:nowhere")).toEqual([])
    expect(resolver.dependencies("image:nowhere")).toEqual([])
  })

  test("an upstream overlay can sit on the next base pack and only fill its gaps", () => {
    const upstream = layer("upstream", "backend", { [key]: { ...image(""), files: [{ role: "main", name: null, format: "png", bytes: 0, hash: "", href: "https://upstream.example/assets/avatar/char_002_amiya.png" }] } })
    const resolver = createAssetResolver([base, upstream])
    expect(resolver.resolve(key)?.files[0]?.url).toBe("https://upstream.example/assets/avatar/char_002_amiya.png")
    expect(resolver.resolve("image:only/base")?.pack.type).toBe("base")
  })
})

describe("fallback chain", () => {
  const elite: AssetKey = "image:char/avatar/char_002_amiya_2"
  const plain: AssetKey = "image:char/avatar/char_002_amiya"
  const blank: AssetKey = "image:char/avatar/blank"

  test("follows fallbackId and skips failed entries", () => {
    const resolver = createAssetResolver([layer("base", "base", { [elite]: image(HASH_A, plain), [plain]: image(HASH_B, blank), [blank]: image(HASH_A) })])
    expect(resolver.chain(elite).map((item) => item.key)).toEqual([elite, plain, blank])
    expect(resolver.resolve(elite)?.key).toBe(elite)
    expect(resolver.resolve(elite, { failed: new Set([elite]) })?.key).toBe(plain)
    expect(resolver.resolve(elite, { failed: new Set([elite, plain]) })?.key).toBe(blank)
    expect(resolver.resolve(elite, { failed: new Set([elite, plain, blank]) })).toBeNull()
  })

  test("a fallback target without an entry ends the chain", () => {
    const resolver = createAssetResolver([layer("base", "base", { [elite]: image(HASH_A, plain) })])
    expect(resolver.chain(elite).map((item) => item.key)).toEqual([elite])
    expect(resolver.resolve(elite, { failed: new Set([elite]) })).toBeNull()
  })

  test("the chain uses the highest entry of every key", () => {
    const base = layer("base", "base", { [elite]: image(HASH_A, plain), [plain]: image(HASH_A) })
    const mod = layer("mod", "m", { [elite]: image(HASH_B, blank), [blank]: image(HASH_B) })
    expect(createAssetResolver([base, mod]).chain(elite).map((item) => `${item.pack.type}:${item.key}`)).toEqual([`mod:${elite}`, `mod:${blank}`])
  })

  test("a cycle throws, also when it spans layers", () => {
    const resolver = createAssetResolver([layer("base", "base", { [elite]: image(HASH_A, plain), [plain]: image(HASH_A, blank), [blank]: image(HASH_A, elite) })])
    expect(() => resolver.chain(elite)).toThrow(AssetResolveError)
    expect(() => resolver.resolve(plain)).toThrow(`fallback cycle: ${plain} -> ${blank} -> ${elite} -> ${plain}`)
    try {
      resolver.resolve(elite)
    } catch (error) {
      expect((error as AssetResolveError).code).toBe("fallback-cycle")
    }
    const across = createAssetResolver([
      layer("base", "base", { [elite]: image(HASH_A, plain), [plain]: image(HASH_A) }),
      layer("mod", "m", { [plain]: image(HASH_B, elite) }),
    ])
    expect(() => across.resolve(elite)).toThrow(/fallback cycle/)
  })

  test("a fallback must keep the kind", () => {
    const spine: AssetKey = "spine:enemy/enemy_1007_slime"
    const resolver = createAssetResolver([
      layer("base", "base", {
        [elite]: image(HASH_A, spine),
        [spine]: {
          kind: "spine",
          files: [
            { role: "skel", name: "a.skel", format: "skel", bytes: 1, hash: HASH_A },
            { role: "atlas", name: "a.atlas", format: "atlas", bytes: 1, hash: HASH_A },
            { role: "page", name: "a.png", format: "png", bytes: 1, hash: HASH_A },
          ],
          dependsOn: [],
          fallbackId: null,
          preloadGroup: null,
        },
      }),
    ])
    expect(() => resolver.resolve(elite)).toThrow(expect.objectContaining({ code: "fallback-kind" }))
    expect(resolver.resolve(spine)?.files.map((file) => file.url)).toEqual([
      `${ORIGIN}/res/files/spine/enemy/enemy_1007_slime/a.skel?v=${HASH_A.slice(0, 12)}`,
      `${ORIGIN}/res/files/spine/enemy/enemy_1007_slime/a.atlas?v=${HASH_A.slice(0, 12)}`,
      `${ORIGIN}/res/files/spine/enemy/enemy_1007_slime/a.png?v=${HASH_A.slice(0, 12)}`,
    ])
  })
})

describe("dependencies", () => {
  test("transitive, deduplicated and resolved through fallbacks", () => {
    const material: AssetKey = "json:material/autochess"
    const color: AssetKey = "texture:map/autochess/TX_D"
    const normal: AssetKey = "texture:map/autochess/TX_N"
    const flat: AssetKey = "texture:map/common/flat_N"
    const texture = (fallbackId: AssetKey | null, dependsOn: readonly AssetKey[] = []): PackAsset => ({
      kind: "texture",
      files: [{ role: "main", name: null, format: "png", bytes: 1, hash: HASH_A }],
      dependsOn,
      fallbackId,
      preloadGroup: "board",
    })
    const resolver = createAssetResolver([
      layer("season", "act2autochess", {
        [material]: { kind: "json", files: [{ role: "main", name: null, format: "json", bytes: 1, hash: HASH_A }], dependsOn: [color, normal, color, "texture:map/missing"], fallbackId: null, preloadGroup: "board" },
        [color]: texture(null, [material]),
        [flat]: texture(null),
      }),
      layer("local", "local", { [normal]: texture(flat) }),
    ])
    expect(resolver.dependencies(material).map((item) => item.key)).toEqual([color, normal])
    const failed = createAssetResolver([
      layer("season", "act2autochess", { [material]: { kind: "json", files: [{ role: "main", name: null, format: "json", bytes: 1, hash: HASH_A }], dependsOn: [normal], fallbackId: null, preloadGroup: null }, [flat]: texture(null) }),
    ])
    expect(failed.dependencies(material)).toEqual([])
  })
})

describe("manifest checks", () => {
  test("an invalid manifest is rejected with every issue", () => {
    const bad = layer("base", "base", { "image:a": image(HASH_A) }, { chars: { a: "/assets/a.png" } } as unknown as PackRefs)
    expect(() => createAssetResolver([bad])).toThrow(AssetResolveError)
    try {
      createAssetResolver([bad])
    } catch (error) {
      expect((error as AssetResolveError).code).toBe("invalid-manifest")
      expect((error as AssetResolveError).issues).toEqual([{ path: "refs.chars.a", message: "invalid asset key: missing ':' between kind and path" }])
    }
  })

  test("the manifest url must be absolute", () => {
    expect(() => createAssetResolver([{ ...layer("base", "base", {}), url: "/res/packs/base/1/manifest.json" }])).toThrow(expect.objectContaining({ code: "invalid-url" }))
  })
})

describe("refs", () => {
  test("refs merge by JSON path across layers and lookups return keys", () => {
    const resolver = createAssetResolver([
      layer("base", "base", {}, { chars: { char_002_amiya: { avatar: "image:char/avatar/char_002_amiya", spine: "spine:char/char_002_amiya/front" } } }),
      layer("season", "act2autochess", {}, { board: { theme: "json:board/autochess/tiles" }, animRoles: "json:anim-roles/act2autochess" }),
      layer("mod", "skin", {}, { chars: { char_002_amiya: { spine: "spine:skin/char_002_amiya_1/front" } } }),
    ])
    expect(resolver.ref("chars.char_002_amiya.avatar")).toBe("image:char/avatar/char_002_amiya")
    expect(resolver.ref(["chars", "char_002_amiya", "spine"])).toBe("spine:skin/char_002_amiya_1/front")
    expect(resolver.ref("board.theme")).toBe("json:board/autochess/tiles")
    expect(resolver.ref("animRoles")).toBe("json:anim-roles/act2autochess")
    expect(resolver.ref("chars.char_002_amiya")).toBeNull()
    expect(resolver.ref("chars.nobody.avatar")).toBeNull()
  })
})
