import { describe, expect, it } from "vitest"
import {
  packFileRoot,
  packManifestAddress,
  type AssetKey,
  type PackAsset,
  type PackManifest,
  type PackRefs,
  type PublishedPack,
} from "arknights-assets-catalog"
import { loadResourceStore, type CompatResourceStoreOptions, type PackResourceStoreOptions, type ResourceStoreOptions } from "./store.js"

const ORIGIN = "https://cdn.example/res/"
const HASH = "aa".repeat(32)
const BASE: PublishedPack = { type: "base", id: "base", version: "1", contentHash: HASH }
const SEASON: PublishedPack = { type: "season", id: "act2autochess", version: "2026.10.09", contentHash: HASH }
const LOCAL_URL = `${ORIGIN}local/manifest.json`

const AMIYA: AssetKey = "image:char/avatar/char_002_amiya"
const AMIYA_ELITE: AssetKey = "image:char/avatar/char_002_amiya_2"
const SHOP_ITEM: AssetKey = "image:item/1001"
const BOARD: AssetKey = "json:board/autochess/tiles"

type Reply = { readonly status: number; readonly body?: unknown }
type Script = Record<string, Reply[]>

/** Replies per URL in order; the last reply of a URL repeats. Unknown URLs answer 404. */
function fakeFetch(script: Script) {
  const calls: string[] = []
  const fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    calls.push(url)
    const replies = script[url] ?? []
    const reply = (replies.length > 1 ? replies.shift() : replies[0]) ?? { status: 404 }
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body } as Response
  }
  return { fetch, callsTo: (url: string) => calls.filter((call) => call === url).length }
}

const ok = (body: unknown): Reply => ({ status: 200, body })

function manifest(pack: PublishedPack, assets: Record<AssetKey, PackAsset>, refs?: PackRefs): PackManifest {
  return {
    schemaVersion: 1,
    pack: { type: pack.type, id: pack.id, version: pack.version, contentHash: pack.contentHash },
    requires: [],
    fileRoot: packFileRoot(pack),
    assets,
    ...(refs ? { refs } : {}),
  }
}

const manifestUrl = (pack: PublishedPack): string => `${ORIGIN}${packManifestAddress(pack)}`

function image(hash = HASH, options: { readonly fallbackId?: AssetKey; readonly preloadGroup?: string } = {}): PackAsset {
  return {
    kind: "image",
    files: [{ role: "main", name: null, format: "png", bytes: 1, hash }],
    dependsOn: [],
    fallbackId: options.fallbackId ?? null,
    preloadGroup: options.preloadGroup ?? null,
  }
}

const BASE_MANIFEST = manifest(
  BASE,
  {
    [AMIYA]: image(),
    [AMIYA_ELITE]: image(HASH, { fallbackId: AMIYA }),
    [SHOP_ITEM]: image(HASH, { preloadGroup: "shop" }),
  },
  { chars: { char_002_amiya: { avatar: AMIYA, avatarElite: AMIYA_ELITE } } },
)

const SEASON_MANIFEST = manifest(SEASON, {
  [BOARD]: { kind: "json", files: [{ role: "main", name: null, format: "json", bytes: 1, hash: HASH }], dependsOn: [], fallbackId: null, preloadGroup: null },
})

const LOCAL_OVERRIDE = manifest({ type: "local", id: "local", version: "0", contentHash: HASH }, { [AMIYA]: image("bb".repeat(32)) })

function standardScript(extra: Script = {}): Script {
  return {
    [manifestUrl(BASE)]: [ok(BASE_MANIFEST)],
    [manifestUrl(SEASON)]: [ok(SEASON_MANIFEST)],
    [LOCAL_URL]: [{ status: 404 }],
    ...extra,
  }
}

function options(fetch: typeof globalThis.fetch, extra: Partial<PackResourceStoreOptions> = {}): PackResourceStoreOptions {
  return {
    base: manifestUrl(BASE),
    season: manifestUrl(SEASON),
    local: LOCAL_URL,
    fetch,
    retryDelays: [0, 0],
    loadImage: async (url) => ({ src: url }),
    ...extra,
  }
}

