import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NEEDS_PACK_TYPES, parseAssetKey, type AssetKey, type Need, type RawCatalog } from "arknights-assets-catalog"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { cacheLayout } from "#catalog/cache-layout.js"
import { extractAssets, TABLE_SOURCE_ID } from "#catalog/extract.js"
import type { ExtractReport } from "#catalog/report.js"
import type { RepoRef } from "#download/repo-cache.js"
import { nodeBuildFiles } from "#port/node-files.js"
import type { AssetSource } from "#source/asset-source.js"
import { FONTS_REPO } from "#source/fonts/adapter.js"
import { GAMEDATA_REPO } from "#source/gamedata/adapter.js"
import { fileHit, openRepository } from "#source/repository.js"
import { createSources, type SourceRoute } from "#source/table.js"
import { SOUND_ROOT, VOICE_REPO } from "#source/voice/adapter.js"
import { YUANYAN_REPO } from "#source/yuanyan/adapter.js"
import { extractCommand } from "#script/extract.js"
import { DirectoryRepoCache, mp3, otf, png, writeTree } from "./fixture.js"

const PACK_TYPE = NEEDS_PACK_TYPES[0]
const need = (key: string, required = true): Need => ({ key: key as AssetKey, required })

function upstreamOf(root: string, ref: RepoRef): string {
  return join(root, ref.owner, `${ref.repo}@${ref.branch}`)
}

let dir = ""
let upstream = ""
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sp-extract-"))
  upstream = join(dir, "upstream")
  await writeTree(upstreamOf(upstream, YUANYAN_REPO), {
    "avatar/char_002_amiya.png": png(2, 2, 1),
    "avatar/char_003_kalts.png": png(2, 2, 2),
    "item/mtl_sl_g2.png": png(4, 4, 3),
    "skill/skill_icon_sk_dup[1].png": png(),
    "skill/skill_icon_sk_dup_1_.png": png(),
    "README.md": "root files come with the clone",
  })
  await writeTree(upstreamOf(upstream, VOICE_REPO), {
    [`${SOUND_ROOT}/voice_cn/char_002_amiya/cn_001.mp3`]: mp3(1),
    [`${SOUND_ROOT}/music/sys/m_sys_title.mp3`]: mp3(2),
  })
  await writeTree(upstreamOf(upstream, FONTS_REPO), { "font/Bender/BENDER.OTF": otf() })
  await writeTree(upstreamOf(upstream, GAMEDATA_REPO), { "zh_CN/gamedata/excel/character_table.json": '{"char_002_amiya":{"name":"阿米娅"}}\n' })
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function run(needs: readonly Need[], options: { cache?: string; repos?: DirectoryRepoCache; sources?: readonly AssetSource[]; table?: readonly SourceRoute[]; force?: boolean; offline?: boolean } = {}) {
  const layout = cacheLayout(options.cache ?? join(dir, "cache"))
  const repos = options.repos ?? new DirectoryRepoCache(upstream, layout.repos, { offline: options.offline ?? false })
  const result = await extractAssets({
    needs,
    layout,
    files: nodeBuildFiles,
    repos,
    sources: options.sources ?? (await createSources(nodeBuildFiles)),
    ...(options.table ? { table: options.table } : {}),
    force: options.force ?? false,
    offline: options.offline ?? false,
    log: () => {},
  })
  return { ...result, layout, repos }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T
}

const NEEDS = [
  need("image:char/avatar/char_002_amiya"),
  need("image:item/mtl_sl_g2"),
  need("audio:voice/cn/char_002_amiya/CN_001"),
  need("audio:bgm/m_sys_title"),
  need("font:bender/regular"),
  need("json:gamedata/excel/character_table"),
  need("image:skill/sk_dup_1_", false),
  { ...need("texture:map/main_00-01", false), absent: "only in the local client" },
]

