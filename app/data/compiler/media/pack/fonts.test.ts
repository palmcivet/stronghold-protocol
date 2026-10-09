import { expect, test } from "vitest"
import type { PackManifest } from "arknights-assets-catalog"
import { fontsCss } from "#compiler/media/pack/fonts.js"

test("each font key becomes a family with WOFF2 first and the original after it", () => {
  const manifest = {
    fileRoot: "../../../files/",
    assets: {
      "font:bender/regular": {
        kind: "font",
        files: [
          { role: "main", name: null, format: "woff2", bytes: 1, hash: "abcdef0123456789" + "0".repeat(48) },
          { role: "fallback", name: null, format: "otf", bytes: 1, hash: "1".repeat(64) },
        ],
      },
    },
  } as unknown as PackManifest
  const css = fontsCss(manifest)
  expect(css).toContain('font-family: "bender-regular";')
  expect(css).toContain('url("../../../files/font/bender/regular.woff2?v=abcdef012345") format("woff2")')
  expect(css).toContain('url("../../../files/font/bender/regular.otf?v=111111111111") format("opentype")')
  expect(css.indexOf("woff2")).toBeLessThan(css.indexOf("opentype"))
})

test("a font format without a CSS name is an error", () => {
  const manifest = {
    fileRoot: "../../../files/",
    assets: { "font:x/y": { kind: "font", files: [{ role: "main", name: null, format: "png", bytes: 1, hash: "0".repeat(64) }] } },
  } as unknown as PackManifest
  expect(() => fontsCss(manifest)).toThrow(/CSS does not name/)
})
