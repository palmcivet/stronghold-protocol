import { existsSync, readdirSync } from "node:fs"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { isSpineMeta, type AssetKey, type SpineMeta } from "arknights-assets-catalog"
import { afterEach, beforeEach, expect, test } from "vitest"
import { cacheLayout } from "#catalog/cache-layout.js"
import { extractAssets } from "#catalog/extract.js"
import { AssetLedger } from "#download/ledger.js"
import { nodeBuildFiles } from "#port/node-files.js"
import { FEXLI_REPO } from "#source/fexli/adapter.js"
import { createSources } from "#source/table.js"
import { normalizeAtlas } from "#spine/atlas.js"
import { pngSize } from "#download/format.js"
import { extractorPackageRoot } from "#package-root.js"
import { DirectoryRepoCache, png, writeTree } from "./fixture.js"

const ATLAS = "\nm.png\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\nR\n  xy: 0, 0\n  size: 1, 1\n"
const FEXLI = `${FEXLI_REPO.owner}/${FEXLI_REPO.repo}@${FEXLI_REPO.branch}`

let dir = ""
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sp-spine-"))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function extractSpine(keys: readonly string[]) {
  const layout = cacheLayout(join(dir, "cache"))
  const result = await extractAssets({
    needs: keys.map((key) => ({ key: key as AssetKey, required: true })),
    layout,
    files: nodeBuildFiles,
    repos: new DirectoryRepoCache(join(dir, "upstream"), layout.repos),
    sources: await createSources(nodeBuildFiles),
    log: () => {},
  })
  return { ...result, layout }
}

test("the atlas gets the real page size", () => {
  const image = png(2, 2)
  expect(normalizeAtlas(ATLAS, { pageSize: () => pngSize(image), pma: false }).text).toMatch(/size: 2,2/)
})

test("a corrupt skeleton is a miss: nothing is written and nothing is recorded", async () => {
  await writeTree(join(dir, "upstream", FEXLI, "spine/char_x/char_x/Front"), { "m.skel": Buffer.alloc(64, 0xff), "m.atlas": ATLAS, "m.png": png() })
  const { catalog, layout } = await extractSpine(["spine:char/char_x/front", "json:spine-meta/char/char_x/front"])
  expect(catalog.entries).toEqual({})
  const reasons = Object.fromEntries(catalog.missing.map((row) => [row.key, row.tried.map((attempt) => attempt.reason).join("; ")]))
  expect(reasons["spine:char/char_x/front"]).toMatch(/skel parse failed/)
  expect(reasons["json:spine-meta/char/char_x/front"]).toMatch(/spine:char\/char_x\/front is missing/)
  expect(existsSync(join(layout.files, "spine"))).toBe(false)
  expect(existsSync(join(layout.files, "json"))).toBe(false)
  const ledger = await AssetLedger.load(nodeBuildFiles, layout.ledger)
  expect(ledger.recordsFrom("spine:char/char_x/front" as AssetKey).size).toBe(0)
})

const sample = join(extractorPackageRoot(), "test", "fixture", "spine", "token", "token_10000_silent_healrb")

test("a real skeleton gets a SpineMeta sidecar and a json:spine-meta entry", async () => {
  const tree: Record<string, Uint8Array> = {}
  for (const name of readdirSync(sample)) tree[name] = await readFile(join(sample, name))
  await writeTree(join(dir, "upstream", FEXLI, "spine/token_10000_silent_healrb/token_10000_silent_healrb/Spine"), tree)
  const { catalog, layout, missingRequired } = await extractSpine(["json:spine-meta/token/token_10000_silent_healrb/front"])
  expect(missingRequired).toEqual([])
  const spine = catalog.entries["spine:token/token_10000_silent_healrb/front" as AssetKey]
  expect(spine?.files.map((file) => `${file.role}:${file.name}`)).toEqual([
    "skel:token_10000_silent_healrb.skel",
    "atlas:token_10000_silent_healrb.atlas",
    "page:token_10000_silent_healrb.png",
    "meta:token_10000_silent_healrb.meta.json",
  ])
  const metaEntry = catalog.entries["json:spine-meta/token/token_10000_silent_healrb/front" as AssetKey]
  expect(metaEntry?.source).toEqual(spine?.source)
  const sidecar = await readFile(join(layout.files, "spine/token/token_10000_silent_healrb/front/token_10000_silent_healrb.meta.json"), "utf8")
  expect(await readFile(join(layout.files, "json/spine-meta/token/token_10000_silent_healrb/front.json"), "utf8")).toBe(sidecar)
  const meta = JSON.parse(sidecar) as SpineMeta
  expect(isSpineMeta(meta)).toBe(true)
  expect(meta.premultipliedAlpha).toBe(false)
  expect(meta.pages).toEqual(["token_10000_silent_healrb.png"])
  expect(Object.keys(meta.animations).length).toBeGreaterThan(0)
  expect(Object.keys(meta.animations)).toEqual(Object.keys(meta.animations).sort())
  expect(meta).not.toHaveProperty("attackAnim")
  expect(await readFile(join(layout.files, "spine/token/token_10000_silent_healrb/front/token_10000_silent_healrb.atlas"), "utf8")).toMatch(/size: ?128, ?128/)
})
