import type { AssetKey, RawEntry } from "arknights-assets-catalog"
import { expect, test } from "vitest"
import { buildRawCatalog, serializeRawCatalog } from "#catalog/raw-catalog.js"

const hash = "a".repeat(64)

function spineEntry(order: "shuffled" | "sorted"): RawEntry {
  const files = [
    { role: "page" as const, name: "b.png", format: "png" as const, bytes: 1, hash },
    { role: "meta" as const, name: "m.meta.json", format: "json" as const, bytes: 1, hash },
    { role: "page" as const, name: "a.png", format: "png" as const, bytes: 1, hash },
    { role: "atlas" as const, name: "m.atlas", format: "atlas" as const, bytes: 1, hash },
    { role: "skel" as const, name: "m.skel", format: "skel" as const, bytes: 1, hash },
  ]
  return {
    source: { revision: "r", path: "p", id: "fexli" },
    dependsOn: [],
    files: order === "sorted" ? files : [...files].reverse(),
    kind: "spine",
    key: "spine:char/x/front" as AssetKey,
  }
}

test("entries, files and missing needs come out in canonical order", () => {
  const image: RawEntry = { key: "image:a/b" as AssetKey, kind: "image", files: [{ role: "main", name: null, format: "png", bytes: 1, hash }], dependsOn: [], source: { id: "s", path: "p", revision: null } }
  const one = buildRawCatalog([spineEntry("shuffled"), image], [
    { key: "image:z" as AssetKey, required: false, tried: [] },
    { key: "image:c" as AssetKey, required: true, tried: [{ source: "s", reason: "not found" }] },
  ])
  const two = buildRawCatalog([image, spineEntry("sorted")], [
    { key: "image:c" as AssetKey, required: true, tried: [{ reason: "not found", source: "s" } as { source: string; reason: string }] },
    { key: "image:z" as AssetKey, required: false, tried: [] },
  ])
  expect(serializeRawCatalog(one)).toBe(serializeRawCatalog(two))
  expect(Object.keys(one.entries)).toEqual(["image:a/b", "spine:char/x/front"])
  expect(one.entries["spine:char/x/front" as AssetKey]?.files.map((file) => file.name)).toEqual(["m.skel", "m.atlas", "a.png", "b.png", "m.meta.json"])
  expect(one.missing.map((need) => need.key)).toEqual(["image:c", "image:z"])
  expect(serializeRawCatalog(one).endsWith("}\n")).toBe(true)
})

test("an entry that fails the catalog guard throws", () => {
  const broken = { ...spineEntry("sorted"), files: [] }
  expect(() => buildRawCatalog([broken], [])).toThrow(/guard/)
})
