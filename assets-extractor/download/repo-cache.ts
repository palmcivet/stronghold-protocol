// 上游仓库的浅克隆：`--depth 1 --filter=blob:none --sparse`，按「仓库@分支」各一份。
// 文件列表从树对象读取，不下载内容；检出目录按需追加（cone 模式），之后才下载这些目录的文件内容。

import { lstat, mkdir, readdir, rename, rm } from "node:fs/promises"
import { join } from "node:path"
import { RepoIndex } from "#download/repo-index.js"
import { mergeSparse, sparseCovers } from "#download/sparse.js"
import type { BuildFiles } from "#port/build-files.js"
import { GitError, type GitProcess } from "#port/git-process.js"

/** Oldest git with cone-mode `sparse-checkout`. */
export const MIN_GIT_VERSION: readonly [number, number, number] = [2, 25, 0]

/** First git that rejects cone directories containing glob characters unless given `--skip-checks`. */
export const SKIP_CHECKS_GIT_VERSION: readonly [number, number, number] = [2, 36, 0]

/** Whether a directory name holds a character git treats as a pattern, such as the `[` of `[uc]battlecommon`. */
export function hasGlobCharacter(directory: string): boolean {
  return /[*?[\]\\]/.test(directory)
}

export interface RepoRef {
  readonly owner: string
  readonly repo: string
  readonly branch: string
}

export function repoLabel(ref: RepoRef): string {
  return `${ref.owner}/${ref.repo}@${ref.branch}`
}

/** A shallow, sparse clone of one branch. */
export interface RepoWorkspace {
  readonly ref: RepoRef
  /** Absolute path of the working tree. */
  readonly root: string
  /** Commit of the clone. */
  readonly revision: string
  readonly index: RepoIndex
  /** Cone directories checked out so far. */
  readonly sparse: readonly string[]
  /** Adds directories to the checkout and downloads their files. Already checked out directories stay. */
  checkout(directories: readonly string[]): Promise<void>
}

export interface RepoStats {
  readonly repo: string
  readonly revision: string
  /** True when this run made the first clone. */
  readonly cloned: boolean
  readonly cloneMs: number | null
  readonly checkoutMs: number
  readonly sparse: readonly string[]
  /** Bytes on disk of the clone, `.git` included. */
  readonly diskBytes: number
}

/** Hands out shallow clones by repository and branch. */
export interface RepoCache {
  /** The workspace of a branch; null when offline and the branch was never cloned. */
  open(ref: RepoRef): Promise<RepoWorkspace | null>
  stats(): Promise<readonly RepoStats[]>
}

export function parseGitVersion(text: string): [number, number, number] | null {
  const match = /git version (\d+)\.(\d+)(?:\.(\d+))?/.exec(text)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)]
}

function versionBelow(version: readonly number[], minimum: readonly number[]): boolean {
  for (let index = 0; index < minimum.length; index += 1) {
    const have = version[index] ?? 0
    const want = minimum[index] ?? 0
    if (have !== want) return have < want
  }
  return false
}

/** Throws unless the installed git supports cone-mode sparse checkout. */
export async function assertGitVersion(git: GitProcess): Promise<string> {
  let text: string
  try {
    text = await git.run(["--version"], { timeoutMs: 30_000 })
  } catch (cause) {
    throw new GitError(["--version"], `git is required to fetch upstream repositories (${cause instanceof Error ? cause.message : String(cause)})`)
  }
  const version = parseGitVersion(text)
  if (!version) throw new GitError(["--version"], `cannot read the git version from ${JSON.stringify(text.trim())}`)
  if (versionBelow(version, MIN_GIT_VERSION)) {
    throw new GitError(["--version"], `git ${version.join(".")} is too old: cone-mode sparse-checkout needs git ${MIN_GIT_VERSION.join(".")} or newer`)
  }
  return version.join(".")
}

export function proxyEnvironment(proxy: string | null): Readonly<Record<string, string>> {
  if (!proxy) return {}
  return { HTTPS_PROXY: proxy, HTTP_PROXY: proxy, ALL_PROXY: proxy, https_proxy: proxy, http_proxy: proxy, all_proxy: proxy }
}

