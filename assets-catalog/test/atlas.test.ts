import { expect, test } from "vitest"
import { atlasInfo, normalizeAtlas, parseAtlas } from "#compiler/spine/atlas.js"

const fexli = "\nchar_x.png\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\nArm\n  rotate: false\n  xy: 2, 2\n  size: 10, 12\n  orig: 10, 12\n  offset: 0, 0\n  index: -1\nLeg\n  rotate: 270\n  xy: 20, 2\n  size: 8, 8\n  orig: 8, 8\n  offset: 0, 0\n  index: -1\n"
const sizeOf = (): { readonly width: number; readonly height: number } => ({ width: 256, height: 128 })

test("inserts size right after the page name and is idempotent", () => {
  const normalized = normalizeAtlas(fexli, { pageSize: sizeOf })
  expect(normalized.changed).toBe(true)
  const lines = normalized.text.split("\n")
  expect(lines[1]).toBe("char_x.png")
  expect(lines[2]).toBe("size: 256,128")
  expect(lines[3]).toBe("format: RGBA8888")
  const again = normalizeAtlas(normalized.text, { pageSize: sizeOf })
  expect(again.changed).toBe(false)
  expect(again.text).toBe(normalized.text)
  const info = atlasInfo(normalized.text)
  expect(info.pages).toEqual(["char_x.png"])
  expect([...info.regions]).toEqual(["Arm", "Leg"])
  expect(info.hasSize).toBe(true)
  expect(info.hasPma).toBe(false)
})

test("adds pma after page fields, fixes a wrong size, renames pages", () => {
  const normalized = normalizeAtlas("page a.png\nsize: 1,1\nformat: RGBA8888\nR\n  xy: 0, 0\n", {
    pageSize: sizeOf,
    pma: true,
    renamePage: (page) => page.replace(" ", "_"),
  })
  expect(normalized.text).toBe("page_a.png\nsize: 256,128\nformat: RGBA8888\npma: true\nR\n  xy: 0, 0\n")
  expect(normalized.fixedSize).toEqual(["page a.png"])
  expect(normalized.pages).toEqual(["page_a.png"])
  expect(atlasInfo(normalized.text).hasPma).toBe(true)
  expect(normalizeAtlas(normalized.text, { pageSize: sizeOf, pma: true }).changed).toBe(false)
})

test("handles multiple pages and CRLF and reports unsized pages", () => {
  const two = "a.png\r\nformat: RGBA8888\r\nA\r\n  xy: 0, 0\r\n\r\nb.png\r\nformat: RGBA8888\r\nB\r\n  xy: 1, 1\r\n"
  const normalized = normalizeAtlas(two, { pageSize: (page) => (page === "a.png" ? { width: 4, height: 8 } : null) })
  expect(normalized.missingSize).toEqual(["b.png"])
  const { pages } = parseAtlas(normalized.text)
  expect(pages.map((page) => [page.name, page.fields["size"] ?? null, page.regions])).toEqual([
    ["a.png", "4,8", ["A"]],
    ["b.png", null, ["B"]],
  ])
})