describe("a run over every git source kind", () => {
  test("resolves hits, writes files at their address and records what it could not resolve", async () => {
    const { catalog, report, layout, missingRequired } = await run(NEEDS)
    expect(missingRequired).toEqual([])
    expect(Object.values(catalog.entries).map((entry) => entry.key)).toEqual([
      "audio:bgm/m_sys_title",
      "audio:voice/cn/char_002_amiya/CN_001",
      "font:bender/regular",
      "image:char/avatar/char_002_amiya",
      "image:item/mtl_sl_g2",
      "json:gamedata/excel/character_table",
    ])
    const avatar = Object.values(catalog.entries).find((entry) => entry.key === "image:char/avatar/char_002_amiya")
    expect(avatar?.source).toEqual({ id: "yuanyan", path: "avatar/char_002_amiya.png", revision: "f".repeat(40) })
    expect(existsSync(join(layout.files, "image/char/avatar/char_002_amiya.png"))).toBe(true)
    const font = Object.values(catalog.entries).find((entry) => entry.key === "font:bender/regular")
    expect(font?.files.map((file) => file.role).sort()).toEqual(["fallback", "main"])
    expect(existsSync(join(layout.files, "font/bender/regular.woff2"))).toBe(true)
    expect(existsSync(join(layout.files, "font/bender/regular.otf"))).toBe(true)

    const missing = Object.fromEntries(catalog.missing.map((row) => [row.key, row]))
    expect(Object.keys(missing).sort()).toEqual(["image:skill/sk_dup_1_", "texture:map/main_00-01"])
    expect(missing["texture:map/main_00-01"]?.tried).toEqual([{ source: TABLE_SOURCE_ID, reason: "no source provides this namespace" }])
    expect(missing["image:skill/sk_dup_1_"]?.tried[0]?.source).toBe("yuanyan")
    expect(report.ambiguous).toEqual([
      { key: "image:skill/sk_dup_1_", source: "yuanyan", candidates: ["skill/skill_icon_sk_dup[1].png", "skill/skill_icon_sk_dup_1_.png"] },
    ])
    expect(report.needs).toMatchObject({ total: NEEDS.length, resolved: 6, missingRequired: [], missingOptional: ["image:skill/sk_dup_1_", "texture:map/main_00-01"] })
    expect(report.needs.absentUpstream).toEqual([{ key: "texture:map/main_00-01", reason: "only in the local client" }])
    expect(report.needs.unexplained).toEqual(["image:skill/sk_dup_1_"])
    expect(await readJson<RawCatalog>(layout.catalog)).toEqual(catalog)
    expect((await readJson<ExtractReport>(layout.report)).ambiguous).toHaveLength(1)
  })

  test("checks out only the directories of the hits", async () => {
    const { repos, layout } = await run(NEEDS)
    const sparse = Object.fromEntries((await repos.stats()).map((stats) => [stats.repo, stats.sparse]))
    expect(sparse).toEqual({
      "ArknightsAssets/ArknightsAssets2@voice": [`${SOUND_ROOT}/music/sys`, `${SOUND_ROOT}/voice_cn/char_002_amiya`],
      "Kengxxiao/ArknightsGameData@master": ["zh_CN/gamedata/excel"],
      "TimWangZi/The-font-of-Arknights@master": ["font/Bender"],
      "yuanyan3060/ArknightsGameResource@main": ["avatar", "item"],
    })
    const yuanyan = join(layout.repos, YUANYAN_REPO.owner, `${YUANYAN_REPO.repo}@${YUANYAN_REPO.branch}`)
    expect(existsSync(join(yuanyan, "README.md"))).toBe(true)
    expect(existsSync(join(yuanyan, "skill"))).toBe(false)
  })

  test("the sparse set only grows when needs are added", async () => {
    const layout = cacheLayout(join(dir, "cache"))
    const repos = new DirectoryRepoCache(upstream, layout.repos)
    await run([need("image:item/mtl_sl_g2")], { repos })
    const before = (await repos.stats()).find((stats) => stats.repo.startsWith("yuanyan"))?.sparse
    expect(before).toEqual(["item"])
    await run([need("image:char/avatar/char_002_amiya")], { repos })
    const after = (await repos.stats()).find((stats) => stats.repo.startsWith("yuanyan"))?.sparse
    expect(after).toEqual(["avatar", "item"])
    await run([need("image:char/avatar/char_003_kalts"), need("image:item/mtl_sl_g2")], { repos })
    expect(repos.opened.get("yuanyan3060/ArknightsGameResource@main")?.checkouts).toEqual([["item"], ["avatar"]])
  })

  test("two runs give a byte-identical catalog, and the second reuses the ledger", async () => {
    const first = await run(NEEDS)
    const firstText = await readFile(first.layout.catalog)
    const ledgerText = await readFile(first.layout.ledger)
    const second = await run(NEEDS)
    expect(Buffer.compare(await readFile(second.layout.catalog), firstText)).toBe(0)
    expect(Buffer.compare(await readFile(second.layout.ledger), ledgerText)).toBe(0)
    expect(second.report.reused).toBe(6)
    expect(second.report.written).toBe(0)
    const other = await run(NEEDS, { cache: join(dir, "other-cache") })
    expect(Buffer.compare(await readFile(other.layout.catalog), firstText)).toBe(0)
    const forced = await run(NEEDS, { force: true })
    expect(forced.report.reused).toBe(0)
    expect(forced.report.written).toBe(first.report.written)
    expect(Buffer.compare(await readFile(forced.layout.catalog), firstText)).toBe(0)
  })

  test("a changed output file is written again instead of reused", async () => {
    const first = await run([need("image:item/mtl_sl_g2")])
    const target = join(first.layout.files, "image/item/mtl_sl_g2.png")
    await writeFile(target, "tampered")
    const second = await run([need("image:item/mtl_sl_g2")])
    expect(second.report.reused).toBe(0)
    expect(await readFile(target)).toEqual(png(4, 4, 3))
  })

  test("offline uses checked out files and reports the rest", async () => {
    await run([need("image:item/mtl_sl_g2")])
    const { catalog } = await run([need("image:item/mtl_sl_g2"), need("image:char/avatar/char_002_amiya"), need("json:gamedata/excel/character_table")], { offline: true })
    expect(Object.values(catalog.entries).map((entry) => entry.key)).toEqual(["image:item/mtl_sl_g2"])
    const reasons = Object.fromEntries(catalog.missing.map((row) => [row.key, row.tried.map((attempt) => attempt.reason).join("; ")]))
    expect(reasons["image:char/avatar/char_002_amiya"]).toMatch(/not checked out and --offline/)
    expect(reasons["json:gamedata/excel/character_table"]).toMatch(/never cloned/)
  })
})

