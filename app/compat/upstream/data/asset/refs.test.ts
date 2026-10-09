import { describe, expect, it } from "vitest"
import type { AssetKey } from "arknights-assets-catalog"
import { RefTable } from "#data/asset/refs.js"

const AMIYA = "image:char/avatar/char_002_amiya" as AssetKey
const OTHER = "image:char/avatar/char_003_kalts" as AssetKey

describe("refs table", () => {
  it("sets and reads a key by path", () => {
    const refs = new RefTable()
    expect(refs.set(["chars", "char_002_amiya", "avatar"], AMIYA)).toBeNull()
    expect(refs.get(["chars", "char_002_amiya", "avatar"])).toBe(AMIYA)
    expect(refs.get(["chars", "char_002_amiya"])).toBeNull()
    expect(refs.get(["chars", "missing", "avatar"])).toBeNull()
  })

  it("accepts the same key twice at one path", () => {
    const refs = new RefTable()
    refs.set(["bgm", "x"], AMIYA)
    expect(refs.set(["bgm", "x"], AMIYA)).toBeNull()
  })

  it("reports a path that already holds another key, and keeps the first", () => {
    const refs = new RefTable()
    refs.set(["bgm", "x"], AMIYA)
    expect(refs.set(["bgm", "x"], OTHER)).toBe("bgm.x already refers to another key")
    expect(refs.get(["bgm", "x"])).toBe(AMIYA)
  })

  it("holds a list of keys and reports a list that differs", () => {
    const refs = new RefTable()
    refs.set(["voice", "char_002_amiya", "select"], [AMIYA, OTHER])
    expect(refs.set(["voice", "char_002_amiya", "select"], [AMIYA, OTHER])).toBeNull()
    expect(refs.set(["voice", "char_002_amiya", "select"], [OTHER])).toBe("voice.char_002_amiya.select already refers to another key")
    expect(refs.get(["voice", "char_002_amiya", "select"])).toBeNull()
  })

  it("reports a path that runs through a key", () => {
    const refs = new RefTable()
    refs.set(["chars", "char_002_amiya"], AMIYA)
    expect(refs.set(["chars", "char_002_amiya", "avatar"], OTHER)).toBe("chars.char_002_amiya is already a key, so chars.char_002_amiya.avatar cannot be set")
  })

  it("rejects an empty path", () => {
    expect(new RefTable().set([], AMIYA)).toBe("a ref needs a non-empty path")
  })
})