describe("resource store layers", () => {
  it("stacks the local layer over the base layer, with refs and file urls from the resolver", async () => {
    const { fetch } = fakeFetch(standardScript({ [LOCAL_URL]: [ok(LOCAL_OVERRIDE)] }))
    const store = await loadResourceStore(options(fetch))
    expect(store.resolver.resolve(AMIYA)?.pack.type).toBe("local")
    expect(store.resolver.resolve(AMIYA)?.files[0]?.url).toBe(`${ORIGIN}files/image/char/avatar/char_002_amiya.png?v=bbbbbbbbbbbb`)
    expect(store.ref("chars.char_002_amiya.avatar")).toBe(AMIYA)
  })

  it("exposes the merged refs with the base and season shapes", async () => {
    const season = manifest(SEASON, SEASON_MANIFEST.assets, { board: { theme: BOARD } })
    const { fetch } = fakeFetch(standardScript({ [manifestUrl(SEASON)]: [ok(season)] }))
    const store = await loadResourceStore(options(fetch))
    expect(store.refs.chars?.["char_002_amiya"]?.avatarElite).toBe(AMIYA_ELITE)
    expect(store.refs.board?.theme).toBe(BOARD)
  })

  it("rejects a layer whose refs give a known name another shape", async () => {
    const mod: PublishedPack = { type: "mod", id: "mod", version: "1", contentHash: HASH }
    const broken = manifest(mod, {}, { chars: { char_002_amiya: AMIYA } })
    const { fetch } = fakeFetch(standardScript({ [manifestUrl(mod)]: [ok(broken)] }))
    await expect(loadResourceStore(options(fetch, { mods: [manifestUrl(mod)] }))).rejects.toThrow("refs.chars.char_002_amiya: expected an object")
  })

  it("treats a missing local manifest as an empty local layer", async () => {
    const { fetch } = fakeFetch(standardScript())
    const store = await loadResourceStore(options(fetch))
    expect(store.resolver.resolve(AMIYA)?.pack.type).toBe("base")
  })

  it("retries a server error of a manifest and does not retry a missing one", async () => {
    const transient = fakeFetch(standardScript({ [manifestUrl(BASE)]: [{ status: 503 }, ok(BASE_MANIFEST)] }))
    await loadResourceStore(options(transient.fetch))
    expect(transient.callsTo(manifestUrl(BASE))).toBe(2)

    const missing = fakeFetch(standardScript({ [manifestUrl(BASE)]: [{ status: 404 }] }))
    await expect(loadResourceStore(options(missing.fetch))).rejects.toThrow("404")
    expect(missing.callsTo(manifestUrl(BASE))).toBe(1)
  })
})

describe("resource store images", () => {
  it("loads a key once while it is referenced and loads it again after the last release", async () => {
    let loads = 0
    const { fetch } = fakeFetch(standardScript())
    const store = await loadResourceStore(options(fetch, { loadImage: async (url) => { loads += 1; return { src: url } } }))
    await store.image(AMIYA)
    await store.image(AMIYA)
    expect(loads).toBe(1)
    store.release(AMIYA)
    store.release(AMIYA)
    await store.image(AMIYA)
    expect(loads).toBe(2)
  })

  it("retries a failing file, then answers the image of its fallbackId", async () => {
    const { fetch } = fakeFetch(standardScript())
    const store = await loadResourceStore(options(fetch, {
      loadImage: async (url) => {
        if (url.includes("_2.png")) throw new Error(`failed: ${url}`)
        return { src: url }
      },
    }))
    const loaded = (await store.image(AMIYA_ELITE)) as { src: string }
    expect(loaded.src).toContain("char_002_amiya.png")
  })

  it("preloads a group, reports progress and resolves a failed key to null", async () => {
    const { fetch } = fakeFetch(standardScript())
    const store = await loadResourceStore(options(fetch, {
      loadImage: async (url) => {
        if (url.includes("1001")) throw new Error(`failed: ${url}`)
        return { src: url }
      },
    }))
    const progress: [number, number][] = []
    const result = await store.preload("shop", (done, total) => progress.push([done, total]))
    expect(result).toEqual([null])
    expect(progress).toEqual([[1, 1]])
  })
})

const MASTER = "https://master.example/"
const MASTER_ASSETS_URL = `${MASTER}data/assets.json`
const MASTER_LOCAL_URL = `${MASTER}data/local-assets.json`
const KALTS: AssetKey = "image:char/avatar/char_003_kalts"
const MASTER_ASSETS = {
  version: 1,
  hash: "abc123",
  chars: { char_003_kalts: { avatar: "/assets/char/avatar/char_003_kalts.png" } },
  skills: { skchr_kalts_1: "/assets/skill/skchr_kalts_1.png" },
}
const COMPAT_BASE = manifest(BASE, { [KALTS]: image("dd".repeat(32)), [AMIYA]: image() })

function compatOptions(fetch: typeof globalThis.fetch, extra: Partial<CompatResourceStoreOptions> = {}): ResourceStoreOptions {
  return {
    compat: { backend: MASTER },
    local: LOCAL_URL,
    fetch,
    retryDelays: [0, 0],
    loadImage: async (url) => ({ src: url }),
    ...extra,
  }
}

