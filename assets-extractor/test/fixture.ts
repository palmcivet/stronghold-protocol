// 测试夹具：最小的合法文件、内存中的仓库工作区，以及用本地目录模拟浅克隆与稀疏检出的 RepoCache。

import { cp, mkdir, readdir, writeFile } from "node:fs/promises"
import { dirname, join, relative, sep } from "node:path"
import type { AssetKey } from "arknights-assets-catalog"
import { repoLabel, type RepoCache, type RepoRef, type RepoStats, type RepoWorkspace } from "#download/repo-cache.js"
import { RepoIndex } from "#download/repo-index.js"
import { mergeSparse, sparseCovers } from "#download/sparse.js"
import type { BuildFiles } from "#port/build-files.js"
import { nodeBuildFiles } from "#port/node-files.js"
import type { SourceContext } from "#source/asset-source.js"

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  return Buffer.concat([length, Buffer.from(type, "latin1"), data, Buffer.alloc(4)])
}

/** A complete PNG of the given size; `seed` changes the bytes without changing the size. */
export function png(width = 2, height = 2, seed = 0): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("tEXt", Buffer.from(`seed${seed}`, "latin1")),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

export function mp3(seed = 0): Buffer {
  return Buffer.concat([Buffer.from("ID3", "latin1"), Buffer.alloc(125, seed)])
}

/** A CFF-flavoured sfnt font that the WOFF2 encoder accepts. */
export function otf(): Buffer {
  const tables: [string, Buffer][] = [
    ["CFF ", Buffer.from("cff data ".repeat(20))],
    ["head", Buffer.alloc(54, 7)],
  ]
  const header = Buffer.alloc(12 + 16 * tables.length)
  header.writeUInt32BE(0x4f54544f, 0)
  header.writeUInt16BE(tables.length, 4)
  let offset = header.length
  const bodies: Buffer[] = []
  tables.forEach(([tag, data], index) => {
    const record = 12 + 16 * index
    header.write(tag, record, "latin1")
    header.writeUInt32BE(offset, record + 8)
    header.writeUInt32BE(data.length, record + 12)
    const padded = Buffer.alloc((data.length + 3) & ~3)
    data.copy(padded)
    bodies.push(padded)
    offset += padded.length
  })
  return Buffer.concat([header, ...bodies])
}

/** A workspace whose index is a fixed list of paths; nothing is read from disk. */
export class MemoryWorkspace implements RepoWorkspace {
  readonly ref: RepoRef
  readonly root: string
  readonly revision: string
  readonly index: RepoIndex
  sparse: readonly string[] = []

  constructor(ref: RepoRef, paths: Iterable<string>, revision = "0".repeat(40)) {
    this.ref = ref
    this.root = `/repos/${ref.owner}/${ref.repo}@${ref.branch}`
    this.revision = revision
    this.index = new RepoIndex(paths)
  }

  async checkout(directories: readonly string[]): Promise<void> {
    this.sparse = mergeSparse(this.sparse, directories)
  }
}

/** Build files backed by a map of absolute paths. */
export function memoryFiles(entries: Readonly<Record<string, string | Uint8Array>> = {}): BuildFiles {
  const store = new Map<string, Uint8Array>(Object.entries(entries).map(([path, data]) => [path, typeof data === "string" ? Buffer.from(data) : data]))
  const read = (path: string): Uint8Array => {
    const data = store.get(path)
    if (!data) throw new Error(`ENOENT ${path}`)
    return data
  }
  return {
    async readText(path) {
      return Buffer.from(read(path)).toString("utf8")
    },
    async readBytes(path) {
      return read(path)
    },
    async writeTextAtomic(path, text) {
      store.set(path, Buffer.from(text))
    },
    async writeBytesAtomic(path, bytes) {
      store.set(path, bytes)
    },
    async exists(path) {
      return store.has(path)
    },
    async readDir(path) {
      return [...store.keys()].filter((file) => dirname(file) === path).map((file) => file.slice(path.length + 1))
    },
  }
}

export interface TestContext {
  readonly context: SourceContext
  readonly ambiguous: { key: AssetKey; candidates: readonly string[] }[]
}

