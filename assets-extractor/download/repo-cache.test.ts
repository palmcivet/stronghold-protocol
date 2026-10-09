import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, test } from "vitest"
import { assertGitVersion, GitRepoCache, hasGlobCharacter, parseGitVersion, proxyEnvironment, type RepoRef } from "#download/repo-cache.js"
import type { GitProcess, GitRunOptions } from "#port/git-process.js"
import { nodeBuildFiles } from "#port/node-files.js"

const REF: RepoRef = { owner: "o", repo: "r", branch: "main" }

interface Call {
  readonly args: readonly string[]
  readonly options: GitRunOptions
}

/** Answers like git for a clone whose tree holds `paths`; `failures` makes the first clones fail. */
function fakeGit(paths: readonly string[], failures = 0, version = "git version 2.39.5"): { git: GitProcess; calls: Call[] } {
  const calls: Call[] = []
  let failed = 0
  const git: GitProcess = {
    async run(args, options) {
      calls.push({ args, options })
      const [command] = args
      if (command === "clone") {
        if (failed < failures) {
          failed += 1
          throw new Error("network down")
        }
        await mkdir(join(args[args.length - 1] as string, ".git"), { recursive: true })
        return ""
      }
      if (command === "--version") return `${version}\n`
      if (command === "rev-parse") return "abc123\n"
      if (command === "ls-tree") return `${paths.join("\0")}\0`
      if (command === "sparse-checkout" && args[1] === "list") return ""
      return ""
    },
  }
  return { git, calls }
}

let dir = ""
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sp-repos-"))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

test("git version parsing and the cone-mode minimum", async () => {
  expect(parseGitVersion("git version 2.39.5 (Apple Git-154)")).toEqual([2, 39, 5])
  expect(parseGitVersion("git version 2.25")).toEqual([2, 25, 0])
  expect(parseGitVersion("nope")).toBeNull()
  const answering = (text: string): GitProcess => ({ run: async () => text })
  await expect(assertGitVersion(answering("git version 2.25.0"))).resolves.toBe("2.25.0")
  await expect(assertGitVersion(answering("git version 2.24.9"))).rejects.toThrow(/too old/)
  await expect(assertGitVersion({ run: async () => Promise.reject(new Error("ENOENT")) })).rejects.toThrow(/git is required/)
})

test("proxy settings become git environment variables", () => {
  expect(proxyEnvironment(null)).toEqual({})
  expect(proxyEnvironment("http://127.0.0.1:7890")).toMatchObject({ HTTPS_PROXY: "http://127.0.0.1:7890", http_proxy: "http://127.0.0.1:7890", ALL_PROXY: "http://127.0.0.1:7890" })
})

test("a first open makes a shallow blobless sparse clone and lists the tree", async () => {
  const { git, calls } = fakeGit(["a/b/c.png", "a/d.png", "root.json"])
  const cache = new GitRepoCache({ reposDir: dir, git, files: nodeBuildFiles, proxy: "http://p:1", timeoutMs: 1234, backoffMs: 0, log: () => {} })
  const workspace = await cache.open(REF)
  expect(workspace?.root).toBe(join(dir, "o", "r@main"))
  expect(workspace?.revision).toBe("abc123")
  expect(workspace?.index.paths).toEqual(["a/b/c.png", "a/d.png", "root.json"])
  const clone = calls.find((call) => call.args[0] === "clone")
  expect(clone?.args.slice(0, 8)).toEqual(["clone", "--depth", "1", "--filter=blob:none", "--sparse", "--single-branch", "--branch", "main"])
  expect(clone?.args[8]).toBe("https://github.com/o/r.git")
  expect(clone?.options.timeoutMs).toBe(1234)
  expect(clone?.options.env).toMatchObject({ HTTPS_PROXY: "http://p:1" })
  expect(await cache.open(REF)).toBe(workspace)
  expect(calls.filter((call) => call.args[0] === "clone")).toHaveLength(1)
  const [stats] = await cache.stats()
  expect(stats).toMatchObject({ repo: "o/r@main", revision: "abc123", cloned: true })
})

