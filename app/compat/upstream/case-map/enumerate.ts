import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { availableParallelism, tmpdir } from "node:os"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

/** 一次枚举的结果。用例按文件与出现顺序排列。 */
export interface Enumeration {
  readonly cases: readonly string[]
  readonly errors: readonly EnumerationError[]
}

export interface EnumerationError {
  readonly file: string
  readonly reason: string
}

export interface MasterOptions {
  readonly concurrency?: number
  /** 单个测试文件的导入时限，毫秒。 */
  readonly timeoutMs?: number
}

const MASTER_TEST_FILE = /\.test\.(?:c|m)?js$/
const REGISTER = fileURLToPath(new URL("./preload/register.js", import.meta.url))
const RUN = fileURLToPath(new URL("./preload/run.js", import.meta.url))

function toPosix(path: string): string {
  return path.split("\\").join("/")
}

function walk(directory: string, accept: (path: string) => boolean): string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) found.push(...walk(path, accept))
    else if (accept(path)) found.push(path)
  }
  return found
}

/** 同一文件里重名的用例按出现顺序加 ` #2`、` #3`。 */
export function numberDuplicates(names: readonly string[]): readonly string[] {
  const seen = new Map<string, number>()
  return names.map((name) => {
    const count = (seen.get(name) ?? 0) + 1
    seen.set(name, count)
    return count === 1 ? name : `${name} #${count}`
  })
}

/** master 的测试文件：`test/` 下的 `*.test.js`、`*.test.mjs`、`*.test.cjs`，路径相对 `test/`，已排序。 */
export function masterTestFiles(repoDir: string): readonly string[] {
  const root = join(repoDir, "test")
  return walk(root, (path) => MASTER_TEST_FILE.test(path))
    .map((path) => toPosix(relative(root, path)))
    .sort()
}

/** 文件里的错误信息只保留首行之后最多几行，便于报告阅读。 */
function shortReason(reason: string): string {
  return reason.split("\n").slice(0, 3).join("\n")
}

function runFile(repoDir: string, file: string, resultFile: string, timeoutMs: number): Promise<{ names?: string[]; error?: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, ["--import", REGISTER, RUN, join(repoDir, "test", file), resultFile], {
      cwd: repoDir,
      stdio: ["ignore", "ignore", "pipe"],
    })
    let stderr = ""
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8")
    })
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs)
    child.on("close", (code, signal) => {
      clearTimeout(timer)
      if (existsSync(resultFile)) {
        resolvePromise(JSON.parse(readFileSync(resultFile, "utf8")) as { names?: string[]; error?: string })
        return
      }
      const why = signal === "SIGKILL" ? `import did not finish within ${timeoutMs} ms` : `exited with ${code ?? signal}`
      resolvePromise({ error: stderr.trim() === "" ? why : `${why}\n${stderr.trim()}` })
    })
  })
}

/**
 * 枚举 master 的用例：每个测试文件在单独的子进程里导入，`node:test` 换成只记名字的替身，用例体不执行。
 * 导入失败的文件记为枚举错误。
 */
export async function enumerateMaster(repoDir: string, options: MasterOptions = {}): Promise<Enumeration> {
  if (!existsSync(repoDir)) {
    throw new Error(`no master checkout at ${repoDir}: put it at app/compat/upstream/repo/ or pass --repo <dir>`)
  }
  if (!existsSync(join(repoDir, "test"))) throw new Error(`${repoDir} has no test/ directory`)
  if (!existsSync(join(repoDir, "node_modules"))) {
    throw new Error(
      `${repoDir} has no node_modules: run npm ci in that directory first (the default master checkout is app/compat/upstream/repo/; pass --repo <dir> for another one)`,
    )
  }
  const files = masterTestFiles(repoDir)
  const concurrency = Math.max(1, options.concurrency ?? availableParallelism())
  const timeoutMs = options.timeoutMs ?? 60_000
  const scratch = mkdtempSync(join(tmpdir(), "case-map-"))
  const results: { names?: string[]; error?: string }[] = new Array(files.length)
  try {
    let next = 0
    const worker = async (): Promise<void> => {
      while (next < files.length) {
        const index = next
        next += 1
        const file = files[index] ?? ""
        results[index] = await runFile(repoDir, file, join(scratch, `${index}.json`), timeoutMs)
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker))
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
  const cases: string[] = []
  const errors: EnumerationError[] = []
  files.forEach((file, index) => {
    const result = results[index] ?? {}
    if (result.error !== undefined) errors.push({ file, reason: shortReason(result.error) })
    else for (const name of numberDuplicates(result.names ?? [])) cases.push(`${file}::${name}`)
  })
  return { cases, errors }
}

/** pnpm-workspace.yaml 的 packages 列表。 */
export function workspacePatterns(yaml: string): readonly string[] {
  const patterns: string[] = []
  let inside = false
  for (const line of yaml.split("\n")) {
    if (/^\S/.test(line)) inside = line.trim() === "packages:"
    else if (inside) {
      const item = /^\s+-\s+["']?([^"']+)["']?\s*$/.exec(line)
      if (item?.[1] !== undefined) patterns.push(item[1])
    }
  }
  return patterns
}

/** 展开工作区模式，只支持末段的 `*`。返回有 package.json 的目录，相对仓库根。 */
export function workspacePackages(repoRoot: string, patterns: readonly string[]): readonly string[] {
  const found = new Set<string>()
  for (const pattern of patterns) {
    if (pattern.endsWith("/*")) {
      const parent = pattern.slice(0, -2)
      const directory = join(repoRoot, parent)
      if (!existsSync(directory)) continue
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && existsSync(join(directory, entry.name, "package.json"))) found.add(`${parent}/${entry.name}`)
      }
    } else if (existsSync(join(repoRoot, pattern, "package.json"))) found.add(pattern)
  }
  return [...found].sort()
}

interface VitestListEntry {
  readonly name: string
  readonly file: string
}

function vitestList(repoRoot: string, packageDir: string, outFile: string): Promise<string | null> {
  const cli = join(repoRoot, "node_modules", "vitest", "vitest.mjs")
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [cli, "list", `--json=${outFile}`], {
      cwd: join(repoRoot, packageDir),
      stdio: ["ignore", "ignore", "pipe"],
    })
    let stderr = ""
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8")
    })
    child.on("close", (code) => resolvePromise(code === 0 ? null : stderr.trim() || `vitest list exited with ${code}`))
  })
}

/** 枚举 next 的用例：在每个有 vitest 配置的子包里运行 `vitest list --json`，不执行用例。 */
export async function enumerateNext(repoRoot: string): Promise<Enumeration> {
  const patterns = workspacePatterns(readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf8"))
  const packages = workspacePackages(repoRoot, patterns).filter((dir) =>
    ["vitest.config.ts", "vitest.config.mts", "vitest.config.js"].some((name) => existsSync(join(repoRoot, dir, name))),
  )
  const scratch = mkdtempSync(join(tmpdir(), "case-map-next-"))
  const cases: string[] = []
  const errors: EnumerationError[] = []
  try {
    for (const [index, dir] of packages.entries()) {
      const outFile = join(scratch, `${index}.json`)
      const failure = await vitestList(repoRoot, dir, outFile)
      if (failure !== null || !existsSync(outFile)) {
        errors.push({ file: dir, reason: shortReason(failure ?? "vitest list wrote no output") })
        continue
      }
      const entries = JSON.parse(readFileSync(outFile, "utf8")) as VitestListEntry[]
      for (const entry of entries) cases.push(`${toPosix(relative(repoRoot, entry.file))}::${entry.name}`)
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
  return { cases, errors }
}
