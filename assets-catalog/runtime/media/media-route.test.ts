import { audioFileCandidates, mediaPrefix, mediaUrl } from "arknights-assets-catalog"
import { expect, test } from "vitest"
import { audioExtensions } from "#runtime/media/media-route.js"

const origin = "http://127.0.0.1:3000"

test("same-origin audio paths lose the extension and keep the query", () => {
  expect(mediaUrl("/assets/audio/sfx/player/p_imp/hit.mp3", origin)).toBe("/media/sfx/player/p_imp/hit")
  expect(mediaUrl(`${origin}/assets/audio/bgm/a.mp3`, origin)).toBe("/media/bgm/a")
  expect(mediaUrl("/assets/audio/bgm/a.mp3?v=2", origin)).toBe("/media/bgm/a?v=2")
  for (const extension of audioExtensions) {
    expect(mediaUrl(`/assets/audio/x/a${extension}`, origin)).toBe("/media/x/a")
  }
  expect(mediaUrl("/assets/audio/x/A.MP3", origin)).toBe("/media/x/A")
})

test("a rewritten address has no media extension", () => {
  const out = mediaUrl("/assets/audio/bgm/m_bat_vtlionk_loop.mp3", origin)
  expect(out.startsWith(mediaPrefix)).toBe(true)
  expect(out).not.toMatch(/\.(mp3|m4a|aac|ogg|oga|opus|wav)(\?|$)/i)
})

test("non-audio paths and other origins stay put", () => {
  expect(mediaUrl("/assets/img/a.png", origin)).toBe("/assets/img/a.png")
  expect(mediaUrl("/assets/audio/bgm.m4a.bak", origin)).toBe("/assets/audio/bgm.m4a.bak")
  expect(mediaUrl("https://cdn.example.com/assets/audio/a.mp3", origin)).toBe("https://cdn.example.com/assets/audio/a.mp3")
  expect(mediaUrl("/data/assets.json", origin)).toBe("/data/assets.json")
  expect(mediaUrl("", origin)).toBe("")
  expect(mediaUrl(null as unknown as string, origin)).toBeNull()
  expect(mediaUrl(undefined as unknown as string, origin)).toBeUndefined()
  expect(mediaUrl("/assets/audio/", origin)).toBe("/assets/audio/")
})

test("dotfiles stay put and a parent segment is normalized before the rewrite", () => {
  expect(mediaUrl("/assets/audio/.hidden.mp3", origin)).toBe("/assets/audio/.hidden.mp3")
  expect(mediaUrl("/assets/audio/bgm/../x.mp3", origin)).toBe("/media/x")
  expect(audioFileCandidates(".hidden")).toBeNull()
  expect(audioFileCandidates("bgm/.x.mp3")).toBeNull()
  expect(audioFileCandidates("bgm/../x")).toBeNull()
})

test("without an origin, a relative audio path is still rewritten", () => {
  expect(mediaUrl("/assets/audio/bgm/a.mp3")).toBe("/media/bgm/a")
  expect(mediaUrl("https://other.example/assets/audio/a.mp3")).toBe("https://other.example/assets/audio/a.mp3")
})

test("an explicit extension is tried first and the rest follow the table", () => {
  expect(audioFileCandidates("bgm/act1.ogg")?.extensions).toEqual([".ogg", ".mp3", ".m4a", ".aac", ".oga", ".opus", ".wav"])
})

test("extensionless audio path", () => {
  expect(mediaUrl("/assets/audio/bgm/act1.mp3", "http://localhost")).toBe("/media/bgm/act1")
  expect(mediaUrl("https://cdn.example/assets/audio/bgm/act1.mp3", "http://localhost")).toBe("https://cdn.example/assets/audio/bgm/act1.mp3")
  expect(audioFileCandidates("bgm/act1")?.extensions[0]).toBe(".mp3")
  expect(audioFileCandidates("bgm/act1.ogg")?.extensions[0]).toBe(".ogg")
  expect(audioFileCandidates("../secret")).toBeNull()
})