test("checkout sets the cone once, then only adds new directories", async () => {
  const { git, calls } = fakeGit(["a/b/c.png", "a/d.png", "e/f.png"])
  const cache = new GitRepoCache({ reposDir: dir, git, files: nodeBuildFiles, backoffMs: 0, log: () => {} })
  const workspace = await cache.open(REF)
  await workspace?.checkout(["a/b"])
  await workspace?.checkout(["a/b", "a/b/x"])
  await workspace?.checkout(["a", "e"])
  const sparse = calls.filter((call) => call.args[0] === "sparse-checkout" && call.args[1] !== "list").map((call) => call.args.join(" "))
  expect(sparse).toEqual(["sparse-checkout set --cone a/b", "sparse-checkout add a e"])
  expect(workspace?.sparse).toEqual(["a", "e"])
})

test("network failures are retried, then reported", async () => {
  const flaky = fakeGit([], 2)
  const cache = new GitRepoCache({ reposDir: dir, git: flaky.git, files: nodeBuildFiles, retries: 3, backoffMs: 0, log: () => {} })
  await expect(cache.open(REF)).resolves.not.toBeNull()
  expect(flaky.calls.filter((call) => call.args[0] === "clone")).toHaveLength(3)

  const down = fakeGit([], 5)
  const failing = new GitRepoCache({ reposDir: join(dir, "other"), git: down.git, files: nodeBuildFiles, retries: 2, backoffMs: 0, log: () => {} })
  await expect(failing.open(REF)).rejects.toThrow(/network down/)
  expect(down.calls.filter((call) => call.args[0] === "clone")).toHaveLength(2)
  expect(await nodeBuildFiles.exists(join(dir, "other", "o", "r@main"))).toBe(false)
})

test("offline never clones and never checks out", async () => {
  const { git, calls } = fakeGit(["a/b.png"])
  const offline = new GitRepoCache({ reposDir: dir, git, files: nodeBuildFiles, offline: true, log: () => {} })
  expect(await offline.open(REF)).toBeNull()
  await mkdir(join(dir, "o", "r@main", ".git"), { recursive: true })
  const reopened = new GitRepoCache({ reposDir: dir, git, files: nodeBuildFiles, offline: true, log: () => {} })
  const workspace = await reopened.open(REF)
  await workspace?.checkout(["a"])
  expect(calls.map((call) => call.args[0])).not.toContain("clone")
  expect(calls.filter((call) => call.args[0] === "sparse-checkout" && call.args[1] !== "list")).toEqual([])
})

test("refresh fetches the branch tip into an existing clone", async () => {
  const { git, calls } = fakeGit(["a.png"])
  await mkdir(join(dir, "o", "r@main", ".git"), { recursive: true })
  await writeFile(join(dir, "o", "r@main", "a.png"), "x")
  const cache = new GitRepoCache({ reposDir: dir, git, files: nodeBuildFiles, refresh: true, backoffMs: 0, log: () => {} })
  await cache.open(REF)
  expect(calls.slice(0, 2).map((call) => call.args.join(" "))).toEqual(["fetch --depth 1 --filter=blob:none origin main", "reset --hard FETCH_HEAD"])
  const [stats] = await cache.stats()
  expect(stats).toMatchObject({ cloned: false, cloneMs: null, diskBytes: 1 })
})

test("cone directories with glob characters pass --skip-checks on git that checks them", async () => {
  expect(hasGlobCharacter("assets/dyn/ui/[uc]battlecommon")).toBe(true)
  expect(hasGlobCharacter("assets/dyn/arts")).toBe(false)
  const sparseCalls = async (version: string): Promise<string[]> => {
    const { git, calls } = fakeGit(["a/[uc]b/c.png", "d/e.png"], 0, version)
    const cache = new GitRepoCache({ reposDir: join(dir, version), git, files: nodeBuildFiles, backoffMs: 0, log: () => {} })
    const workspace = await cache.open(REF)
    await workspace?.checkout(["d"])
    await workspace?.checkout(["a/[uc]b"])
    return calls.filter((call) => call.args[0] === "sparse-checkout" && call.args[1] !== "list").map((call) => call.args.join(" "))
  }
  expect(await sparseCalls("git version 2.39.5")).toEqual(["sparse-checkout set --cone d", "sparse-checkout add --skip-checks a/[uc]b"])
  expect(await sparseCalls("git version 2.30.1")).toEqual(["sparse-checkout set --cone d", "sparse-checkout add a/[uc]b"])
})
