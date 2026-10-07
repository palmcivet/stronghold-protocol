#!/usr/bin/env node
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { CatalogReadError, fetchCatalogHttp, nodeCatalogFiles } from "arknights-assets-catalog"
import { compileSeason, type CompileOptions } from "#compiler/packet/compile/season.js"
import { appRootFrom } from "#compiler/repo-root.js"
import { seasonPacketDirectory } from "#schema/packet-file.js"

const USAGE: string = "usage: --season <id> [--refresh | --offline] [--out <dir>] [--cache <dir>] [--report <file>] [--quiet] [--no-research] [--force]"

interface ParsedArgs {
  readonly refresh: boolean
  readonly offline: boolean
  readonly quiet: boolean
  readonly noResearch: boolean
  readonly force: boolean
  readonly seasonId: string
  readonly outDir: string
  readonly cacheDir: string
  readonly reportPath: string
  readonly researchDir: string
  readonly tuningPath: string
}

function fail(message: string): never {
  console.error(`packet: ${message}`)
  process.exit(2)
}

function parseArgs(argv: readonly string[], appRoot: string): ParsedArgs {
  let refresh = false
  let offline = false
  let quiet = false
  let noResearch = false
  let force = false
  let seasonId: string | null = null
  let outDir: string | null = null
  let cacheDir: string | null = null
  let reportPath: string | null = null
  const flags: Readonly<Record<string, "refresh" | "offline" | "quiet" | "noResearch" | "force">> = {
    "--refresh": "refresh",
    "--offline": "offline",
    "--quiet": "quiet",
    "--no-research": "noResearch",
    "--force": "force",
  }
  const values: Readonly<Record<string, "out" | "cache" | "report" | "season">> = {
    "--out": "out",
    "--cache": "cache",
    "--report": "report",
    "--season": "season",
  }
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index] ?? ""
    const eq = token.indexOf("=")
    const name = eq === -1 ? token : token.slice(0, eq)
    const inline = eq === -1 ? null : token.slice(eq + 1)
    if (name === "--help" || name === "-h") {
      console.log(USAGE)
      process.exit(0)
    }
    const flag = flags[name]
    if (flag && inline === null) {
      if (flag === "refresh") refresh = true
      else if (flag === "offline") offline = true
      else if (flag === "quiet") quiet = true
      else if (flag === "noResearch") noResearch = true
      else force = true
      continue
    }
    const valueName = values[name]
    if (valueName) {
      const value = inline ?? argv[++index]
      if (!value || value.startsWith("--")) fail(`${name} needs ${valueName === "season" ? "an id" : "a path argument"}\n${USAGE}`)
      if (valueName === "season") seasonId = value
      else if (valueName === "out") outDir = resolve(value)
      else if (valueName === "cache") cacheDir = resolve(value)
      else reportPath = resolve(value)
      continue
    }
    fail(`unknown option ${token}\n${USAGE}`)
  }
  if (refresh && offline) fail(`--refresh and --offline are mutually exclusive\n${USAGE}`)
  if (!seasonId) fail(`--season is required\n${USAGE}`)
  let seasonDir: string
  try {
    seasonDir = seasonPacketDirectory(seasonId)
  } catch (cause) {
    fail(cause instanceof Error ? cause.message : String(cause))
  }
  return {
    refresh,
    offline,
    quiet,
    noResearch,
    force,
    seasonId,
    outDir: outDir ?? join(appRoot, seasonDir),
    cacheDir: cacheDir ?? join(appRoot, ".cache", "gamedata"),
    reportPath: reportPath ?? join(appRoot, ".cache", "build-data-report.json"),
    researchDir: join(appRoot, "data", "compiler", "input", "research"),
    tuningPath: join(appRoot, "data", "compiler", "input", "season", seasonId, "tuning.json"),
  }
}

const here: string = fileURLToPath(import.meta.url)
const options: CompileOptions = parseArgs(process.argv.slice(2), appRootFrom(here))

compileSeason(nodeCatalogFiles, fetchCatalogHttp, options).then(
  (result) => {
    process.exitCode = result.exitCode
  },
  (cause: unknown) => {
    if (cause instanceof CatalogReadError) console.error(`packet failed: ${cause.path}: ${cause.message}`)
    else if (cause instanceof Error) console.error("packet failed:", cause.stack ?? cause.message)
    else console.error("packet failed:", cause)
    process.exitCode = 1
  },
)
