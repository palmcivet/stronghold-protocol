import { expect, test } from "vitest"
import { acceptsGzip, cacheControl, parseRange } from "#static-policy.js"

test("cache policy and a single byte range", () => {
  expect(acceptsGzip("gzip, deflate")).toBe(true)
  expect(acceptsGzip("identity")).toBe(false)
  expect(parseRange("bytes=0-3", 10)).toEqual({ start: 0, end: 3 })
  expect(parseRange("bytes=0-1,2-3", 10)).toBeNull()
  expect(cacheControl(".html", ["index.html"], "")).toBe("no-cache")
  expect(cacheControl(".js", ["app.js"], "v=1")).toBe("public, max-age=31536000, immutable")
})

test("resource files with a version are immutable and without one are cached for a day", () => {
  expect(cacheControl(".png", ["res", "files", "image", "char", "avatar", "a.png"], "v=0123456789ab")).toBe("public, max-age=31536000, immutable")
  expect(cacheControl(".png", ["res", "files", "image", "char", "avatar", "a.png"], "")).toBe("public, max-age=86400")
})

test("pack manifests and season packets are cached for a few minutes, the local overlay is never cached", () => {
  expect(cacheControl(".json", ["res", "packs", "base", "78.0.0+r1", "manifest.json"], "")).toBe("public, max-age=300")
  expect(cacheControl(".json", ["res", "packs", "season", "act2autochess", "2026.10.09", "chess.json"], "")).toBe("public, max-age=300")
  expect(cacheControl(".json", ["res", "local", "manifest.json"], "")).toBe("no-cache")
})
