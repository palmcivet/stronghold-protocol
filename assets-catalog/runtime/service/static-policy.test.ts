import { expect, test } from "vitest"
import { acceptsGzip, cacheControl, parseRange } from "#runtime/service/static-policy.js"

test("cache policy and a single byte range", () => {
  expect(acceptsGzip("gzip, deflate")).toBe(true)
  expect(acceptsGzip("identity")).toBe(false)
  expect(parseRange("bytes=0-3", 10)).toEqual({ start: 0, end: 3 })
  expect(parseRange("bytes=0-1,2-3", 10)).toBeNull()
  expect(cacheControl(".html", ["index.html"], "")).toBe("no-cache")
  expect(cacheControl(".png", ["assets", "char", "a.png"], "")).toBe("public, max-age=86400")
  expect(cacheControl(".js", ["app.js"], "v=1")).toBe("public, max-age=31536000, immutable")
})
