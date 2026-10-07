// 按这一季的研究表列出要下载的文件，调用资源目录把字节写入 product/media 与 product/font，再把 assets.json 写到本包的 product/season。

import { readdir, unlink } from "node:fs/promises"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { CatalogReadError, type CatalogFiles, type CatalogHttp } from "arknights-assets-catalog"
import {
  Downloader,
  buildFonts,
  catalogPackageRoot,
  findLocalEnemyModels,
  fontJobs,
  loadIndexes,
  loadLocalEnemySpines,
  localEnemySpineMeta,
  LOCAL_ENEMY_SPINES_FILE,
  processModels,
  skelParserAvailable,
  type LocalSpineMeta,
} from "arknights-assets-catalog/compile"
import { appRootFrom } from "#compiler/repo-root.js"
import { seasonPacketDirectory } from "#schema/packet-file.js"
import { indexAudio, type VoiceLang } from "./audio-bank.js"
import {
  collectLeaves,
  contentHash,
  downloadLeaves,
  droppedEntries,
  MANIFEST_VERSION,
  resolveTemplate,
  totalBytes,
} from "./manifest.js"
import { buildPlan } from "./plan.js"

const appRoot = appRootFrom(fileURLToPath(import.meta.url))
const catalogRoot = catalogPackageRoot()
const assetsDir = join(catalogRoot, "product", "media")
const fontsDir = join(catalogRoot, "product", "font")
const cacheDir = join(catalogRoot, ".cache")
const researchDir = join(appRoot, "compiler", "input", "research")
const reportPath = join(cacheDir, "assets-report.json")

const HELP_TEXT = `Usage: [options]
  --concurrency=N   parallel downloads (default 16)
  --force           re-download files even when present
  --offline         no network: post-process what is on disk and rebuild the manifest
  --dry-run         print the plan and exit
  --refresh-index   re-download the audio_data.json / charword_table.json / models_data.json indexes
  --voice-lang=cn   operator battle voice language: cn (default) | jp | en | kr
  --voice-all       plan every official voice slot, including prep-only lines
  --season=ID       write product/season/<id>/assets.json under stronghold-app (required)
  --prune           delete files under product/media that the manifest no longer references
                    (product/media/local/** is never deleted); implies --allow-shrink
  --allow-shrink    write the manifest even when it loses entries the current one has
  --local-spines    rewrite ${LOCAL_ENEMY_SPINES_FILE} from extracted enemy models
  --help            this text`

export interface FetchOptions {
  readonly concurrency: number
  readonly force: boolean
  readonly offline: boolean
  readonly dryRun: boolean
  readonly refreshIndex: boolean
  readonly prune: boolean
  readonly allowShrink: boolean
  readonly localSpines: boolean
  readonly voiceLang: VoiceLang
  readonly voiceAll: boolean
  readonly season: string | null
  readonly help: boolean
}

export function parseArgs(argv: readonly string[]): FetchOptions {
  const options: {
    concurrency: number
    force: boolean
    offline: boolean
    dryRun: boolean
    refreshIndex: boolean
    prune: boolean
    allowShrink: boolean
    localSpines: boolean
    voiceLang: VoiceLang
    voiceAll: boolean
    season: string | null
    help: boolean
  } = {
    concurrency: 16,
    force: false,
    offline: false,
    dryRun: false,
    refreshIndex: false,
    prune: false,
    allowShrink: false,
    localSpines: false,
    voiceLang: "cn",
    voiceAll: false,
    season: null,
    help: false,
  }
  for (const arg of argv) {
    const [key, value] = arg.split("=")
    if (key === "--concurrency") options.concurrency = Math.max(1, Math.min(64, parseInt(value ?? "", 10) || 16))
    else if (key === "--force") options.force = true
    else if (key === "--offline") options.offline = true
    else if (key === "--dry-run") options.dryRun = true
    else if (key === "--refresh-index") options.refreshIndex = true
    else if (key === "--prune") options.prune = true
    else if (key === "--allow-shrink") options.allowShrink = true
    else if (key === "--local-spines") options.localSpines = true
    else if (key === "--voice-lang") {
      if (value !== "cn" && value !== "jp" && value !== "en" && value !== "kr") {
        throw new Error(`unknown --voice-lang ${value} (cn | jp | en | kr)`)
      }
      options.voiceLang = value
    } else if (key === "--voice-all") options.voiceAll = true
    else if (key === "--season") {
      if (!value) throw new Error(`--season needs an id\n${HELP_TEXT}`)
      options.season = value
    } else if (key === "--help" || key === "-h") options.help = true
    else throw new Error(`unknown option ${arg}\n${HELP_TEXT}`)
  }
  return options
}

