import { expect, test } from "vitest"
import { formatAssetKey, type AssetKey, type AssetKind, type Need, type PackManifest, type RawEntry } from "arknights-assets-catalog"
import { buildPack, droppedKeys, isSeasonKey, type PackInput } from "#compiler/media/pack/manifest.js"

const HASH = "a".repeat(64)

function entryOf(key: AssetKey): RawEntry {
  const kind = key.slice(0, key.indexOf(":")) as AssetKind
  const file = { bytes: 3, hash: HASH }
  const files: RawEntry["files"] =
    kind === "spine"
      ? [
          { role: "skel", name: "model.skel", format: "skel", ...file },
          { role: "atlas", name: "model.atlas", format: "atlas", ...file },
          { role: "page", name: "model.png", format: "png", ...file },
        ]
      : [{ role: "main", name: null, format: kind === "audio" ? "mp3" : kind === "json" ? "json" : kind === "font" ? "woff2" : "png", ...file }]
  return { key, kind, files, dependsOn: [], source: { id: "test", path: key, revision: null } }
}

function entries(...keys: readonly AssetKey[]): Map<AssetKey, RawEntry> {
  return new Map(keys.map((key) => [key, entryOf(key)]))
}

function need(key: AssetKey, required = false): Need {
  return { key, required }
}

function baseInput(overrides: Partial<PackInput>): PackInput {
  return { type: "base", id: "base", version: "78.0.0+r1", requires: [], needs: [], entries: new Map(), charword: null, ...overrides }
}

test("refs come from the key paths and hold only keys the pack contains", () => {
  const avatar = formatAssetKey("image", "char/avatar/char_002_amiya")
  const build = buildPack(
    baseInput({
      needs: [need(avatar, true), need(formatAssetKey("image", "char/avatar/char_002_amiya_2")), need(formatAssetKey("spine", "char/char_002_amiya/front"))],
      entries: entries(avatar, formatAssetKey("spine", "char/char_002_amiya/front")),
    }),
  )
  expect(build.missingRequired).toEqual([])
  expect(build.missingOptional).toEqual([formatAssetKey("image", "char/avatar/char_002_amiya_2")])
  expect(build.manifest.refs).toEqual({
    chars: { char_002_amiya: { avatar, spine: { front: formatAssetKey("spine", "char/char_002_amiya/front") } } },
  })
})

test("a missing required need is reported and an optional one is not", () => {
  const build = buildPack(baseInput({ needs: [need(formatAssetKey("image", "char/avatar/char_x"), true), need(formatAssetKey("image", "camp/y"))] }))
  expect(build.missingRequired).toEqual([formatAssetKey("image", "char/avatar/char_x")])
  expect(build.missingOptional).toEqual([formatAssetKey("image", "camp/y")])
})

test("keys of the other namespace group are reported as misplaced", () => {
  const season = formatAssetKey("image", "ui/autochess/logo")
  const build = buildPack(baseInput({ needs: [need(season)], entries: entries(season) }))
  expect(build.misplaced).toEqual([season])
  expect(isSeasonKey(season)).toBe(true)
  expect(isSeasonKey(formatAssetKey("image", "camp/rhodes"))).toBe(false)
})

test("a summon skin variant is a ref next to its front spine", () => {
  const front = formatAssetKey("spine", "token/token_a/front")
  const variant = formatAssetKey("spine", "token/token_a/token_a_epoque_1")
  const build = buildPack(baseInput({ needs: [need(front), need(variant)], entries: entries(front, variant) }))
  expect(build.manifest.refs).toEqual({ tokens: { token_a: { spine: front, spineVariants: { token_a_epoque_1: variant } } } })
})

test("the board tiles of a season are a ref of the board theme", () => {
  const tiles = formatAssetKey("json", "board/autochess/tiles")
  const build = buildPack({
    type: "season",
    id: "act2autochess",
    version: "2026.10.09",
    requires: [{ type: "base", id: "base", version: "78.0.0+r1" }],
    needs: [need(tiles)],
    entries: entries(tiles),
    charword: null,
  })
  expect(build.misplaced).toEqual([])
  expect(build.manifest.refs).toEqual({ board: { theme: tiles } })
})

test("fonts are refs by family and weight, and keys of the other pack kind stay out of refs", () => {
  const font = formatAssetKey("font", "bender/regular")
  const season = formatAssetKey("audio", "bgm/m_bat")
  const build = buildPack(baseInput({ needs: [need(font), need(season)], entries: entries(font, season) }))
  expect(build.misplaced).toEqual([season])
  expect(build.manifest.refs).toEqual({ fonts: { bender: { regular: font } } })
})

test("gamedata tables are never published", () => {
  const table = formatAssetKey("json", "gamedata/excel/activity_table")
  const build = buildPack(baseInput({ needs: [need(table, true)], entries: entries(table) }))
  expect(build.manifest.assets).toEqual({})
  expect(build.missingRequired).toEqual([])
})

test("a fallback is written only when its target is in the pack", () => {
  const avatar = formatAssetKey("image", "char/avatar/char_002_amiya")
  const elite = formatAssetKey("image", "char/avatar/char_002_amiya_2")
  const paired = buildPack(baseInput({ needs: [need(avatar), need(elite)], entries: entries(avatar, elite) }))
  expect(paired.manifest.assets[elite]?.fallbackId).toBe(avatar)
  const alone = buildPack(baseInput({ needs: [need(elite)], entries: entries(elite) }))
  expect(alone.manifest.assets[elite]?.fallbackId).toBeNull()
})

test("the content hash ignores key order and the file root, and follows the content", () => {
  const first = formatAssetKey("image", "camp/rhodes")
  const second = formatAssetKey("image", "camp/abyssal")
  const forward = buildPack(baseInput({ needs: [need(first), need(second)], entries: entries(first, second) }))
  const backward = buildPack(baseInput({ needs: [need(second), need(first)], entries: entries(second, first) }))
  expect(forward.manifest.pack.contentHash).toBe(backward.manifest.pack.contentHash)
  expect(forward.manifest.fileRoot).toBe("../../../files/")
  const extra = buildPack(baseInput({ needs: [need(first)], entries: entries(first) }))
  expect(extra.manifest.pack.contentHash).not.toBe(forward.manifest.pack.contentHash)
})

test("a season manifest is addressed by its content hash", () => {
  const build = buildPack({
    type: "season",
    id: "act2autochess",
    version: "2026.10.09",
    requires: [{ type: "base", id: "base", version: "78.0.0+r1" }],
    needs: [need(formatAssetKey("json", "anim-roles/act2autochess"))],
    entries: entries(formatAssetKey("json", "anim-roles/act2autochess")),
    charword: null,
  })
  expect(build.manifest.fileRoot).toBe("../../../../files/")
  expect(build.manifest.pack.contentHash).toHaveLength(64)
})

test("droppedKeys lists the keys of the previous manifest that the new one lacks", () => {
  const next = buildPack(baseInput({ needs: [need(formatAssetKey("image", "camp/a"))], entries: entries(formatAssetKey("image", "camp/a")) })).manifest
  const previous = { assets: { "image:camp/a": {}, "image:camp/b": {} } }
  expect(droppedKeys(previous, next)).toEqual(["image:camp/b"])
  expect(droppedKeys(null, next)).toEqual([])
})

test("the built manifest passes the catalog schema", () => {
  const build = buildPack(baseInput({ needs: [need(formatAssetKey("image", "camp/a"))], entries: entries(formatAssetKey("image", "camp/a")) }))
  const manifest: PackManifest = build.manifest
  expect(manifest.schemaVersion).toBe(1)
})
