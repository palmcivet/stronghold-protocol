import { expect, test } from "vitest"
import { mergeSparse, sparseCovers, sparseDirectories } from "#download/sparse.js"

test("directories come from the needed files, without nesting or root files", () => {
  expect(
    sparseDirectories([
      "avatar/char_002_amiya.png",
      "avatar/char_002_amiya_2.png",
      "spine/char_002_amiya/char_002_amiya/Front/char_002_amiya.skel",
      "spine/char_002_amiya/char_002_amiya/Front/char_002_amiya.png",
      "spine/char_002_amiya/char_002_amiya/Back/char_002_amiya.skel",
      "models_data.json",
    ]),
  ).toEqual(["avatar", "spine/char_002_amiya/char_002_amiya/Back", "spine/char_002_amiya/char_002_amiya/Front"])
  expect(sparseDirectories(["a/b/c.png", "a/d.png"])).toEqual(["a"])
})

test("adding needs only grows the covered set", () => {
  const first = sparseDirectories(["voice_cn/char_1/cn_001.mp3", "music/m_a.mp3"])
  const second = mergeSparse(first, sparseDirectories(["voice_cn/char_2/cn_001.mp3", "music/sub/m_b.mp3"]))
  expect(second).toEqual(["music", "voice_cn/char_1", "voice_cn/char_2"])
  for (const dir of first) expect(sparseCovers(second, dir)).toBe(true)
  const third = mergeSparse(second, ["voice_cn"])
  expect(third).toEqual(["music", "voice_cn"])
  for (const dir of second) expect(sparseCovers(third, dir)).toBe(true)
  expect(sparseCovers(third, "voice_cnx/a.mp3")).toBe(false)
})