describe("resource store compat mode", () => {
  it("reads the master assets.json and resolves its keys to master files, with no base or season pack", async () => {
    const fake = fakeFetch({
      [MASTER_ASSETS_URL]: [ok(MASTER_ASSETS)],
      [MASTER_LOCAL_URL]: [{ status: 404 }],
      [LOCAL_URL]: [{ status: 404 }],
    })
    const store = await loadResourceStore(compatOptions(fake.fetch))
    expect(store.resolver.resolve(KALTS)?.pack.type).toBe("upstream")
    expect(store.resolver.resolve(KALTS)?.files[0]?.url).toBe(`${MASTER}assets/char/avatar/char_003_kalts.png`)
    expect(store.ref("chars.char_003_kalts.avatar")).toBe(KALTS)
    expect(store.ref("skills.skchr_kalts_1")).toBe("image:skill/skchr_kalts_1")
    expect(store.compatIssues).toEqual([])
    expect(fake.callsTo(manifestUrl(BASE))).toBe(0)
    expect(fake.callsTo(manifestUrl(SEASON))).toBe(0)
  })

  it("treats a missing local-assets.json as no local art, and keeps the local overlay of the local option", async () => {
    const fake = fakeFetch({
      [MASTER_ASSETS_URL]: [ok(MASTER_ASSETS)],
      [MASTER_LOCAL_URL]: [{ status: 404 }],
      [LOCAL_URL]: [{ status: 404 }],
    })
    const store = await loadResourceStore(compatOptions(fake.fetch))
    expect(fake.callsTo(MASTER_LOCAL_URL)).toBe(1)
    expect(store.resolver.layers.map((layer) => layer.manifest.pack.type)).toEqual(["upstream", "local"])
    expect(store.resolver.layers[1]?.manifest.assets).toEqual({})
  })

  it("reads the master local-assets.json as a layer of its own when the backend has one", async () => {
    const localMaster = { version: 1, source: "local", count: 0, groups: {} }
    const fake = fakeFetch({
      [MASTER_ASSETS_URL]: [ok(MASTER_ASSETS)],
      [MASTER_LOCAL_URL]: [ok(localMaster)],
      [LOCAL_URL]: [{ status: 404 }],
    })
    const store = await loadResourceStore(compatOptions(fake.fetch))
    expect(store.compatIssues).toEqual([])
    expect(store.resolver.resolve(KALTS)?.pack.type).toBe("upstream")
  })

  it("puts the next base under the upstream layer, so a key only the base has falls back to it and upstream keys are kept", async () => {
    const fake = fakeFetch(standardScript({
      [MASTER_ASSETS_URL]: [ok(MASTER_ASSETS)],
      [MASTER_LOCAL_URL]: [{ status: 404 }],
      [manifestUrl(BASE)]: [ok(COMPAT_BASE)],
    }))
    const store = await loadResourceStore(compatOptions(fake.fetch, { compat: { backend: MASTER, nextBase: manifestUrl(BASE) } }))
    expect(store.resolver.layers.map((layer) => layer.manifest.pack.type)).toEqual(["base", "upstream", "local"])
    expect(store.resolver.resolve(KALTS)?.pack.type).toBe("upstream")
    expect(store.resolver.resolve(AMIYA)?.pack.type).toBe("base")
    expect(fake.callsTo(manifestUrl(SEASON))).toBe(0)
  })

  it("reports the addresses the master mapping could not place", async () => {
    const fake = fakeFetch({
      [MASTER_ASSETS_URL]: [ok({ ...MASTER_ASSETS, bonds: { odd: "/assets/misc/odd.png" } })],
      [MASTER_LOCAL_URL]: [{ status: 404 }],
      [LOCAL_URL]: [{ status: 404 }],
    })
    const store = await loadResourceStore(compatOptions(fake.fetch))
    expect(store.compatIssues).toEqual([{ source: "assets", path: "bonds.odd", address: "/assets/misc/odd.png", reason: "does not match the address pattern of bonds" }])
  })

  it("retries a server error of the master assets.json and does not retry a missing one", async () => {
    const transient = fakeFetch({
      [MASTER_ASSETS_URL]: [{ status: 503 }, ok(MASTER_ASSETS)],
      [MASTER_LOCAL_URL]: [{ status: 404 }],
      [LOCAL_URL]: [{ status: 404 }],
    })
    await loadResourceStore(compatOptions(transient.fetch))
    expect(transient.callsTo(MASTER_ASSETS_URL)).toBe(2)

    const missing = fakeFetch({ [MASTER_ASSETS_URL]: [{ status: 404 }], [LOCAL_URL]: [{ status: 404 }] })
    await expect(loadResourceStore(compatOptions(missing.fetch))).rejects.toThrow("404")
    expect(missing.callsTo(MASTER_ASSETS_URL)).toBe(1)
  })

  it("needs either compat or both base and season", async () => {
    const { fetch } = fakeFetch({})
    await expect(loadResourceStore({ fetch } as unknown as ResourceStoreOptions)).rejects.toThrow("needs either compat, or both base and season")
  })
})
