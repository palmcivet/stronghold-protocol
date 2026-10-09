#!/usr/bin/env node
// 按调用方给的文件清单把字节写到 product/media，并把字体写到 product/font。

import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { BuildReadError } from "#port/build-error.js"
import { extractorWorkspace, type ExtractorWorkspace } from "#workspace.js"
import { Downloader, type DownloadJob } from "#download/downloader.js"
import { buildFonts, fontJobs } from "#font/build.js"
import { skelParserAvailable } from "#spine/skel.js"
import { processModels, type PlannedSpineModel } from "#spine/model.js"

const HELP_TEXT = `Usage: --jobs <file> [options]
  --jobs <file>     JSON { jobs: DownloadJob[], models?: PlannedSpineModel[] }
  --root <dir>      catalog workspace root
  --media <dir>     media output directory
  --font <dir>      font output directory
  --cache <dir>     compiler cache directory
  --concurrency=N   parallel downloads (default 16)
  --force           re-download files even when present
  --offline         no network: post-process what is on disk
  --dry-run         print the plan and exit
  --help            this text`

interface FetchFlags {
  readonly jobsPath: string | null
  readonly workspace: ExtractorWorkspace
  readonly concurrency: number
  readonly force: boolean
  readonly offline: boolean
  readonly dryRun: boolean
  readonly help: boolean
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function parseArgs(argv: readonly string[]): FetchFlags {
  let jobsPath: string | null = null
  let root: string | undefined
  let mediaDir: string | undefined
  let fontDir: string | undefined
  let cacheDir: string | undefined
  let concurrency = 16
  let force = false
  let offline = false
  let dryRun = false
  let help = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? ""
    const eq = arg.indexOf("=")
    const name = eq === -1 ? arg : arg.slice(0, eq)
    const inline = eq === -1 ? null : arg.slice(eq + 1)
    if (name === "--help" || name === "-h") help = true
    else if (name === "--force") force = true
    else if (name === "--offline") offline = true
    else if (name === "--dry-run") dryRun = true
    else if (name === "--concurrency") {
      const value = inline ?? argv[++index]
      concurrency = Math.max(1, Math.min(64, parseInt(value ?? "", 10) || 16))
    } else if (name === "--jobs") {
      const value = inline ?? argv[++index]
      if (!value || value.startsWith("--")) throw new Error(`--jobs needs a path\n${HELP_TEXT}`)
      jobsPath = value
    } else if (name === "--root" || name === "--media" || name === "--font" || name === "--cache") {
      const value = inline ?? argv[++index]
      if (!value || value.startsWith("--")) throw new Error(`${name} needs a path\n${HELP_TEXT}`)
      if (name === "--root") root = value
      else if (name === "--media") mediaDir = value
      else if (name === "--font") fontDir = value
      else cacheDir = value
    } else throw new Error(`unknown option ${arg}\n${HELP_TEXT}`)
  }
  const workspaceOptions = {
    ...(root === undefined ? {} : { root }),
    ...(mediaDir === undefined ? {} : { mediaDir }),
    ...(fontDir === undefined ? {} : { fontDir }),
    ...(cacheDir === undefined ? {} : { cacheDir }),
  }
  return { jobsPath, workspace: extractorWorkspace(workspaceOptions), concurrency, force, offline, dryRun, help }
}

function isJob(value: unknown): value is DownloadJob {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const row = value as { rel?: unknown; urls?: unknown; kind?: unknown }
  return typeof row.rel === "string" && Array.isArray(row.urls) && row.urls.every((url) => typeof url === "string") && typeof row.kind === "string"
}

function isModel(value: unknown): value is PlannedSpineModel {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const row = value as {
    key?: unknown
    kind?: unknown
    dir?: unknown
    pma?: unknown
    skillIndices?: unknown
    baseUrl?: unknown
    skel?: unknown
    atlas?: unknown
    pngs?: unknown
  }
  return (
    typeof row.key === "string" &&
    typeof row.kind === "string" &&
    typeof row.dir === "string" &&
    typeof row.pma === "boolean" &&
    Array.isArray(row.skillIndices) &&
    row.skillIndices.every((item) => typeof item === "number") &&
    typeof row.baseUrl === "string" &&
    isJob(row.skel) &&
    isJob(row.atlas) &&
    Array.isArray(row.pngs) &&
    row.pngs.every(isJob)
  )
}

async function readList(path: string): Promise<{ readonly jobs: readonly DownloadJob[]; readonly models: readonly PlannedSpineModel[] }> {
  let text: string
  try {
    text = await readFile(path, "utf8")
  } catch (cause) {
    throw new BuildReadError(path, `cannot read jobs: ${errorMessage(cause)}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch (cause) {
    throw new BuildReadError(path, `cannot read jobs: ${errorMessage(cause)}`)
  }
  const body = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as { jobs?: unknown; models?: unknown } : null
  const jobs = body?.jobs
  const models = body?.models ?? []
  if (!Array.isArray(jobs) || !jobs.every(isJob)) throw new BuildReadError(path, "jobs must be an array of { rel, urls, kind }")
  if (!Array.isArray(models) || !models.every(isModel)) throw new BuildReadError(path, "models must be an array of spine plans")
  return { jobs, models }
}

const flags = parseArgs(process.argv.slice(2))

if (flags.help) {
  console.log(HELP_TEXT)
} else if (!flags.jobsPath) {
  console.error(`fetch-media: --jobs is required\n${HELP_TEXT}`)
  process.exitCode = 2
} else {
  const jobsPath = flags.jobsPath
  const run = async (): Promise<number> => {
    if (!skelParserAvailable()) throw new BuildReadError(flags.workspace.root, "@pixi-spine/runtime-3.8 not found — run `npm install` first")
    const listed = await readList(jobsPath)
    console.log(`[fetch] ${listed.jobs.length} files, ${listed.models.length} spine models, catalog ${flags.workspace.root}`)
    if (flags.dryRun) return 0
    const assetsDir = flags.workspace.mediaDir
    const fontsDir = flags.workspace.fontDir
    const cacheDir = flags.workspace.cacheDir
    const downloader = new Downloader({
      root: assetsDir,
      ledgerPath: join(cacheDir, "assets-ledger.json"),
      concurrency: flags.concurrency,
      force: flags.force,
      log: (message) => console.log(message),
    })
    await downloader.loadLedger()
    if (!flags.offline) await downloader.run(listed.jobs, "files")
    if (!flags.offline) {
      const fontDownloader = new Downloader({
        root: fontsDir,
        ledgerPath: join(cacheDir, "fonts-ledger.json"),
        concurrency: 4,
        force: flags.force,
        log: (message) => console.log(message),
      })
      await fontDownloader.loadLedger()
      await fontDownloader.run(fontJobs(), "fonts")
    }
    await buildFonts(fontsDir, (message) => console.log(message))
    const models = new Map(listed.models.map((model) => [model.key, model]))
    await processModels(models, {
      root: assetsDir,
      dl: downloader,
      cachePath: join(cacheDir, "spine-info.json"),
      download: !flags.offline,
      log: (message) => console.log(message),
    })
    return 0
  }
  run().then(
    (code) => {
      process.exitCode = code
    },
    (cause) => {
      if (cause instanceof BuildReadError) console.error(`fetch-media: ${cause.path}: ${cause.message}`)
      else console.error(`fetch-media: ${errorMessage(cause)}`)
      process.exitCode = 1
    },
  )
}
