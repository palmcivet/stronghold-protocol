import { expect, test } from "vitest"
import { isRawCatalog, rawCatalogIssues } from "#schema/raw-catalog.js"

const HASH = "9f".repeat(32)
const file = (role: string, name: string | null, format: string) => ({ role, name, format, bytes: 100, hash: HASH })

const CATALOG = {
  schemaVersion: 1,
  entries: {
    "image:char/avatar/char_002_amiya": {
      key: "image:char/avatar/char_002_amiya",
      kind: "image",
      files: [file("main", null, "png")],
      dependsOn: [],
      source: { id: "yuanyan", path: "avatar/char_002_amiya.png", revision: "4f2a9c1" },
    },
    "image:skin/portrait/char_002_amiya_1": {
      key: "image:skin/portrait/char_002_amiya_1",
      kind: "image",
      files: [file("main", null, "png")],
      dependsOn: [],
      source: { id: "yuanyan", path: "avatar/char_002_amiya.png", revision: "4f2a9c1" },
    },
    "spine:enemy/enemy_1007_slime": {
      key: "spine:enemy/enemy_1007_slime",
      kind: "spine",
      files: [
        file("skel", "enemy_1007_slime.skel", "skel"),
        file("atlas", "enemy_1007_slime.atlas", "atlas"),
        file("page", "enemy_1007_slime.png", "png"),
        file("meta", "enemy_1007_slime.meta.json", "json"),
      ],
      dependsOn: [],
      source: { id: "ark-models", path: "models_enemies/enemy_1007_slime", revision: null },
    },
  },
  missing: [{ key: "spine:enemy/enemy_1305_mhslim", required: false, tried: [{ source: "ark-models", reason: "not in models_data.json" }] }],
}

test("a raw catalog passes, including two keys with the same bytes", () => {
  expect(rawCatalogIssues(CATALOG)).toEqual([])
  expect(isRawCatalog(CATALOG)).toBe(true)
})

test("record key, entry key and kind must agree", () => {
  const entry = CATALOG.entries["image:char/avatar/char_002_amiya"]
  expect(
    rawCatalogIssues({
      ...CATALOG,
      entries: {
        "image:a": { ...entry, key: "image:b" },
        "audio:a": { ...entry, key: "audio:a" },
        "image:a.png": entry,
      },
    }),
  ).toEqual([
    { path: 'entries["image:a"].key', message: "expected the record key" },
    { path: 'entries["audio:a"].kind', message: 'expected "audio" to match the key' },
    { path: 'entries["audio:a"].files[0]', message: "a audio entry does not take a main file in png" },
    { path: 'entries["image:a.png"]', message: 'invalid asset key: segment "a.png" may only use letters, digits, \'_\' and \'-\'' },
  ])
})

test("source, dependsOn and missing are checked", () => {
  const entry = CATALOG.entries["image:char/avatar/char_002_amiya"]
  expect(
    rawCatalogIssues({
      schemaVersion: 1,
      entries: { [entry.key]: { ...entry, dependsOn: ["texture:x", "x"], source: { id: "", path: 1, revision: "" } } },
      missing: [{ key: "x", required: 1, tried: [{ source: "yuanyan" }] }],
    }),
  ).toEqual([
    { path: 'entries["image:char/avatar/char_002_amiya"].dependsOn[1]', message: "invalid asset key: missing ':' between kind and path" },
    { path: 'entries["image:char/avatar/char_002_amiya"].source.id', message: "expected a non-empty string" },
    { path: 'entries["image:char/avatar/char_002_amiya"].source.path', message: "expected a string" },
    { path: 'entries["image:char/avatar/char_002_amiya"].source.revision', message: "expected a non-empty string" },
    { path: "missing[0].key", message: "invalid asset key: missing ':' between kind and path" },
    { path: "missing[0].required", message: "expected a boolean" },
    { path: "missing[0].tried[0].reason", message: "expected a string" },
  ])
})