export interface GitRepoCacheOptions {
  /** `<cache>/repos`. */
  readonly reposDir: string
  readonly git: GitProcess
  readonly files: BuildFiles
  /** No network: only existing clones and checked out files are used. */
  readonly offline?: boolean
  /** Move every opened clone to the latest commit of its branch. */
  readonly refresh?: boolean
  readonly proxy?: string | null
  /** Attempts per network operation. */
  readonly retries?: number
  /** First retry delay; doubles on each attempt, plus jitter. */
  readonly backoffMs?: number
  /** Limit for one git process. */
  readonly timeoutMs?: number
  /** Repository URL; defaults to GitHub over HTTPS. */
  readonly url?: (ref: RepoRef) => string
  readonly log?: (message: string) => void
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function directoryBytes(path: string): Promise<number> {
  let total = 0
  const stack = [path]
  while (stack.length) {
    const dir = stack.pop() as string
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else {
        try {
          total += (await lstat(full)).size
        } catch {
          // 文件在统计期间被移走。
        }
      }
    }
  }
  return total
}

interface OpenedRepo {
  readonly revision: string
  readonly cloned: boolean
  readonly cloneMs: number | null
  readonly root: string
  readonly workspace: GitWorkspace
  readonly timing: { checkoutMs: number }
}

class GitWorkspace implements RepoWorkspace {
  readonly ref: RepoRef
  readonly root: string
  readonly revision: string
  readonly index: RepoIndex
  sparse: readonly string[]
  readonly #cache: GitRepoCache
  readonly #stats: { checkoutMs: number }

  constructor(cache: GitRepoCache, ref: RepoRef, root: string, revision: string, index: RepoIndex, sparse: readonly string[], stats: { checkoutMs: number }) {
    this.#cache = cache
    this.ref = ref
    this.root = root
    this.revision = revision
    this.index = index
    this.sparse = sparse
    this.#stats = stats
  }