export interface ShrinkDecision {
  readonly dropped: readonly string[]
  readonly write: boolean
}

export function shrinkGuard(
  prev: unknown,
  next: unknown,
  options: { readonly allowShrink?: boolean; readonly prune?: boolean } = {},
): ShrinkDecision {
  const dropped = prev ? droppedEntries(prev, next) : []
  return { dropped, write: dropped.length === 0 || !!options.allowShrink || !!options.prune }
}

const megabytes = (n: number): string => `${(n / 1048576).toFixed(1)} MB`
const log = (message: string): void => console.log(message)

function record(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function manifestPath(season: string): string {
  return join(appRoot, seasonPacketDirectory(season), "assets.json")
}

async function readJson(files: CatalogFiles, path: string): Promise<unknown> {
  let text: string
  try {
    text = await files.readText(path)
  } catch (cause) {
    throw new CatalogReadError(path, `cannot read ${path}: ${errorMessage(cause)}`)
  }
  try {
    return JSON.parse(text) as unknown
  } catch (cause) {
    throw new CatalogReadError(path, `cannot read ${path}: ${errorMessage(cause)}`)
  }
}

async function readOptionalJson(files: CatalogFiles, rel: string): Promise<unknown> {
  try {
    return await readJson(files, rel)
  } catch {
    return null
  }
}

function jsonText(value: unknown, indent?: number): string {
  return JSON.stringify(value, null, indent) + "\n"
}

async function listFiles(dir: string, base = dir, out: string[] = []): Promise<string[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) await listFiles(path, base, out)
    else if (entry.isFile()) out.push(relative(base, path).split(sep).join("/"))
  }
  return out
}

function tidyManifest(manifest: Record<string, unknown>): void {
  for (const enemy of Object.values(record(manifest["enemies"]) ?? {})) {
    const row = record(enemy)
    if (row && !row["spine"]) delete row["spineAliasOf"]
  }
  for (const token of Object.values(record(manifest["tokens"]) ?? {})) {
    const row = record(token)
    if (row && !row["spine"]) delete row["spineVariant"]
  }
  const skills = record(manifest["skills"])
  const skillsById = record(manifest["skillsById"])
  if (skillsById) {
    for (const [skillId, iconId] of Object.entries(skillsById)) {
      if (typeof iconId !== "string" || !skills?.[iconId]) delete skillsById[skillId]
    }
  }
  for (const card of Object.values(record(manifest["chars"]) ?? {})) {
    const row = record(card)
    const spine = record(row?.["spine"])
    if (row && spine && !Object.keys(spine).length) delete row["spine"]
  }
}

function countStats(manifest: Record<string, unknown>, bytes: number, files: number): Record<string, number> {
  const values = (key: string): Record<string, unknown>[] =>
    Object.values(record(manifest[key]) ?? {}).map((item) => record(item)).filter((item): item is Record<string, unknown> => item !== null)
  const spines = new Set<string>()
  for (const card of values("chars")) {
    for (const spine of Object.values(record(card["spine"]) ?? {})) {
      const skel = record(spine)?.["skel"]
      if (typeof skel === "string") spines.add(skel)
    }
  }
  for (const enemy of values("enemies")) {
    const skel = record(enemy["spine"])?.["skel"]
    if (typeof skel === "string") spines.add(skel)
  }
  for (const token of values("tokens")) {
    const skel = record(token["spine"])?.["skel"]
    if (typeof skel === "string") spines.add(skel)
  }
  const audio = record(manifest["audio"])
  const sfx = record(audio?.["sfx"])
  return {
    files,
    bytes,
    chars: Object.keys(record(manifest["chars"]) ?? {}).length,
    charsWithBack: values("chars").filter((card) => record(record(card["spine"])?.["back"])).length,
    enemies: Object.keys(record(manifest["enemies"]) ?? {}).length,
    enemiesWithSpine: values("enemies").filter((enemy) => enemy["spine"]).length,
    tokens: Object.keys(record(manifest["tokens"]) ?? {}).length,
    tokensWithSpine: values("tokens").filter((token) => token["spine"]).length,
    spineModels: spines.size,
    bonds: Object.keys(record(manifest["bonds"]) ?? {}).length,
    items: Object.keys(record(manifest["items"]) ?? {}).length,
    bands: Object.keys(record(manifest["bands"]) ?? {}).length,
    skills: Object.keys(record(manifest["skills"]) ?? {}).length,
    ui: Object.keys(record(manifest["ui"]) ?? {}).length,
    sfxUnits: Object.keys(record(record(sfx)?.["units"]) ?? {}).length,
    voiceChars: Object.keys(record(audio?.["voice"]) ?? {}).length,
  }
}

