#!/usr/bin/env node
import { join, resolve } from "node:path"
import { BuildReadError, nodeBuildFiles } from "arknights-assets-extractor"
import { compileSeason, type CompileOptions } from "#compiler/packet/compile/season.js"
import { dataWorkspace } from "#workspace.js"
import { seasonPacketDirectory } from "#schema/packet-file.js"

const USAGE: string = "usage: --season <id> [--out <dir>] [--cache <dir>] [--report <file>] [--quiet] [--no-research] [--force]"

interface ParsedArgs {
  readonly quiet: boolean
  readonly noResearch: boolean
  readonly force: boolean
  readonly seasonId: string
  readonly outDir: string
  readonly extractCacheDir: string
  readonly reportPath: string
  readonly researchDir: string
  readonly tuningPath: string
}

function fail(message: string): never {
  console.error(`packet: ${message}`)
  process.exit(2)
}

function parseArgs(argv: readonly string[], workspace: ReturnType<typeof dataWorkspace>): ParsedArgs {
  let quiet = false
  let noResearch = false
  let force = false
  let seasonId: string | null = null
  let outDir: string | null = null
  let cacheDir: string | null = null
  let reportPath: string | null = null
  const flags: Readonly<Record<string, "quiet" | "noResearch" | "force">> = {
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
      if (flag === "quiet") quiet = true
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
  if (!seasonId) fail(`--season is required\n${USAGE}`)
  try {
    seasonPacketDirectory(seasonId)
  } catch (cause) {
    fail(cause instanceof Error ? cause.message : String(cause))
  }
  return {
    quiet,
    noResearch,
    force,
    seasonId,
    outDir: outDir ?? workspace.seasonDir(seasonId),
    extractCacheDir: cacheDir ?? workspace.extractCacheDir,
    reportPath: reportPath ?? workspace.reportPath,
    researchDir: workspace.researchDir,
    tuningPath: join(workspace.seasonInputDir(seasonId), "tuning.json"),
  }
}

const parsed = parseArgs(process.argv.slice(2), dataWorkspace())
const options: CompileOptions = parsed

compileSeason(nodeBuildFiles, options).then(
  (result) => {
    process.exitCode = result.exitCode
  },
  (cause: unknown) => {
    if (cause instanceof BuildReadError) console.error(`packet failed: ${cause.path}: ${cause.message}`)
    else if (cause instanceof Error) console.error("packet failed:", cause.stack ?? cause.message)
    else console.error("packet failed:", cause)
    process.exitCode = 1
  },
)
