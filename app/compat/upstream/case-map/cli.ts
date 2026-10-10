#!/usr/bin/env node
// pnpm case-map [--repo <dir, default app/compat/upstream/repo>] [--commit <sha>] [--write-inventory] [--concurrency <n>]
// Enumerates the master cases and the next cases, checks mapping.json against both and prints the report.
// Exits 1 on unmapped cases, dangling references, cases that need their own entry, enumeration errors or an invalid
// mapping. --write-inventory records this enumeration and its commit in inventory.json.

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { checkCaseMap, hasFailures, parseInventory, parseMapping, type CheckReport, type Inventory } from "#case-map/check.js"
import { enumerateMaster, enumerateNext, type EnumerationError } from "#case-map/enumerate.js"
import { DEFAULT_REPO_DIR, PACKAGE_ROOT, WORKSPACE_ROOT } from "#case-map/root.js"

const USAGE = "usage: case-map [--repo <dir>] [--commit <sha>] [--write-inventory] [--concurrency <n>]"
const CASE_MAP_DIR = resolve(PACKAGE_ROOT, "case-map")
const MAPPING_FILE = resolve(CASE_MAP_DIR, "mapping.json")
const INVENTORY_FILE = resolve(CASE_MAP_DIR, "inventory.json")
const LIST_LIMIT = 50

interface Options {
  readonly repo: string
  readonly commit: string | null
  readonly writeInventory: boolean
  readonly concurrency: number | undefined
}

function parseOptions(args: readonly string[]): Options {
  let repo = DEFAULT_REPO_DIR
  let commit: string | null = null
  let writeInventory = false
  let concurrency: number | undefined
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const value = args[index + 1]
    if (arg === "--write-inventory") writeInventory = true
    else if (arg === "--repo" && value !== undefined) {
      repo = resolve(value)
      index += 1
    } else if (arg === "--commit" && value !== undefined) {
      commit = value
      index += 1
    } else if (arg === "--concurrency" && value !== undefined && Number.isInteger(Number(value)) && Number(value) > 0) {
      concurrency = Number(value)
      index += 1
    } else throw new Error(`${USAGE}\nunknown argument: ${arg ?? ""}`)
  }
  return { repo, commit, writeInventory, concurrency }
}

/** master 目录的提交号。目录本身不是 git 检出的根（包括位于别的仓库之内）时返回 null。 */
function detectCommit(repo: string): string | null {
  const git = (...args: string[]): string =>
    execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
  try {
    if (realpathSync(git("rev-parse", "--show-toplevel")) !== realpathSync(repo)) return null
    return git("rev-parse", "--short=8", "HEAD")
  } catch {
    return null
  }
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown
}

function printList(title: string, items: readonly string[]): void {
  if (items.length === 0) return
  console.log(`\n${title} (${items.length}):`)
  for (const item of items.slice(0, LIST_LIMIT)) console.log(`  ${item}`)
  if (items.length > LIST_LIMIT) console.log(`  … ${items.length - LIST_LIMIT} more`)
}

function printErrors(title: string, errors: readonly EnumerationError[]): void {
  if (errors.length === 0) return
  console.log(`\n${title} (${errors.length}):`)
  for (const error of errors) console.log(`  ${error.file}\n    ${error.reason.split("\n").join("\n    ")}`)
}

function printReport(report: CheckReport): void {
  const { byStatus } = report
  console.log(`master cases: ${report.total}`)
  console.log(`  by entry: ${report.byCase}, by rule: ${report.total - report.byCase - report.unmapped.length}, unmapped: ${report.unmapped.length}`)
  console.log(
    `  covered ${byStatus.covered}, rewritten ${byStatus.rewritten}, moved ${byStatus.moved}, not-migrated ${byStatus["not-migrated"]}, pending ${byStatus.pending}`,
  )
  for (const [match, count] of Object.entries(report.byRule)) console.log(`  rule ${match}: ${count}`)
  printList("unmapped", report.unmapped)
  printList("need their own entry", report.notCaseByCase)
  printList(
    "dangling references",
    report.dangling.map((item) => `${item.id} -> ${item.next}`),
  )
  printList("new since the inventory", report.added)
  printList("gone or renamed since the inventory", report.vanished)
  printList("entries without a master case", report.staleEntries)
  printList("rules that match nothing", report.unusedRules)
}

async function main(): Promise<number> {
  const options = parseOptions(process.argv.slice(2))
  const parsedMapping = parseMapping(readJson(MAPPING_FILE))
  if ("issues" in parsedMapping) {
    printList("invalid mapping.json", parsedMapping.issues)
    return 1
  }
  const { mapping } = parsedMapping
  let inventory: Inventory | null = null
  if (existsSync(INVENTORY_FILE)) {
    const parsedInventory = parseInventory(readJson(INVENTORY_FILE))
    if ("issues" in parsedInventory) {
      printList("invalid inventory.json", parsedInventory.issues)
      return 1
    }
    inventory = parsedInventory.inventory
  }
  const commit = options.commit ?? detectCommit(options.repo)
  console.log(`master: ${options.repo} at ${commit ?? "an unknown commit"} (mapping: ${mapping.upstream.commit})`)
  const master = await enumerateMaster(options.repo, options.concurrency === undefined ? {} : { concurrency: options.concurrency })
  const next = await enumerateNext(WORKSPACE_ROOT)
  console.log(`next cases: ${next.cases.length}`)
  const report = checkCaseMap({ mapping, inventory, master: master.cases, next: next.cases })
  printReport(report)
  printErrors("master files that failed to import", master.errors)
  printErrors("next packages that failed to list", next.errors)
  if (commit !== null && !commit.startsWith(mapping.upstream.commit) && !mapping.upstream.commit.startsWith(commit)) {
    console.log(`\nmaster is at ${commit}, mapping.json at ${mapping.upstream.commit}: review the new cases, then update upstream.commit`)
  }
  if (options.writeInventory) {
    if (commit === null) {
      console.log("\n--write-inventory needs a commit: pass --commit <sha> when the master directory is not a git checkout")
      return 1
    }
    writeFileSync(INVENTORY_FILE, `${JSON.stringify({ commit, cases: master.cases }, null, 2)}\n`)
    console.log(`\nwrote ${INVENTORY_FILE}`)
  }
  const failed = hasFailures(report) || master.errors.length > 0 || next.errors.length > 0
  console.log(failed ? "\ncase map: FAILED" : "\ncase map: OK")
  return failed ? 1 : 0
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  },
)