function requiredMisses(manifest: Record<string, unknown>, charIds: readonly string[]): string[] {
  const chars = record(manifest["chars"])
  const out: string[] = []
  for (const id of charIds) {
    const card = record(chars?.[id])
    if (!card?.["avatar"]) out.push(`${id}.avatar`)
    if (!card?.["portrait"]) out.push(`${id}.portrait`)
    if (!record(record(card?.["spine"])?.["front"])) out.push(`${id}.spine.front`)
  }
  return out
}

const LOCAL_SPINES_ABOUT =
  "Spine metadata of the enemy models only the local client has (ENEMY_SPINES). " +
  "enemies[id].spineLocal names these files."

async function syncLocalEnemySpines(files: CatalogFiles, options: FetchOptions): Promise<Record<string, LocalSpineMeta>> {
    const path = join(catalogRoot, LOCAL_ENEMY_SPINES_FILE)
    const committed = await loadLocalEnemySpines(path)
    const found = await findLocalEnemyModels(assetsDir)
    if (!Object.keys(found).length) {
      if (options.localSpines) log(`[local-spines] no extracted enemy model under product/media/local/spine/enemy/ — ${LOCAL_ENEMY_SPINES_FILE} kept`)
      return committed
    }
    const { meta, problems } = await localEnemySpineMeta(assetsDir, found)
    for (const problem of problems) log(`[local-spines] ${problem}`)
    if (options.localSpines && !options.dryRun) {
      const models = { ...committed, ...meta }
      const sorted = Object.fromEntries(Object.keys(models).sort().map((key) => [key, models[key]]))
      await files.writeTextAtomic(path, jsonText({ about: LOCAL_SPINES_ABOUT, models: sorted }, 2))
      log(`[local-spines] ${Object.keys(meta).length} model(s) → ${LOCAL_ENEMY_SPINES_FILE}`)
      return sorted as Record<string, LocalSpineMeta>
    }
    for (const [id, model] of Object.entries(meta)) {
      if (JSON.stringify(model) !== JSON.stringify(committed[id])) {
        log(`[local-spines] ${id}: the extracted model differs from ${LOCAL_ENEMY_SPINES_FILE} (re-run with --local-spines to update it)`)
      }
    }
    return committed
}

