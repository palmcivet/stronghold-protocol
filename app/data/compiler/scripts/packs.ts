#!/usr/bin/env node
// 按需求清单、原始目录与派生文件写出基础包与赛季包清单，并生成 fonts.css。
// 守卫：必需键缺失、基础与赛季命名空间混放、键集合比上一版缩水，任一项都不写出清单（--allow-shrink 只放行缩水）。

import { join, resolve } from "node:path"
import { BuildReadError, cacheLayout, nodeBuildFiles, type BuildFiles } from "arknights-assets-extractor"
import { fileAddress, rawCatalogIssues, needsListIssues, type AssetKey, type Need, type NeedsList, type RawCatalog, type RawEntry } from "arknights-assets-catalog"
import { animRolesKey } from "#compiler/media/derive/anim-roles.js"
import { BOARD_TILES_KEY } from "#compiler/media/derive/board/atlas.js"
import { buildPack, droppedKeys, type PackBuild } from "#compiler/media/pack/manifest.js"
import { fontsCss } from "#compiler/media/pack/fonts.js"
import { seasonPacketDirectory } from "#schema/packet-file.js"
import { dataWorkspace } from "#workspace.js"

const USAGE = "usage: compile:packs --season <id> [--season <id>...] [--allow-shrink] [--cache <dir>]"
const GAMEDATA_REPO_DIRECTORY = "Kengxxiao/ArknightsGameData@master"

interface Options {
  readonly seasons: readonly string[]
  readonly allowShrink: boolean
  readonly extractCacheDir: string
}

function fail(message: string): never {
  console.error(`compile:packs: ${message}\n${USAGE}`)
  process.exit(2)
}

function parseOptions(argv: readonly string[], extractCacheDir: string): Options {
  const seasons: string[] = []
  let allowShrink = false
  let cache = extractCacheDir
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index] ?? ""
    if (token === "--allow-shrink") allowShrink = true
    else if (token === "--season" || token === "--cache") {
      const value = argv[++index]
      if (!value || value.startsWith("--")) fail(`${token} needs a value`)
      if (token === "--season") {
        try {
          seasonPacketDirectory(value)
        } catch (cause) {
          fail(cause instanceof Error ? cause.message : String(cause))
        }
        seasons.push(value)
      } else cache = resolve(value)
    } else fail(`unknown option ${token}`)
  }
  if (seasons.length === 0) fail("--season is required")
  return { seasons, allowShrink, extractCacheDir: cache }
}

async function readJson(files: BuildFiles, path: string): Promise<unknown> {
  try {
    return JSON.parse(await files.readText(path)) as unknown
  } catch (cause) {
    throw new BuildReadError(path, cause instanceof Error ? cause.message : String(cause))
  }
}

async function readOptionalJson(files: BuildFiles, path: string): Promise<unknown | null> {
  return (await files.exists(path)) ? readJson(files, path) : null
}