/** A source context over fixed workspaces; `repos.open` returns null for any other repository. */
export function testContext(workspaces: readonly RepoWorkspace[], files: BuildFiles = memoryFiles()): TestContext {
  const ambiguous: { key: AssetKey; candidates: readonly string[] }[] = []
  const byLabel = new Map(workspaces.map((workspace) => [repoLabel(workspace.ref), workspace]))
  const repos: RepoCache = {
    async open(ref) {
      return byLabel.get(repoLabel(ref)) ?? null
    },
    async stats() {
      return []
    },
  }
  const context: SourceContext = {
    cacheDir: "/cache",
    files,
    repos,
    offline: false,
    refreshIndex: false,
    ambiguous(key, candidates) {
      ambiguous.push({ key, candidates })
    },
  }
  return { context, ambiguous }
}

/** Writes files under a directory, creating parent directories. */
export async function writeTree(root: string, tree: Readonly<Record<string, string | Uint8Array>>): Promise<void> {
  for (const [path, data] of Object.entries(tree)) {
    const target = join(root, path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, data)
  }
}

async function listFiles(root: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else out.push(relative(root, full).split(sep).join("/"))
    }
  }
  await walk(root)
  return out
}

class DirectoryWorkspace implements RepoWorkspace {
  readonly ref: RepoRef
  readonly root: string
  readonly revision: string
  readonly index: RepoIndex
  sparse: readonly string[] = []
  readonly checkouts: (readonly string[])[] = []
  readonly #upstream: string
  readonly #offline: boolean

  constructor(ref: RepoRef, upstream: string, root: string, revision: string, paths: readonly string[], offline: boolean) {
    this.ref = ref
    this.#upstream = upstream
    this.root = root
    this.revision = revision
    this.index = new RepoIndex(paths)
    this.#offline = offline
  }

  async checkout(directories: readonly string[]): Promise<void> {
    const added = directories.filter((dir) => dir.length > 0 && !sparseCovers(this.sparse, dir))
    if (added.length === 0 || this.#offline) return
    this.checkouts.push(added)
    for (const dir of added) await cp(join(this.#upstream, dir), join(this.root, dir), { recursive: true })
    this.sparse = mergeSparse(this.sparse, added)
  }
}

/**
 * Simulates shallow sparse clones with local directories: `upstream/<owner>/<repo>@<branch>/` holds the full tree,
 * opening a branch copies only its root files (like cone mode), and `checkout` copies whole directories.
 * Offline, a branch whose clone directory does not exist yet is not opened.
 */
export class DirectoryRepoCache implements RepoCache {
  readonly opened = new Map<string, DirectoryWorkspace>()
  readonly #upstream: string
  readonly #repos: string
  readonly #offline: boolean
  readonly #revision: string

  constructor(upstream: string, repos: string, options: { readonly offline?: boolean; readonly revision?: string } = {}) {
    this.#upstream = upstream
    this.#repos = repos
    this.#offline = options.offline ?? false
    this.#revision = options.revision ?? "f".repeat(40)
  }

  async open(ref: RepoRef): Promise<RepoWorkspace | null> {
    const label = repoLabel(ref)
    const existing = this.opened.get(label)
    if (existing) return existing
    const upstream = join(this.#upstream, ref.owner, `${ref.repo}@${ref.branch}`)
    if (!(await nodeBuildFiles.exists(upstream))) return null
    const root = join(this.#repos, ref.owner, `${ref.repo}@${ref.branch}`)
    if (this.#offline && !(await nodeBuildFiles.exists(root))) return null
    const paths = await listFiles(upstream)
    if (!this.#offline) {
      for (const path of paths.filter((file) => !file.includes("/"))) await cp(join(upstream, path), join(root, path))
    }
    const workspace = new DirectoryWorkspace(ref, upstream, root, this.#revision, paths, this.#offline)
    this.opened.set(label, workspace)
    return workspace
  }

  async stats(): Promise<readonly RepoStats[]> {
    return [...this.opened]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([repo, workspace]) => ({ repo, revision: workspace.revision, cloned: false, cloneMs: null, checkoutMs: 0, sparse: workspace.sparse, diskBytes: 0 }))
  }
}
