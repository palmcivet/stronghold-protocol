import { describe, expect, test } from "vitest"
import { AssetAddressError, fileAddress, fileUrl, isMultiFileKind } from "#address/file.js"
import { ASSET_KINDS, type AssetKey } from "#key/asset-key.js"
import type { FileFormat } from "#schema/asset-file.js"

const HASH = "0123456789abcdef".repeat(4)

describe("file address of each kind", () => {
  const single: readonly [AssetKey, FileFormat, string][] = [
    ["image:char/avatar/char_002_amiya", "png", "image/char/avatar/char_002_amiya.png"],
    ["image:char/avatar/char_002_amiya", "webp", "image/char/avatar/char_002_amiya.webp"],
    ["texture:map/autochess/TX_autochessi_D", "png", "texture/map/autochess/TX_autochessi_D.png"],
    ["texture:map/autochess/TX_autochessi_D", "webp", "texture/map/autochess/TX_autochessi_D.webp"],
    ["audio:bgm/m_bat_autochess_loop", "mp3", "audio/bgm/m_bat_autochess_loop.mp3"],
    ["font:bender/regular", "woff2", "font/bender/regular.woff2"],
    ["font:bender/regular", "otf", "font/bender/regular.otf"],
    ["model:mesh/autochess/board_frame", "obj", "model/mesh/autochess/board_frame.obj"],
    ["json:spine-meta/enemy/enemy_1007_slime", "json", "json/spine-meta/enemy/enemy_1007_slime.json"],
  ]

  test.each(single)("%s as %s", (key, format, address) => {
    expect(fileAddress(key, { name: null, format })).toBe(address)
  })

  test("spine files share one directory named by the key path", () => {
    const key = "spine:enemy/enemy_1007_slime"
    expect(fileAddress(key, { name: "enemy_1007_slime.skel", format: "skel" })).toBe("spine/enemy/enemy_1007_slime/enemy_1007_slime.skel")
    expect(fileAddress(key, { name: "enemy_1007_slime.atlas", format: "atlas" })).toBe("spine/enemy/enemy_1007_slime/enemy_1007_slime.atlas")
    expect(fileAddress(key, { name: "enemy_1007_slime_2.png", format: "png" })).toBe("spine/enemy/enemy_1007_slime/enemy_1007_slime_2.png")
    expect(fileAddress(key, { name: "enemy_1007_slime.meta.json", format: "json" })).toBe("spine/enemy/enemy_1007_slime/enemy_1007_slime.meta.json")
  })

  test("every kind has a rule", () => {
    for (const kind of ASSET_KINDS) {
      const key = `${kind}:a/b` as AssetKey
      const address = isMultiFileKind(kind) ? fileAddress(key, { name: "b.json", format: "json" }) : fileAddress(key, { name: null, format: "json" })
      expect(address.startsWith(`${kind}/a/b`)).toBe(true)
    }
  })

  test("a multi-file kind needs a plain name and a single-file kind takes none", () => {
    expect(() => fileAddress("spine:enemy/x", { name: null, format: "skel" })).toThrow(AssetAddressError)
    expect(() => fileAddress("spine:enemy/x", { name: "../x.skel", format: "skel" })).toThrow(AssetAddressError)
    expect(() => fileAddress("spine:enemy/x", { name: ".skel", format: "skel" })).toThrow(AssetAddressError)
    expect(() => fileAddress("image:char/avatar/x", { name: "x.png", format: "png" })).toThrow(AssetAddressError)
    expect(() => fileAddress("image:x.png" as AssetKey, { name: null, format: "png" })).toThrow(/invalid asset key/)
  })
})

describe("file url", () => {
  const manifestUrl = "https://cdn.example/res/packs/base/1.0.0-r1/manifest.json"

  test("the address resolves against fileRoot and the manifest url, with ?v=<12 hex>", () => {
    const url = fileUrl({ manifestUrl, fileRoot: "../../../files/", key: "audio:bgm/m_bat_autochess_loop", file: { role: "main", name: null, format: "mp3", bytes: 1, hash: HASH } })
    expect(url).toBe("https://cdn.example/res/files/audio/bgm/m_bat_autochess_loop.mp3?v=0123456789ab")
  })

  test("audio has no special route", () => {
    const url = fileUrl({ manifestUrl, fileRoot: "../../../files/", key: "audio:voice/cn/char_002_amiya/CN_001", file: { role: "main", name: null, format: "mp3", bytes: 1, hash: HASH } })
    expect(new URL(url).pathname).toBe("/res/files/audio/voice/cn/char_002_amiya/CN_001.mp3")
    expect(url).not.toContain("/media/")
  })

  test("href wins over the layout and an empty hash adds no version", () => {
    const base = { role: "main", name: null, format: "png", bytes: 1 } as const
    expect(fileUrl({ manifestUrl, fileRoot: "https://upstream.example/", key: "image:char/avatar/x", file: { ...base, hash: "", href: "assets/avatar/x.png" } })).toBe(
      "https://upstream.example/assets/avatar/x.png",
    )
    expect(fileUrl({ manifestUrl, fileRoot: "../../../files/", key: "image:char/avatar/x", file: { ...base, hash: "", href: "https://other.example/a.png" } })).toBe("https://other.example/a.png")
    expect(fileUrl({ manifestUrl, fileRoot: "../../../files/", key: "image:char/avatar/x", file: { ...base, hash: HASH, href: "https://other.example/a.png?s=1" } })).toBe(
      "https://other.example/a.png?s=1&v=0123456789ab",
    )
  })

  test("a relative manifest url is rejected", () => {
    expect(() => fileUrl({ manifestUrl: "/res/packs/base/1/manifest.json", fileRoot: "../../../files/", key: "image:x", file: { role: "main", name: null, format: "png", bytes: 1, hash: HASH } })).toThrow(TypeError)
  })
})
