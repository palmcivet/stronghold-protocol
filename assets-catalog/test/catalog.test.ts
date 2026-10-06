import { expect, test } from "vitest"
import { mediaUrl, nextArtUrl } from "arknights-assets-catalog"
import { audioFileCandidates } from "#runtime/media/media-route.js"
import { acceptsGzip, cacheControl, parseRange } from "#runtime/service/static-policy.js"

test("extensionless audio path", () => {
  expect(mediaUrl("/assets/audio/bgm/act1.mp3", "http://localhost")).toBe("/media/bgm/act1")
  expect(mediaUrl("https://cdn.example/assets/audio/bgm/act1.mp3", "http://localhost")).toBe("https://cdn.example/assets/audio/bgm/act1.mp3")
  expect(audioFileCandidates("bgm/act1")?.extensions[0]).toBe(".mp3")
  expect(audioFileCandidates("bgm/act1.ogg")?.extensions[0]).toBe(".ogg")
  expect(audioFileCandidates("../secret")).toBeNull()
})

test("cache policy and a single byte range", () => {
  expect(acceptsGzip("gzip, deflate")).toBe(true)
  expect(acceptsGzip("identity")).toBe(false)
  expect(parseRange("bytes=0-3", 10)).toEqual({ start: 0, end: 3 })
  expect(parseRange("bytes=0-1,2-3", 10)).toBeNull()
  expect(cacheControl(".html", ["index.html"], "")).toBe("no-cache")
  expect(cacheControl(".png", ["assets", "char", "a.png"], "")).toBe("public, max-age=86400")
  expect(cacheControl(".js", ["app.js"], "v=1")).toBe("public, max-age=31536000, immutable")
})

test("next address skips urls that already failed", () => {
  expect(nextArtUrl(["/assets/local/guide/page.png", "/assets/ui/guide/page.png"], new Set(["/assets/local/guide/page.png"]))).toBe("/assets/ui/guide/page.png")
  expect(nextArtUrl(["/assets/ui/guide/page.png"], new Set(["/assets/ui/guide/page.png"]))).toBeNull()
})
