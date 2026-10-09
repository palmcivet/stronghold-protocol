#!/usr/bin/env node
// pnpm extract --needs <file>... --cache <dir>：读需求清单，经来源表提取资源，写出缓存文件、原始目录、账本与报告。
// 退出码：0 成功；1 有必需键缺失；2 参数或环境错误。

import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { DEFAULT_CACHE_DIR } from "#catalog/cache-layout.js"
import { extractAssets } from "#catalog/extract.js"
import { readNeeds } from "#catalog/needs.js"
import { assertGitVersion, GitRepoCache, type RepoCache } from "#download/repo-cache.js"
import { BuildReadError } from "#port/build-error.js"
import type { BuildFiles } from "#port/build-files.js"
import type { GitProcess } from "#port/git-process.js"
import { nodeBuildFiles } from "#port/node-files.js"
import { nodeGitProcess } from "#port/node-git.js"
import type { AssetSource } from "#source/asset-source.js"
import { createSources } from "#source/table.js"
import { extractorWorkspace } from "#workspace.js"

export const EXTRACT_HELP = `Usage: pnpm extract --needs <file>... [options]
  --needs <file>...   one or more needs lists (schemaVersion 1)
  --cache <dir>       cache directory (default ${DEFAULT_CACHE_DIR})
  --offline           no network: use existing clones and checked out files only
  --force             copy and convert again even when the ledger says nothing changed
  --refresh-index     update every used clone to the latest commit of its branch
  --proxy <url>       proxy for git (HTTPS_PROXY, HTTP_PROXY, ALL_PROXY)
  --timeout <ms>      limit for one git process (default 600000)
  --help              this text`

export interface ExtractFlags {
  readonly needs: readonly string[]
  readonly cacheDir: string
  readonly offline: boolean
  readonly force: boolean
  readonly refreshIndex: boolean
  readonly proxy: string | null
  readonly timeoutMs: number
  readonly help: boolean
}

export class UsageError extends Error {
  constructor(message: string) {
    super(`${message}\n${EXTRACT_HELP}`)
    this.name = "UsageError"
  }
}

export function parseExtractArgs(argv: readonly string[]): ExtractFlags {
  const needs: string[] = []
  let cacheDir = DEFAULT_CACHE_DIR
  let offline = false
  let force = false
  let refreshIndex = false
  let proxy: string | null = null
  let timeoutMs = 600_000
  let help = false
  const valueOf = (name: string, inline: string | null, index: number): string => {
    const value = inline ?? argv[index]
    if (!value || value.startsWith("--")) throw new UsageError(`${name} needs a value`)
    return value
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? ""
    const eq = arg.indexOf("=")
    const name = arg.startsWith("--") && eq > 0 ? arg.slice(0, eq) : arg
    const inline = arg.startsWith("--") && eq > 0 ? arg.slice(eq + 1) : null
    if (name === "--help" || name === "-h") help = true
    else if (name === "--offline") offline = true
    else if (name === "--force") force = true
    else if (name === "--refresh-index") refreshIndex = true
    else if (name === "--needs") {
      if (inline !== null) needs.push(inline)
      while (index + 1 < argv.length && !(argv[index + 1] ?? "").startsWith("--")) needs.push(argv[++index] as string)
      if (needs.length === 0) throw new UsageError("--needs needs at least one file")
    } else if (name === "--cache") cacheDir = valueOf(name, inline, inline === null ? ++index : index)
    else if (name === "--proxy") proxy = valueOf(name, inline, inline === null ? ++index : index)
    else if (name === "--timeout") {
      const value = Number(valueOf(name, inline, inline === null ? ++index : index))
      if (!Number.isInteger(value) || value <= 0) throw new UsageError("--timeout needs a positive integer of milliseconds")
      timeoutMs = value
    } else throw new UsageError(`unknown option ${arg}`)
  }
  if (offline && refreshIndex) throw new UsageError("--offline and --refresh-index cannot be combined")
  if (!help && needs.length === 0) throw new UsageError("--needs is required")
  return { needs, cacheDir, offline, force, refreshIndex, proxy, timeoutMs, help }
}

export interface ExtractCommandDeps {
  readonly files?: BuildFiles
  readonly git?: GitProcess
  /** Replaces the git-backed clone cache. */
  readonly repos?: RepoCache
  readonly sources?: readonly AssetSource[]
  readonly log?: (message: string) => void
  readonly error?: (message: string) => void
}

/** Runs the command and returns its exit code. */
export async function extractCommand(argv: readonly string[], deps: ExtractCommandDeps = {}): Promise<number> {
  const log = deps.log ?? console.log
  const error = deps.error ?? console.error
  let flags: ExtractFlags
  try {
    flags = parseExtractArgs(argv)
  } catch (cause) {
    error(cause instanceof Error ? cause.message : String(cause))
    return 2
  }
  if (flags.help) {
    log(EXTRACT_HELP)
    return 0
  }
  const files = deps.files ?? nodeBuildFiles
  const git = deps.git ?? nodeGitProcess
  try {
    const layout = extractorWorkspace(flags.cacheDir).cache
    const needs = await readNeeds(files, flags.needs.map((path) => resolve(path)))
    let repos = deps.repos
    if (!repos) {
      log(`[extract] git ${await assertGitVersion(git)}`)
      repos = new GitRepoCache({ reposDir: layout.repos, git, files, offline: flags.offline, refresh: flags.refreshIndex, proxy: flags.proxy, timeoutMs: flags.timeoutMs, log })
    }
    const result = await extractAssets({
      needs,
      layout,
      files,
      repos,
      sources: deps.sources ?? (await createSources(files)),
      offline: flags.offline,
      force: flags.force,
      refreshIndex: flags.refreshIndex,
      log,
    })
    for (const need of result.catalog.missing) {
      const line = `[extract] missing ${need.required ? "required" : "optional"} ${need.key}: ${need.tried.map((attempt) => `${attempt.source}: ${attempt.reason}`).join("; ")}`
      if (need.required) error(line)
      else log(line)
    }
    log(`[extract] catalog ${layout.catalog}`)
    return result.missingRequired.length > 0 ? 1 : 0
  } catch (cause) {
    if (cause instanceof BuildReadError) error(`extract: ${cause.path}: ${cause.message}`)
    else error(`extract: ${cause instanceof Error ? cause.message : String(cause)}`)
    return 2
  }
}

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(entry).href) {
  extractCommand(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
