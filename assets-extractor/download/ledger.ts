// 文件账本 <cache>/ledger.json：每个规范化文件来自哪个仓库、哪个提交、哪条上游路径，以及输入与输出的哈希。

import type { AssetKey, FileFormat, FileRole } from "arknights-assets-catalog"
import type { BuildFiles } from "#port/build-files.js"

export interface LedgerRecord {
  /** Entry the file belongs to. */
  readonly key: AssetKey
  /** Need whose source hit produced the file; a Spine hit also produces its `json:spine-meta` entry. */
  readonly from: AssetKey
  readonly role: FileRole
  readonly name: string | null
  readonly format: FileFormat
  readonly source: string
  /** `owner/repo@branch`, or null for a source without a repository. */
  readonly repo: string | null
  readonly revision: string | null
  /** Upstream path of the entry, before renaming. */
  readonly path: string
  /** SHA-256 over every upstream file of the entry; equal input means the output can be reused. */
  readonly inputHash: string
  readonly bytes: number
  readonly hash: string
}

export interface LedgerFile {
  readonly schemaVersion: 1
  /** By file address under `files/`. */
  readonly files: Readonly<Record<string, LedgerRecord>>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isLedgerRecord(value: unknown): value is LedgerRecord {
  return (
    isRecord(value) &&
    typeof value["key"] === "string" &&
    typeof value["from"] === "string" &&
    typeof value["role"] === "string" &&
    (value["name"] === null || typeof value["name"] === "string") &&
    typeof value["format"] === "string" &&
    typeof value["source"] === "string" &&
    (value["repo"] === null || typeof value["repo"] === "string") &&
    (value["revision"] === null || typeof value["revision"] === "string") &&
    typeof value["path"] === "string" &&
    typeof value["inputHash"] === "string" &&
    typeof value["bytes"] === "number" &&
    typeof value["hash"] === "string"
  )
}

export class AssetLedger {
  readonly path: string
  readonly #files = new Map<string, LedgerRecord>()

  constructor(path: string, records: Iterable<readonly [string, LedgerRecord]> = []) {
    this.path = path
    for (const [address, record] of records) this.#files.set(address, record)
  }

  /** Reads the ledger; a missing or unreadable ledger starts empty. */
  static async load(files: BuildFiles, path: string): Promise<AssetLedger> {
    if (!(await files.exists(path))) return new AssetLedger(path)
    try {
      const parsed: unknown = JSON.parse(await files.readText(path))
      const records = isRecord(parsed) && isRecord(parsed["files"]) ? Object.entries(parsed["files"]).filter((row): row is [string, LedgerRecord] => isLedgerRecord(row[1])) : []
      return new AssetLedger(path, records)
    } catch {
      return new AssetLedger(path)
    }
  }

  /** Records produced by one need, by address. */
  recordsFrom(from: AssetKey): Map<string, LedgerRecord> {
    const out = new Map<string, LedgerRecord>()
    for (const [address, record] of this.#files) if (record.from === from) out.set(address, record)
    return out
  }

  /** Replaces every record produced by `from`, and any record at the same addresses, with `records`. */
  replaceFrom(from: AssetKey, records: ReadonlyMap<string, LedgerRecord>): void {
    for (const [address, record] of [...this.#files]) if (record.from === from || records.has(address)) this.#files.delete(address)
    for (const [address, record] of records) this.#files.set(address, record)
  }

  toJSON(): LedgerFile {
    const files: Record<string, LedgerRecord> = {}
    for (const address of [...this.#files.keys()].sort()) files[address] = this.#files.get(address) as LedgerRecord
    return { schemaVersion: 1, files }
  }

  async save(files: BuildFiles): Promise<void> {
    await files.writeTextAtomic(this.path, `${JSON.stringify(this.toJSON(), null, 2)}\n`)
  }
}