  async checkout(directories: readonly string[]): Promise<void> {
    const added = directories.filter((dir) => dir.length > 0 && !sparseCovers(this.sparse, dir))
    if (added.length === 0 || this.#cache.offline) return
    const next = mergeSparse(this.sparse, added)
    const started = Date.now()
    const skipChecks = added.some(hasGlobCharacter) && (await this.#cache.rejectsGlobDirectories()) ? ["--skip-checks"] : []
    const args = this.sparse.length === 0 ? ["sparse-checkout", "set", "--cone", ...skipChecks, ...next] : ["sparse-checkout", "add", ...skipChecks, ...added]
    await this.#cache.network(args, this.root, `checkout ${added.length} directories of ${repoLabel(this.ref)}`)
    this.#stats.checkoutMs += Date.now() - started
    this.sparse = next
  }
}

/** `RepoCache` backed by the git command line. */
export class GitRepoCache implements RepoCache {
  readonly offline: boolean
  readonly #options: GitRepoCacheOptions
  readonly #open = new Map<string, Promise<RepoWorkspace | null>>()
  readonly #opened = new Map<string, OpenedRepo>()
  #globCheck: Promise<boolean> | null = null

  constructor(options: GitRepoCacheOptions) {
    this.#options = options
    this.offline = options.offline ?? false
  }

  #log(message: string): void {
    ;(this.#options.log ?? console.log)(message)
  }

  #env(): Readonly<Record<string, string>> {
    return proxyEnvironment(this.#options.proxy ?? null)
  }

  #timeout(): number {
    return this.#options.timeoutMs ?? 600_000
  }

  /** Runs a git command that talks to the remote, with retries and exponential backoff. */
  async network(args: readonly string[], cwd: string | undefined, label: string): Promise<string> {
    const retries = Math.max(1, this.#options.retries ?? 3)
    const backoff = Math.max(0, this.#options.backoffMs ?? 400)
    let last: unknown = null
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        return await this.#options.git.run(args, { ...(cwd === undefined ? {} : { cwd }), timeoutMs: this.#timeout(), env: this.#env() })
      } catch (cause) {
        last = cause
        this.#log(`[repos] ${label} failed (attempt ${attempt}/${retries}): ${cause instanceof Error ? cause.message.split("\n")[0] : String(cause)}`)
        if (attempt < retries && backoff > 0) await sleep(backoff * 2 ** (attempt - 1) + Math.floor(Math.random() * backoff))
      }
    }
    throw last instanceof Error ? last : new Error(String(last))
  }

  /** Whether this git needs `--skip-checks` for cone directories with glob characters; git escapes them in the pattern file. */
  rejectsGlobDirectories(): Promise<boolean> {
    this.#globCheck ??= this.#options.git.run(["--version"], { timeoutMs: 30_000 }).then((text) => {
      const version = parseGitVersion(text)
      return version !== null && !versionBelow(version, SKIP_CHECKS_GIT_VERSION)
    })
    return this.#globCheck
  }

  async #local(args: readonly string[], cwd: string): Promise<string> {
    return this.#options.git.run(args, { cwd, timeoutMs: this.#timeout(), env: this.#env() })
  }

  directoryOf(ref: RepoRef): string {
    return join(this.#options.reposDir, ref.owner, `${ref.repo}@${ref.branch}`)
  }

  open(ref: RepoRef): Promise<RepoWorkspace | null> {
    const label = repoLabel(ref)
    let pending = this.#open.get(label)
    if (!pending) {
      pending = this.#openOnce(ref)
      this.#open.set(label, pending)
    }
    return pending
  }

  async #openOnce(ref: RepoRef): Promise<RepoWorkspace | null> {
    const label = repoLabel(ref)
    const root = this.directoryOf(ref)
    const present = await this.#options.files.exists(join(root, ".git"))
    let cloned = false
    let cloneMs: number | null = null
    if (!present) {
      if (this.offline) return null
      const url = this.#options.url?.(ref) ?? `https://github.com/${ref.owner}/${ref.repo}.git`
      const temporary = `${root}.tmp-${process.pid}`
      await rm(temporary, { recursive: true, force: true })
      await mkdir(join(root, ".."), { recursive: true })
      this.#log(`[repos] cloning ${label}`)
      const started = Date.now()
      try {
        await this.network(["clone", "--depth", "1", "--filter=blob:none", "--sparse", "--single-branch", "--branch", ref.branch, url, temporary], undefined, `clone ${label}`)
      } catch (cause) {
        await rm(temporary, { recursive: true, force: true })
        throw cause
      }
      await rename(temporary, root)
      cloneMs = Date.now() - started
      cloned = true
      this.#log(`[repos] cloned ${label} in ${cloneMs} ms`)
    } else if (this.#options.refresh && !this.offline) {
      this.#log(`[repos] refreshing ${label}`)
      await this.network(["fetch", "--depth", "1", "--filter=blob:none", "origin", ref.branch], root, `fetch ${label}`)
      await this.network(["reset", "--hard", "FETCH_HEAD"], root, `update ${label}`)
    }
    const revision = (await this.#local(["rev-parse", "HEAD"], root)).trim()
    const listing = await this.#local(["ls-tree", "-r", "-z", "--name-only", "HEAD"], root)
    const index = new RepoIndex(listing.split("\0").filter((path) => path.length > 0))
    const sparseText = await this.#local(["sparse-checkout", "list"], root).catch(() => "")
    const sparse = mergeSparse([], sparseText.split("\n").map((line) => line.trim()).filter((line) => line.length > 0))
    const stats = { checkoutMs: 0 }
    const workspace = new GitWorkspace(this, ref, root, revision, index, sparse, stats)
    this.#opened.set(label, { revision, cloned, cloneMs, root, workspace, timing: stats })
    return workspace
  }

  async stats(): Promise<readonly RepoStats[]> {
    const out: RepoStats[] = []
    for (const [repo, stats] of [...this.#opened].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      out.push({
        repo,
        revision: stats.revision,
        cloned: stats.cloned,
        cloneMs: stats.cloneMs,
        checkoutMs: stats.timing.checkoutMs,
        sparse: stats.workspace.sparse,
        diskBytes: await directoryBytes(stats.root),
      })
    }
    return out
  }
}
