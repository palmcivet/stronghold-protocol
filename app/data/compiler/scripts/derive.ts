#!/usr/bin/env node
// 从提取出的 Spine 侧车与数据包技能下标派生动画角色表，从提取出的棋盘贴图派生棋盘 tiles，写进 .cache/derived。
// 棋盘贴图缺失时不写棋盘 tiles，并删除上一次派生的同名文件与 catalog.json 中的条目。

import { rm } from "node:fs/promises"
import { join, resolve } from "node:path"
import { BuildReadError, cacheLayout, nodeBuildFiles, type BuildFiles } from "arknights-assets-extractor"
import { fileAddress, formatAssetKey, rawCatalogIssues, type AssetKey, type RawCatalog, type RawEntry } from "arknights-assets-catalog"
import { animRolesKey, deriveAnimRoles, derivedCatalog, derivedEntry, derivedJsonText } from "#compiler/media/derive/anim-roles.js"
import { BOARD_TILES_KEY, buildBoardTiles } from "#compiler/media/derive/board/atlas.js"
import { BOARD_THEME } from "#compiler/media/derive/board/material.js"
import { seasonPacketDirectory } from "#schema/packet-file.js"
import { dataWorkspace } from "#workspace.js"

const USAGE = "usage: compile:derive --season <id> [--season <id>...] [--cache <dir>]"

function fail(message: string): never {
  console.error(`compile:derive: ${message}\n${USAGE}`)
  process.exit(2)
}

async function readJson(files: BuildFiles, path: string): Promise<unknown> {
  try {
    return JSON.parse(await files.readText(path)) as unknown
  } catch (cause) {
    throw new BuildReadError(path, cause instanceof Error ? cause.message : String(cause))
  }
}

async function readRawCatalog(files: BuildFiles, path: string): Promise<RawCatalog> {
  const value = await readJson(files, path)
  const issues = rawCatalogIssues(value)
  if (issues.length > 0) throw new BuildReadError(path, issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "))
  return value as RawCatalog
}

/** Derives the board tiles from the extracted board textures, or drops the previous tiles when a texture is missing. */
async function deriveBoard(files: BuildFiles, catalog: RawCatalog, extractedFiles: string, derivedDir: string, entries: Record<string, RawEntry>): Promise<void> {
  const readTexture = async (key: AssetKey): Promise<Uint8Array | null> => {
    const entry = catalog.entries[key]
    const file = entry?.files[0]
    if (!entry || !file) return null
    const path = join(extractedFiles, fileAddress(key, file))
    return (await files.exists(path)) ? files.readBytes(path) : null
  }
  const build = await buildBoardTiles(readTexture)
  const path = join(derivedDir, fileAddress(BOARD_TILES_KEY, { name: null, format: "json" }))
  for (const problem of build.problems) console.warn(`[derive] board: ${problem}`)
  if (build.status === "missing") {
    console.log(`[derive] board/${BOARD_THEME}/tiles: skipped, ${build.missing.length} textures missing`)
    delete entries[BOARD_TILES_KEY]
    await rm(path, { force: true })
    return
  }
  for (const line of build.report) console.log(line)
  const bytes = new TextEncoder().encode(build.text)
  await files.writeBytesAtomic(path, bytes)
  entries[BOARD_TILES_KEY] = derivedEntry(BOARD_TILES_KEY, bytes, `textures of the ${BOARD_THEME} map`)
  console.log(`[derive] board/${BOARD_THEME}/tiles: written with ${build.problems.length} problems`)
}

async function main(): Promise<void> {
  const workspace = dataWorkspace()
  const seasons: string[] = []
  let extractCacheDir = workspace.extractCacheDir
  const argv = process.argv.slice(2)
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index] ?? ""
    if (token === "--season") {
      const value = argv[++index]
      if (!value || value.startsWith("--")) fail("--season needs an id")
      seasonPacketDirectory(value)
      seasons.push(value)
    } else if (token === "--cache") {
      const value = argv[++index]
      if (!value || value.startsWith("--")) fail("--cache needs a path")
      extractCacheDir = resolve(value)
    } else fail(`unknown option ${token}`)
  }
  if (seasons.length === 0) fail("--season is required")

  const files = nodeBuildFiles
  const extracted = cacheLayout(extractCacheDir)
  const catalog = await readRawCatalog(files, extracted.catalog)
  const spineKeys = (Object.keys(catalog.entries) as AssetKey[]).filter((key) => key.startsWith("spine:"))
  const readMeta = async (key: AssetKey): Promise<unknown | null> => {
    const path = key.slice("spine:".length)
    const metaKey = formatAssetKey("json", `spine-meta/${path}`)
    if (!catalog.entries[metaKey]) return null
    return readJson(files, join(extracted.files, fileAddress(metaKey, { name: null, format: "json" })))
  }

  const ops03 = await readJson(files, join(workspace.researchDir, "03-operators.json"))
  const derivedCatalogPath = join(workspace.derivedDir, "catalog.json")
  const previous: Record<string, RawEntry> = (await files.exists(derivedCatalogPath)) ? (await readRawCatalog(files, derivedCatalogPath)).entries : {}
  const entries: Record<string, RawEntry> = { ...previous }
  for (const seasonId of seasons) {
    const result = await deriveAnimRoles({ seasonId, spineKeys, ops03, readMeta })
    const key = animRolesKey(seasonId)
    const bytes = new TextEncoder().encode(derivedJsonText(result.roles))
    await files.writeBytesAtomic(join(workspace.derivedDir, fileAddress(key, { name: null, format: "json" })), bytes)
    entries[key] = derivedEntry(key, bytes, `spine-meta of ${Object.keys(result.roles).length} spine models`)
    console.log(`[derive] anim-roles/${seasonId}: ${Object.keys(result.roles).length} spine models, ${result.skipped.length} without a valid side file`)
  }
  await deriveBoard(files, catalog, extracted.files, workspace.derivedDir, entries)
  await files.writeTextAtomic(derivedCatalogPath, `${JSON.stringify(derivedCatalog(Object.values(entries)), null, 2)}\n`)
  console.log(`[derive] ${Object.keys(entries).length} derived files listed in ${derivedCatalogPath}`)
}

main().catch((cause: unknown) => {
  if (cause instanceof BuildReadError) console.error(`compile:derive failed: ${cause.path}: ${cause.message}`)
  else console.error("compile:derive failed:", cause instanceof Error ? cause.stack ?? cause.message : cause)
  process.exitCode = 1
})
