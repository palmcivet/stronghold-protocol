import { describe, expect, test } from "vitest"
import {
  ASSET_KEY_MAX_LENGTH,
  ASSET_KINDS,
  AssetKeyError,
  assetKeyIssue,
  assetKindOf,
  assetPathOf,
  formatAssetKey,
  isAssetKey,
  isAssetKind,
  parseAssetKey,
} from "#key/asset-key.js"

const VALID = [
  "image:char/avatar/char_002_amiya",
  "image:char/avatar/char_002_amiya_2",
  "spine:enemy/enemy_1007_slime",
  "audio:bgm/m_bat_autochess_loop",
  "audio:voice/cn/char_002_amiya/CN_001",
  "font:bender/regular",
  "font:novecento-wide/normal",
  "texture:map/autochess/TX_autochessi_D",
  "model:mesh/autochess/board_frame",
  "json:spine-meta/enemy/enemy_1007_slime",
  "json:gamedata/character_table",
  "image:a",
  `json:${["a", "b", "c", "d", "e", "f", "g", "h"].join("/")}`,
]

const INVALID: readonly [unknown, RegExp][] = [
  [42, /not a string/],
  [null, /not a string/],
  ["", /missing ':'/],
  ["char/avatar/char_002_amiya", /missing ':'/],
  ["data:char/avatar/x", /unknown kind "data"/],
  ["Image:char/avatar/x", /unknown kind "Image"/],
  [":char/avatar/x", /unknown kind ""/],
  ["image:", /empty path/],
  ["image:/char/avatar", /empty path segment/],
  ["image:char/avatar/", /empty path segment/],
  ["image:char//avatar", /empty path segment/],
  ["image:char/avatar/x.png", /segment "x.png"/],
  ["image:char/../secret", /segment "\.\."/],
  ["image:char/./x", /segment "\."/],
  ["image:char/avatar/char 002", /segment "char 002"/],
  ["image:char/avatar/char_002[alpha]", /segment "char_002\[alpha\]"/],
  ["image:char/avatar/#1", /segment "#1"/],
  ["image:char\\avatar", /segment "char\\avatar"/],
  ["image:char/avatar/x?v=1", /segment "x\?v=1"/],
  ["image:char:avatar", /segment "char:avatar"/],
  ["image:a/b/c/d/e/f/g/h/i", /more than 8 path segments/],
  [`json:${"a".repeat(ASSET_KEY_MAX_LENGTH)}`, /longer than 200 characters/],
]

describe("asset key syntax", () => {
  test.each(VALID)("%s is a key", (key) => {
    expect(assetKeyIssue(key)).toBeNull()
    expect(isAssetKey(key)).toBe(true)
  })

  test.each(INVALID)("%j is not a key", (value, reason) => {
    expect(assetKeyIssue(value)).toMatch(reason)
    expect(isAssetKey(value)).toBe(false)
  })

  test("the length limit counts the whole key", () => {
    const longest = `json:${"a".repeat(ASSET_KEY_MAX_LENGTH - "json:".length)}`
    expect(longest).toHaveLength(ASSET_KEY_MAX_LENGTH)
    expect(isAssetKey(longest)).toBe(true)
    expect(isAssetKey(`${longest}a`)).toBe(false)
  })

  test("case is kept and matters", () => {
    expect(isAssetKey("texture:map/autochess/TX_autochessi_D")).toBe(true)
    expect("texture:map/autochess/TX_autochessi_D").not.toBe("texture:map/autochess/tx_autochessi_d")
    expect(parseAssetKey("texture:map/autochess/TX_autochessi_D").segments).toEqual(["map", "autochess", "TX_autochessi_D"])
  })
})

describe("parse and format", () => {
  test("parse splits kind, path, segments and namespace", () => {
    expect(parseAssetKey("audio:voice/cn/char_002_amiya/CN_001")).toEqual({
      key: "audio:voice/cn/char_002_amiya/CN_001",
      kind: "audio",
      path: "voice/cn/char_002_amiya/CN_001",
      segments: ["voice", "cn", "char_002_amiya", "CN_001"],
      namespace: "voice",
    })
  })

  test("parse throws AssetKeyError with the reason", () => {
    expect(() => parseAssetKey("image:x.png")).toThrow(AssetKeyError)
    expect(() => parseAssetKey("image:x.png")).toThrow(/invalid asset key "image:x.png": segment "x.png"/)
  })

  test("format builds and checks a key", () => {
    expect(formatAssetKey("spine", "enemy/enemy_1007_slime")).toBe("spine:enemy/enemy_1007_slime")
    expect(() => formatAssetKey("spine", "enemy/enemy_1007_slime.skel")).toThrow(AssetKeyError)
    for (const key of VALID) {
      const parsed = parseAssetKey(key)
      expect(formatAssetKey(parsed.kind, parsed.path)).toBe(key)
    }
  })

  test("kind and path of a key", () => {
    expect(assetKindOf("json:board/autochess/tiles")).toBe("json")
    expect(assetPathOf("json:board/autochess/tiles")).toBe("board/autochess/tiles")
  })

  test("the kind table", () => {
    expect(ASSET_KINDS).toEqual(["image", "texture", "spine", "audio", "font", "model", "json"])
    for (const kind of ASSET_KINDS) expect(isAssetKind(kind)).toBe(true)
    expect(isAssetKind("data")).toBe(false)
    expect(isAssetKind("toString")).toBe(false)
  })
})