describe("fallback order", () => {
  const PRIMARY: RepoRef = { owner: "test", repo: "primary", branch: "main" }
  const SECONDARY: RepoRef = { owner: "test", repo: "secondary", branch: "main" }
  const imageSource = (id: string, ref: RepoRef): AssetSource => {
    let workspace: Awaited<ReturnType<typeof openRepository>> | null = null
    return {
      id,
      covers: [{ kind: "image", namespace: "char" }],
      async prepare(context) {
        workspace = await openRepository(context, ref)
      },
      async locate(key) {
        return workspace ? fileHit(workspace, `${parseAssetKey(key).segments.slice(1).join("/")}.png`) : null
      },
    }
  }
  const sources = [imageSource("primary", PRIMARY), imageSource("secondary", SECONDARY), imageSource("absent", { owner: "test", repo: "absent", branch: "main" })]
  const table: SourceRoute[] = [{ kind: "image", namespace: "char", sources: ["absent", "primary", "secondary"] }]

  beforeEach(async () => {
    await writeTree(upstreamOf(upstream, PRIMARY), { "a/one.png": png(2, 2, 1), "a/broken.png": "<html>not found</html>" })
    await writeTree(upstreamOf(upstream, SECONDARY), { "a/one.png": png(2, 2, 9), "a/two.png": png(2, 2, 2), "a/broken.png": png(2, 2, 3) })
  })

  test("sources are tried in table order; misses and invalid files fall through", async () => {
    const { catalog, report } = await run([need("image:char/a/one"), need("image:char/a/two"), need("image:char/a/broken"), need("image:char/a/three", false)], { sources, table })
    const sourceOf = Object.fromEntries(Object.values(catalog.entries).map((entry) => [entry.key, entry.source.id]))
    expect(sourceOf).toEqual({ "image:char/a/broken": "secondary", "image:char/a/one": "primary", "image:char/a/two": "secondary" })
    const fallbacks = Object.fromEntries(report.fallbacks.map((row) => [row.key, row.tried.map((attempt) => attempt.source)]))
    expect(fallbacks).toEqual({ "image:char/a/broken": ["absent", "primary"], "image:char/a/one": ["absent"], "image:char/a/two": ["absent", "primary"] })
    expect(report.problems).toEqual([{ key: "image:char/a/broken", source: "primary", reason: "a/broken.png is not a valid png file" }])
    expect(catalog.missing).toEqual([
      {
        key: "image:char/a/three",
        required: false,
        tried: [
          { source: "absent", reason: expect.stringMatching(/never cloned/) },
          { source: "primary", reason: "not found" },
          { source: "secondary", reason: "not found" },
        ],
      },
    ])
  })

  test("the command exits 1 when a required key is missing and 0 otherwise", async () => {
    const needsFile = join(dir, "needs.json")
    const errors: string[] = []
    const deps = { repos: new DirectoryRepoCache(upstream, join(dir, "cache", "repos")), sources, log: () => {}, error: (line: string) => errors.push(line) }
    await writeFile(needsFile, JSON.stringify({ schemaVersion: 1, pack: { type: PACK_TYPE, id: "test" }, needs: [need("image:char/a/one"), need("image:char/a/three")] }))
    expect(await extractCommand(["--needs", needsFile, "--cache", join(dir, "cache")], deps)).toBe(1)
    expect(errors.join("\n")).toMatch(/missing required image:char\/a\/three/)
    await writeFile(needsFile, JSON.stringify({ schemaVersion: 1, pack: { type: PACK_TYPE, id: "test" }, needs: [need("image:char/avatar/char_002_amiya"), need("image:char/a/three", false)] }))
    expect(await extractCommand(["--needs", needsFile, "--cache", join(dir, "cache")], { ...deps, sources: await createSources(nodeBuildFiles) })).toBe(0)
    expect(await extractCommand(["--cache", join(dir, "cache")], deps)).toBe(2)
    expect(await extractCommand(["--needs", join(dir, "absent.json")], deps)).toBe(2)
  })
})