async function readRawCatalog(files: BuildFiles, path: string): Promise<RawCatalog> {
  const value = await readJson(files, path)
  const issues = rawCatalogIssues(value)
  if (issues.length > 0) throw new BuildReadError(path, issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "))
  return value as RawCatalog
}

async function readNeedsList(files: BuildFiles, path: string): Promise<readonly Need[]> {
  const value = await readJson(files, path)
  const issues = needsListIssues(value)
  if (issues.length > 0) throw new BuildReadError(path, issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "))
  return (value as NeedsList).needs
}

/** Official resource version from the gamedata repository's `data_version.txt`, e.g. `78.0.0`. */
async function officialVersion(extractCacheDir: string): Promise<string> {
  const path = join(cacheLayout(extractCacheDir).repos, GAMEDATA_REPO_DIRECTORY, "zh_CN/gamedata/excel/data_version.txt")
  if (!(await nodeBuildFiles.exists(path))) throw new BuildReadError(path, "data_version.txt is missing; run pnpm extract:media first")
  const text = await nodeBuildFiles.readText(path)
  const match = /^VersionControl:(\S+)\s*$/m.exec(text)
  if (!match) throw new BuildReadError(path, "no VersionControl line")
  return match[1] as string
}

function reportBuild(label: string, build: PackBuild): void {
  const assets = Object.keys(build.manifest.assets).length
  console.log(`[packs] ${label}: ${assets} assets, ${build.missingOptional.length} optional needs missing`)
}

async function main(): Promise<void> {
  const workspace = dataWorkspace()
  const options = parseOptions(process.argv.slice(2), workspace.extractCacheDir)
  const files = nodeBuildFiles
  const extracted = cacheLayout(options.extractCacheDir)

  const extractedCatalog = await readRawCatalog(files, extracted.catalog)
  const entries = new Map<AssetKey, RawEntry>(Object.entries(extractedCatalog.entries) as [AssetKey, RawEntry][])
  const derivedPath = join(workspace.derivedDir, "catalog.json")
  if (await files.exists(derivedPath)) {
    for (const [key, entry] of Object.entries((await readRawCatalog(files, derivedPath)).entries) as [AssetKey, RawEntry][]) entries.set(key, entry)
  }
  const charword = await readOptionalJson(files, join(extracted.files, fileAddress(gamedataKey("excel/charword_table"), { name: null, format: "json" })))

  const baseRevision = (await readJson(files, join(workspace.baseInputDir, "pack.json"))) as { revision?: unknown }
  if (!Number.isInteger(baseRevision.revision) || (baseRevision.revision as number) < 1) {
    throw new BuildReadError(join(workspace.baseInputDir, "pack.json"), "revision must be an integer from 1")
  }
  const baseVersion = `${await officialVersion(options.extractCacheDir)}+r${baseRevision.revision}`
  const baseNeeds = await readNeedsList(files, join(workspace.needsDir, "base.json"))
  const failures: string[] = []

  // MARK: base pack
  const base = buildPack({ type: "base", id: "base", version: baseVersion, requires: [], needs: baseNeeds, entries, charword })
  const basePath = join(workspace.productDir, "base", "manifest.json")
  const fontsPath = join(workspace.productDir, "base", "fonts.css")
  reportBuild(`base ${baseVersion}`, base)
  const writeOrFail = async (label: string, build: PackBuild, path: string, css: string | null, previous: unknown | null): Promise<void> => {
    const problems: string[] = []
    if (build.missingRequired.length > 0) problems.push(`${label}: required needs missing: ${build.missingRequired.join(", ")}`)
    if (build.misplaced.length > 0) problems.push(`${label}: keys from the other namespace group: ${build.misplaced.join(", ")}`)
    const dropped = previous ? droppedKeys(previous, build.manifest) : []
    if (dropped.length > 0 && !options.allowShrink) problems.push(`${label}: ${dropped.length} keys dropped from the previous manifest (use --allow-shrink): ${dropped.slice(0, 10).join(", ")}`)
    if (problems.length > 0) {
      failures.push(...problems)
      return
    }
    if (dropped.length > 0) console.log(`[packs] ${label}: ${dropped.length} keys dropped (allowed by --allow-shrink)`)
    await files.writeTextAtomic(path, `${JSON.stringify(build.manifest, null, 2)}\n`)
    if (css !== null) await files.writeTextAtomic(fontsPath, css)
    console.log(`[packs] wrote ${path}`)
  }
  const previousBase = await readOptionalJson(files, basePath)
  await writeOrFail("base", base, basePath, fontsCss(base.manifest), previousBase)

  // MARK: season packs
  const derivedNeeds = (seasonId: string): Need[] => [
    { key: animRolesKey(seasonId), required: false },
    { key: BOARD_TILES_KEY, required: false },
  ]
  for (const seasonId of options.seasons) {
    const version = (await readJson(files, join(workspace.seasonInputDir(seasonId), "pack.json"))) as { version?: unknown }
    if (typeof version.version !== "string" || version.version.length === 0) throw new BuildReadError(seasonId, "pack.json needs a version")
    const needs = [...(await readNeedsList(files, join(workspace.needsDir, `season-${seasonId}.json`))), ...derivedNeeds(seasonId)]
    const build = buildPack({
      type: "season",
      id: seasonId,
      version: version.version,
      requires: [{ type: "base", id: "base", version: baseVersion }],
      needs,
      entries,
      charword,
    })
    reportBuild(`season ${seasonId}`, build)
    const path = join(workspace.seasonDir(seasonId), "manifest.json")
    await writeOrFail(`season ${seasonId}`, build, path, null, await readOptionalJson(files, path))
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`compile:packs: ${failure}`)
    process.exitCode = 1
  }
}

function gamedataKey(path: string): AssetKey {
  return `json:gamedata/${path}` as AssetKey
}

main().catch((cause: unknown) => {
  if (cause instanceof BuildReadError) console.error(`compile:packs failed: ${cause.path}: ${cause.message}`)
  else console.error("compile:packs failed:", cause instanceof Error ? cause.stack ?? cause.message : cause)
  process.exitCode = 1
})

