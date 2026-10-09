import { describe, expect, it } from "vitest"
import { packManifestIssues } from "arknights-assets-catalog"
import { buildUpstreamManifest } from "#data/asset/upstream.js"

const BACKEND = "https://master.example/"

function masterInput(sections: Record<string, unknown>, extra: { readonly localAssets?: unknown; readonly seasonId?: string } = {}) {
  return { backend: BACKEND, assets: { version: 1, hash: "abc123", ...sections }, ...extra }
}

describe("contentHash", () => {
  it("does not change when only the key order of the master file changes", async () => {
    const forward = await buildUpstreamManifest(masterInput({ bonds: { a: "/assets/bond/a.png", b: "/assets/bond/b.png" }, bands: { c: "/assets/band/c.png" } }))
    const reversed = await buildUpstreamManifest(masterInput({ bands: { c: "/assets/band/c.png" }, bonds: { b: "/assets/bond/b.png", a: "/assets/bond/a.png" } }))
    expect(reversed.manifest.pack.contentHash).toBe(forward.manifest.pack.contentHash)
    expect(forward.manifest.pack.contentHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("changes when a master address changes", async () => {
    const before = await buildUpstreamManifest(masterInput({ chars: { char_003_kalts: { portrait: "/assets/char/portrait/char_003_kalts_1.png" } } }))
    const after = await buildUpstreamManifest(masterInput({ chars: { char_003_kalts: { portrait: "/assets/char/portrait/char_003_kalts_9.png" } } }))
    expect(after.manifest.pack.contentHash).not.toBe(before.manifest.pack.contentHash)
  })
})

describe("upstream manifest", () => {
  it("names the pack from the master version and hash, with the backend as file root", async () => {
    const { manifest, issues } = await buildUpstreamManifest(masterInput({ bonds: { yanShip: "/assets/bond/yanShip.png" } }))
    expect(manifest.pack).toMatchObject({ type: "upstream", id: "master", version: "1+abc123" })
    expect(manifest.fileRoot).toBe(BACKEND)
    expect(manifest.requires).toEqual([])
    expect(issues).toEqual([])
    expect(packManifestIssues(manifest)).toEqual([])
  })

  it("keeps an address the rules do not map out of the assets, and reports it", async () => {
    const { manifest, issues } = await buildUpstreamManifest(masterInput({ bonds: { x: "/assets/misc/x.png" } }))
    expect(manifest.assets).toEqual({})
    expect(issues).toEqual([{ source: "assets", path: "bonds.x", address: "/assets/misc/x.png", reason: "does not match the address pattern of bonds" }])
  })

  it("reports a ui path that is not a valid key path, and maps nothing for it", async () => {
    const { manifest, issues } = await buildUpstreamManifest(masterInput({
      ui: { "a.b": "/assets/ui/a.b.png", "sub dir/x": "/assets/ui/sub dir/x.png", "garrisonTypeIcon/icon_bond": "/assets/ui/garrisonTypeIcon/icon_bond.png" },
    }))
    expect(Object.keys(manifest.assets)).toEqual(["image:ui/garrisonTypeIcon/icon_bond"])
    expect(issues.map((issue) => issue.path)).toEqual(["ui.a.b", "ui.sub dir/x"])
    expect(issues[0]?.reason).toMatch(/^invalid key "image:ui\/a\.b": segment "a\.b"/)
  })

  it("keeps the first of two addresses that map to one key and reports the second", async () => {
    const { manifest, issues } = await buildUpstreamManifest(masterInput({
      audio: { sfx: { battle: { first: "/assets/audio/sfx/battle/a/x.mp3", second: "/assets/audio/sfx/battle/b/x.mp3" } } },
    }))
    expect(manifest.assets["audio:sfx/battle/x"]?.files[0]?.href).toBe("https://master.example/media/sfx/battle/a/x")
    expect(issues).toEqual([{
      source: "assets",
      path: "audio.sfx.battle.second",
      address: "/assets/audio/sfx/battle/b/x.mp3",
      reason: "audio:sfx/battle/x is already mapped from another address; the first one is kept",
    }])
  })

  it("accepts one address under two names without an issue", async () => {
    const loop = "/assets/audio/bgm/m_bat_ancestor_loop.mp3"
    const { manifest, issues } = await buildUpstreamManifest(masterInput({ audio: { bgm: { lobby: { loop } }, bossBgm: { boss_1: { loop } } } }))
    expect(Object.keys(manifest.assets)).toEqual(["audio:bgm/m_bat_ancestor_loop"])
    expect(issues).toEqual([])
  })

  it("reports a skill name in skillsById that has no skill key", async () => {
    const { manifest, issues } = await buildUpstreamManifest(masterInput({ skills: {}, skillsById: { skchr_x_1: "missing" } }))
    expect(manifest.refs).toEqual({})
    expect(issues).toEqual([{ source: "assets", path: "skillsById.skchr_x_1", address: null, reason: "names skills.missing, which has no key" }])
  })

  it("reports a Spine record with no texture and maps no key for it", async () => {
    const { manifest, issues } = await buildUpstreamManifest(masterInput({
      chars: { char_x: { spine: { front: { skel: "/assets/spine/op/char_x/front/char_x.skel", atlas: "/assets/spine/op/char_x/front/char_x.atlas", textures: [] } } } },
    }))
    expect(manifest.assets).toEqual({})
    expect(issues).toEqual([{ source: "assets", path: "chars.char_x.spine.front", address: null, reason: "a Spine record needs skel, atlas and a non-empty textures list" }])
  })

  it("names trap item images after the season id it is given", async () => {
    const { manifest } = await buildUpstreamManifest(masterInput({ items: { trap_1: "/assets/item/trap_1.png" } }, { seasonId: "season2" }))
    expect(Object.keys(manifest.assets)).toEqual(["image:season/season2/trap/trap_1"])
    expect(manifest.refs).toEqual({ items: { trap_1: "image:season/season2/trap/trap_1" } })
  })

  it("does not map unit sound volumes and pitches", async () => {
    const { manifest, issues } = await buildUpstreamManifest(masterInput({
      audio: { sfx: { units: { char_1026: { hit: "/assets/audio/sfx/player/p_imp/p_imp_crocsaw_n.mp3", mix: { hit: { vol: 1.5 } } } } } },
    }))
    expect(Object.keys(manifest.assets)).toEqual(["audio:sfx/battle/p_imp_crocsaw_n"])
    expect(issues).toEqual([])
  })

  it("maps local-assets.json with the same sections, and treats the empty stand-in as nothing", async () => {
    const empty = await buildUpstreamManifest(masterInput({}, { localAssets: { version: 1, source: "none", count: 0, groups: {} } }))
    expect(empty.issues).toEqual([])

    const local = await buildUpstreamManifest(masterInput({}, { localAssets: { bonds: { local: "/assets/bond/local.png" } } }))
    expect(Object.keys(local.manifest.assets)).toEqual(["image:bond/local"])
    expect(local.issues).toEqual([])
  })

  it("reports a local-assets.json in the groups shape, which is not mapped", async () => {
    const { manifest, issues } = await buildUpstreamManifest(masterInput({}, { localAssets: { version: 1, source: "local", count: 1, groups: { "spine/enemy/x": { skel: "x.skel" } } } }))
    expect(manifest.assets).toEqual({})
    expect(issues).toEqual([{ source: "local-assets", path: "groups.spine/enemy/x", address: null, reason: "no rule maps this path" }])
  })

  it("rejects a backend that is not an absolute URL", async () => {
    await expect(buildUpstreamManifest({ backend: "/master/", assets: { version: 1, hash: "abc" } })).rejects.toThrow("absolute URL")
  })

  it("rejects a master file without version and hash", async () => {
    await expect(buildUpstreamManifest({ backend: BACKEND, assets: { bonds: {} } })).rejects.toThrow("version and a hash")
  })
})
