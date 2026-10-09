import { expect, test } from "vitest"
import type { PackRefs } from "#schema/pack-manifest.js"
import { mergeRefs, refKeyAt, refNodeAt } from "#resolver/refs.js"

test("objects merge by field; keys and arrays from higher layers replace", () => {
  const base: PackRefs = {
    chars: { a: { avatar: "image:char/avatar/a", spine: "spine:char/a/front" }, b: { avatar: "image:char/avatar/b" } },
    voices: ["audio:voice/cn/a/CN_001", "audio:voice/cn/a/CN_002"],
    theme: { board: "json:board/a/tiles" },
  }
  const mod: PackRefs = {
    chars: { a: { spine: "spine:skin/a_1/front" } },
    voices: ["audio:voice/cn/a/CN_009"],
    theme: "json:board/b/tiles",
  }
  expect(mergeRefs([base, mod])).toEqual({
    chars: { a: { avatar: "image:char/avatar/a", spine: "spine:skin/a_1/front" }, b: { avatar: "image:char/avatar/b" } },
    voices: ["audio:voice/cn/a/CN_009"],
    theme: "json:board/b/tiles",
  })
  expect(mergeRefs([mod, { theme: { board: "json:board/c/tiles" } }]).theme).toEqual({ board: "json:board/c/tiles" })
  expect(mergeRefs([])).toEqual({})
  expect(base.chars).toEqual({ a: { avatar: "image:char/avatar/a", spine: "spine:char/a/front" }, b: { avatar: "image:char/avatar/b" } })
})

test("a __proto__ name stays an own field", () => {
  const merged = mergeRefs([JSON.parse('{"__proto__":{"x":"image:a"}}') as PackRefs])
  expect(Object.getPrototypeOf(merged)).toBe(Object.prototype)
  expect(refKeyAt(merged, ["__proto__", "x"])).toBe("image:a")
})

test("lookups walk objects and arrays", () => {
  const refs: PackRefs = { voices: ["audio:voice/cn/a/CN_001"], chars: { a: { avatar: "image:char/avatar/a" } } }
  expect(refKeyAt(refs, "voices.0")).toBe("audio:voice/cn/a/CN_001")
  expect(refKeyAt(refs, "voices.1")).toBeNull()
  expect(refKeyAt(refs, "voices.x")).toBeNull()
  expect(refNodeAt(refs, "chars.a")).toEqual({ avatar: "image:char/avatar/a" })
  expect(refKeyAt(refs, "chars.a")).toBeNull()
  expect(refKeyAt(refs, "chars.a.avatar.more")).toBeNull()
  expect(refKeyAt(refs, "toString")).toBeNull()
})