export async function fetchAssets(files: CatalogFiles, http: CatalogHttp, argv: readonly string[]): Promise<number> {
    const options = parseArgs(argv)
    if (options.help) {
      log(HELP_TEXT)
      return 0
    }
    if (!options.season) throw new CatalogReadError(appRoot, "--season is required")
    const started = Date.now()
    const output = manifestPath(options.season)
    log(`[assets] app ${appRoot}`)
    log(`[assets] catalog ${catalogRoot}`)
    if (!skelParserAvailable()) throw new CatalogReadError(catalogRoot, "@pixi-spine/runtime-3.8 not found — run `npm install` first")
    const assets07 = await readJson(files, join(researchDir, "07-assets.json"))
    const ops03 = await readJson(files, join(researchDir, "03-operators.json"))
    const enemies05 = await readJson(files, join(researchDir, "05-enemies.json"))
    const maps05 = await readJson(files, join(researchDir, "05-maps.json"))
    const indexes = await loadIndexes(files, http, catalogRoot, { refresh: options.refreshIndex && !options.offline, offline: options.offline, log })
    const audio = indexAudio(indexes.audioData)
    const seasonDir = join(appRoot, seasonPacketDirectory(options.season))
    const dataEnemies = await readOptionalJson(files, join(seasonDir, "enemies.json"))
    const dataTokens = await readOptionalJson(files, join(seasonDir, "tokens.json"))
    const dataBosses = await readOptionalJson(files, join(seasonDir, "bosses.json"))
    const extraHandbook: Record<string, string> = {}
    for (const boss of Object.values(record(dataBosses) ?? {})) {
      const row = record(boss)
      const enemyKey = typeof row?.["enemyKey"] === "string" ? row["enemyKey"] : ""
      const handbookId = typeof row?.["handbookId"] === "string" ? row["handbookId"] : ""
      if (enemyKey && handbookId) extraHandbook[enemyKey] = handbookId
    }
    const localEnemySpines = await syncLocalEnemySpines(files, options)
    const plan = buildPlan({
      assets07,
      ops03,
      enemies05,
      maps05,
      audio,
      modelsData: indexes.modelsData,
      charword: indexes.charword,
      voiceLang: options.voiceLang,
      ...(options.voiceAll ? { voiceSlots: null } : {}),
      extraEnemyIds: Object.keys(record(dataEnemies) ?? {}),
      extraTokenIds: Object.keys(record(dataTokens) ?? {}),
      extraHandbook,
      localEnemySpines,
    })
    const leaves = collectLeaves(plan.template)
    log(
      `[plan] ${leaves.length} files + ${plan.models.size} Spine models ` +
        `(${Object.keys(plan.template.chars).length} chars, ${Object.keys(plan.template.enemies).length} enemies, ` +
        `${Object.keys(plan.template.tokens).length} tokens, ${Object.keys(plan.template.ui).length} UI sprites, ` +
        `${Object.keys(plan.template.audio.sfx.units).length} units with SFX, ` +
        `${Object.keys(plan.template.audio.voice).length} operators with ${options.voiceLang.toUpperCase()} voice)`,
    )
    if (options.dryRun) {
      for (const note of plan.notes) log(`  note: ${note}`)
      return 0
    }
    const downloader = new Downloader({
      root: assetsDir,
      ledgerPath: join(cacheDir, "assets-ledger.json"),
      concurrency: options.concurrency,
      force: options.force,
      log,
    })
    await downloader.loadLedger()
    const downloadErrors = options.offline ? [] : await downloadLeaves(leaves, downloader, assetsDir, "files")
    if (!options.offline) {
      const fontDownloader = new Downloader({
        root: fontsDir,
        ledgerPath: join(cacheDir, "fonts-ledger.json"),
        concurrency: 4,
        force: options.force,
        log,
      })
      await fontDownloader.loadLedger()
      await fontDownloader.run(fontJobs(), "fonts")
      downloader.totals.bytesDownloaded += fontDownloader.totals.bytesDownloaded
      for (const key of ["ok", "skip", "miss", "error"] as const) downloader.totals[key] += fontDownloader.totals[key]
    }
    const fonts = await buildFonts(fontsDir, log)
    const spine = await processModels(plan.models, { root: assetsDir, dl: downloader, cachePath: join(cacheDir, "spine-info.json"), download: !options.offline, log })
    const resolved = resolveTemplate(plan.template, {
      root: assetsDir,
      spine: spine.entries,
      sourceOf: (rel) => downloader.ledger.files[rel]?.url,
    })
    const body = resolved.value
    tidyManifest(body)
    const fontFaces: Record<string, unknown> = {}
    for (const [name, face] of Object.entries(fonts.files)) fontFaces[name] = face
    const cssReady = await files.exists(join(fontsDir, "fonts.css"))
    body["fonts"] = cssReady ? { css: "/fonts/fonts.css", faces: fontFaces } : { faces: fontFaces }
    const bytes = totalBytes(assetsDir, resolved.files)
    const manifest = {
      version: MANIFEST_VERSION,
      hash: contentHash(body),
      generator: "app/data/compiler/media/fetch/assets.ts",
      stats: countStats(body, bytes, resolved.files.size),
      ...body,
    }
    let current: unknown = null
    if (await files.exists(output)) {
      try {
        const loaded = await files.readText(output)
        try {
          current = JSON.parse(loaded) as unknown
        } catch (cause) {
          log(`[manifest] the current ${relative(appRoot, output)} is unreadable (${errorMessage(cause)}): replaced`)
        }
      } catch (cause) {
        log(`[manifest] the current ${relative(appRoot, output)} is unreadable (${errorMessage(cause)}): replaced`)
      }
    }
    const guard = shrinkGuard(current, manifest, options)
    if (guard.write) await files.writeTextAtomic(output, jsonText(manifest))
    const orphans = (await listFiles(assetsDir)).filter((rel) => !resolved.files.has(rel) && !rel.startsWith("local/"))
    if (options.prune) {
      for (const rel of orphans) {
        try {
          await unlink(join(assetsDir, rel))
        } catch {
          // 文件可能已经不在。
        }
      }
    }
    const charIds = Object.keys(record(record(assets07)?.["operators"]) ?? {})
    const required = requiredMisses(manifest, charIds)
    const report = {
      downloadedBytes: downloader.totals.bytesDownloaded,
      totals: downloader.totals,
      stats: manifest.stats,
      requiredMisses: required,
      misses: resolved.misses,
      downloadErrors,
      fallbacks: resolved.fallbacks,
      spineProblems: spine.problems,
      fontErrors: fonts.errors,
      orphans: options.prune ? [] : orphans,
      pruned: options.prune ? orphans : [],
      manifestWritten: guard.write,
      droppedEntries: guard.dropped,
      notes: plan.notes,
    }
    await files.writeTextAtomic(reportPath, jsonText(report, 1))
    const stats = manifest.stats
    log("")
    log("=== fetch-assets summary ===")
    log(
      `downloaded this run : ${megabytes(downloader.totals.bytesDownloaded)} (ok ${downloader.totals.ok}, skipped ${downloader.totals.skip}, missing ${downloader.totals.miss}, errors ${downloader.totals.error}` +
        `${downloader.totals.sizeChanged ? `, ${downloader.totals.sizeChanged} changed upstream` : ""})`,
    )
    log(`on disk (manifest)  : ${megabytes(stats["bytes"] ?? 0)} in ${stats["files"] ?? 0} files`)
    log(
      `chars ${stats["chars"]} (Back model ${stats["charsWithBack"]}) · enemies ${stats["enemies"]} (Spine ${stats["enemiesWithSpine"]}) · tokens ${stats["tokens"]} (Spine ${stats["tokensWithSpine"]}) · Spine models ${stats["spineModels"]}`,
    )
    log(`bonds ${stats["bonds"]} · items ${stats["items"]} · bands ${stats["bands"]} · skill icons ${stats["skills"]} · UI ${stats["ui"]} · units with SFX ${stats["sfxUnits"]}`)
    log(`operator battle voice: ${stats["voiceChars"]} charIds (--voice-lang=${options.voiceLang})`)
    log(`fonts: ${Object.values(fonts.files).map((face) => face.woff2 || face.original).join(", ") || "none"}`)
    if (resolved.fallbacks.length) {
      log(`fallbacks used (${resolved.fallbacks.length}):`)
      for (const item of resolved.fallbacks.slice(0, 20)) log(`  ${item}`)
    }
    if (downloadErrors.length) log(`download errors (${downloadErrors.length}, re-run to retry): ${downloadErrors.slice(0, 10).join(", ")}`)
    if (resolved.misses.length) {
      log(`missing (${resolved.misses.length}, omitted from manifest; client uses fallbacks):`)
      for (const miss of resolved.misses.slice(0, 40)) log(`  ${miss}`)
      if (resolved.misses.length > 40) log(`  … see ${reportPath}`)
    }
    if (spine.problems.length) {
      log(`spine notes (${spine.problems.length}):`)
      for (const problem of spine.problems.slice(0, 20)) log(`  ${problem}`)
    }
    for (const error of fonts.errors) log(`font error: ${error}`)
    if (orphans.length) log(options.prune ? `pruned ${orphans.length} unreferenced files` : `${orphans.length} unreferenced files on disk (run with --prune to delete)`)
    if (guard.dropped.length) {
      log(
        guard.write
          ? `${relative(appRoot, output)} lost ${guard.dropped.length} entries (${options.prune ? "--prune" : "--allow-shrink"}):`
          : `ERROR: ${relative(appRoot, output)} NOT written — it would lose ${guard.dropped.length} entries the current one has (their files are missing here):`,
      )
      for (const key of guard.dropped) log(`  ${key}`)
      if (!guard.write) log("  re-run to retry the downloads (--refresh-index for the audio/model indexes), or pass --allow-shrink (or --prune) to write the smaller manifest")
    }
    log(`manifest: ${output}${guard.write ? "" : " (kept)"} · report: ${reportPath} · ${((Date.now() - started) / 1000).toFixed(0)} s`)
    if (required.length) {
      log(`ERROR: ${required.length} required assets missing: ${required.slice(0, 10).join(", ")}`)
      return 1
    }
    return guard.write ? 0 : 1
}
