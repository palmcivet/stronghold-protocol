import { describe, expect, it } from "vitest"
import {
  createAssetResolver,
  packFileRoot,
  packManifestAddress,
  packManifestIssues,
  type AssetKey,
  type PackAsset,
  type PackManifest,
  type PublishedPack,
} from "arknights-assets-catalog"
import { buildUpstreamManifest } from "arknights-compat-upstream"
import { readFile } from "node:fs/promises"

const UPSTREAM_URL = "http://127.0.0.1:3000/data/assets.json"
const BASE: PublishedPack = { type: "base", id: "base", version: "1", contentHash: "aa".repeat(32) }
const BASE_URL = `https://next.example/res/${packManifestAddress(BASE)}`

const SHARED: AssetKey = "image:char/avatar/char_003_kalts"
const BASE_ONLY: AssetKey = "image:skill/skchr_only_in_base"

function image(hash: string): PackAsset {
  return {
    kind: "image",
    files: [{ role: "main", name: null, format: "png", bytes: 1, hash }],
    dependsOn: [],
    fallbackId: null,
    preloadGroup: null,
  }
}

function baseManifest(): PackManifest {
  const manifest: PackManifest = {
    schemaVersion: 1,
    pack: { ...BASE },
    requires: [],
    fileRoot: packFileRoot(BASE),
    assets: { [SHARED]: image("bb".repeat(32)), [BASE_ONLY]: image("cc".repeat(32)) },
    refs: { skills: { skchr_only_in_base: BASE_ONLY } },
  }
  if (packManifestIssues(manifest).length > 0) throw new Error("the test base manifest is invalid")
  return manifest
}

async function upstreamManifest(): Promise<PackManifest> {
  const assets: unknown = JSON.parse(await readFile(new URL("./fixtures/assets.json", import.meta.url), "utf8"))
  const { manifest } = await buildUpstreamManifest({ backend: "http://127.0.0.1:3000/", assets })
  return manifest
}

describe("upstream layer over the next base pack", () => {
  it("keeps a key the upstream layer has, and resolves a key only the base has to the base", async () => {
    const resolver = createAssetResolver([
      { manifest: baseManifest(), url: BASE_URL },
      { manifest: await upstreamManifest(), url: UPSTREAM_URL },
    ])

    const shared = resolver.resolve(SHARED)
    expect(shared?.pack).toMatchObject({ type: "upstream", id: "master" })
    expect(shared?.files[0]?.url).toBe("http://127.0.0.1:3000/assets/char/avatar/char_003_kalts.png")

    const baseOnly = resolver.resolve(BASE_ONLY)
    expect(baseOnly?.pack).toMatchObject({ type: "base", id: "base" })
    expect(baseOnly?.files[0]?.url).toBe(`https://next.example/res/files/image/skill/skchr_only_in_base.png?v=${"cc".repeat(6)}`)
  })

  it("does not fall back to the base for a key the upstream layer lacks when no base is configured", async () => {
    const resolver = createAssetResolver([{ manifest: await upstreamManifest(), url: UPSTREAM_URL }])
    expect(resolver.resolve(BASE_ONLY)).toBeNull()
    expect(resolver.resolve(SHARED)?.pack.type).toBe("upstream")
  })

  it("resolves the refs of the upstream layer under the base layer's refs", async () => {
    const resolver = createAssetResolver([
      { manifest: baseManifest(), url: BASE_URL },
      { manifest: await upstreamManifest(), url: UPSTREAM_URL },
    ])
    expect(resolver.ref("chars.char_003_kalts.avatar")).toBe(SHARED)
    expect(resolver.ref("skills.skchr_only_in_base")).toBe(BASE_ONLY)
  })
})
