// 一次提取：按来源表逐个来源查找每个需求键，按命中目录追加稀疏检出，校验、转换并写入 files/，最后写出原始目录、账本与报告。
// 某个来源命中但文件不可用（未检出、校验或转换失败）时，记为该来源未命中并继续试下一个来源。

import { createHash } from "node:crypto"
import { join, relative, sep } from "node:path"
import {
  fileAddress,
  formatAssetKey,
  parseAssetKey,
  type AssetFile,
  type AssetKey,
  type FileFormat,
  type FileRole,
  type MissingNeed,
  type Need,
  type RawCatalog,
  type RawEntry,
} from "arknights-assets-catalog"
import type { CacheLayout } from "#catalog/cache-layout.js"
import { buildRawCatalog, serializeRawCatalog } from "#catalog/raw-catalog.js"
import { serializeReport, type ExtractReport, type SourceAttempt } from "#catalog/report.js"
import { asBuffer, formatOfPath, validate } from "#download/format.js"
import { AssetLedger, type LedgerRecord } from "#download/ledger.js"
import { repoLabel, type RepoCache, type RepoWorkspace } from "#download/repo-cache.js"
import { sparseDirectories } from "#download/sparse.js"
import { encodeWoff2 } from "#font/woff2.js"
import type { BuildFiles } from "#port/build-files.js"
import type { AssetSource, SourceContext, SourceHit } from "#source/asset-source.js"
import { routeOf, sourcesFor, SOURCE_TABLE, SPINE_META_NAMESPACE, type SourceRoute } from "#source/table.js"
import { assembleSpine } from "#spine/model.js"

/** Pseudo source ids used in `missing[].tried` when no adapter was asked. */
export const TABLE_SOURCE_ID = "source-table"
export const SPINE_META_SOURCE_ID = "spine-meta"

export interface ExtractOptions {
  readonly needs: readonly Need[]
  readonly layout: CacheLayout
  readonly files: BuildFiles
  readonly repos: RepoCache
  readonly sources: readonly AssetSource[]
  readonly table?: readonly SourceRoute[]
  readonly offline?: boolean
  /** Copy and convert again even when the ledger says the input is unchanged. */
  readonly force?: boolean
  readonly refreshIndex?: boolean
  readonly log?: (message: string) => void
}

export interface ExtractResult {
  readonly catalog: RawCatalog
  readonly report: ExtractReport
  readonly missingRequired: readonly AssetKey[]
}

interface Work {
  readonly key: AssetKey
  required: boolean
  /** Added only because a `json:spine-meta` need depends on it. */
  implicit: boolean
  readonly candidates: readonly AssetSource[]
  readonly tried: SourceAttempt[]
  cursor: number
  resolved: boolean
}

interface Output {
  readonly key: AssetKey
  readonly role: FileRole
  readonly name: string | null
  readonly format: FileFormat
  readonly data: Uint8Array
}

type Materialized = { readonly entries: readonly RawEntry[]; readonly reused: boolean } | { readonly error: string }

function sha256(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex")
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message.split("\n")[0] ?? cause.message : String(cause)
}

function spineMetaKeyOf(spineKey: AssetKey): AssetKey {
  return formatAssetKey("json", `${SPINE_META_NAMESPACE}/${parseAssetKey(spineKey).path}`)
}

function repoPath(repo: RepoWorkspace, location: string): string {
  return relative(repo.root, location).split(sep).join("/")
}

export async function extractAssets(options: ExtractOptions): Promise<ExtractResult> {
  const started = Date.now()
  const { files, layout, repos } = options
  const log = options.log ?? console.log
  const offline = options.offline ?? false
  const table = options.table ?? SOURCE_TABLE
  const sourceMap = new Map(options.sources.map((source) => [source.id, source]))
  const ledger = await AssetLedger.load(files, layout.ledger)

  // MARK: work list
  const work = new Map<AssetKey, Work>()
  const metaNeeds: Need[] = []
  const addWork = (key: AssetKey, required: boolean, implicit: boolean): void => {
    const existing = work.get(key)
    if (existing) {
      existing.required = existing.required || required
      existing.implicit = existing.implicit && implicit
      return
    }
    work.set(key, { key, required, implicit, candidates: sourcesFor(key, sourceMap, table), tried: [], cursor: 0, resolved: false })
  }
  for (const need of options.needs) {
    const { kind, segments } = parseAssetKey(need.key)
    if (kind === "json" && segments[0] === SPINE_META_NAMESPACE && segments.length > 1) {
      metaNeeds.push(need)
      addWork(formatAssetKey("spine", segments.slice(1).join("/")), false, true)
    } else addWork(need.key, need.required, false)
  }

  // MARK: sources
  const prepared = new Map<string, Promise<string | null>>()
  const ambiguous: { key: AssetKey; source: string; candidates: readonly string[] }[] = []
  const problems: { key: AssetKey; source: string; reason: string }[] = []
  const fallbacks: { key: AssetKey; source: string; tried: readonly SourceAttempt[] }[] = []
  let current = ""
  const context: SourceContext = {
    cacheDir: layout.root,
    files,
    repos,
    offline,
    refreshIndex: options.refreshIndex ?? false,
    ambiguous(key, candidates) {
      ambiguous.push({ key, source: current, candidates: [...candidates] })
    },
  }
  const prepare = (source: AssetSource): Promise<string | null> => {
    let pending = prepared.get(source.id)
    if (!pending) {
      pending = source.prepare(context).then(
        () => null,
        (cause: unknown) => {
          log(`[extract] source ${source.id} unavailable: ${errorText(cause)}`)
          return errorText(cause)
        },
      )
      prepared.set(source.id, pending)
    }
    return pending
  }

  // MARK: materialize
  const entries = new Map<AssetKey, RawEntry>()
  let reusedCount = 0
  let writtenCount = 0

  const materialize = async (item: Work, source: AssetSource, hit: SourceHit): Promise<Materialized> => {
    const inputs: { readonly role: FileRole; readonly name: string | null; readonly path: string; readonly convert: string | null; readonly data: Uint8Array }[] = []
    for (const file of hit.files) {
      const path = hit.repo ? repoPath(hit.repo, file.location) : file.location
      if (!(await files.exists(file.location))) return { error: offline ? `${path} is not checked out and --offline forbids fetching it` : `${path} is missing after checkout` }
      inputs.push({ role: file.role, name: file.name, path, convert: file.convert ?? null, data: await files.readBytes(file.location) })
    }
    const inputHash = sha256(
      JSON.stringify({
        source: source.id,
        premultipliedAlpha: hit.premultipliedAlpha ?? null,
        files: inputs.map((input) => [input.role, input.name, input.path, input.convert, sha256(input.data)]),
      }),
    )
    const repo = hit.repo ? repoLabel(hit.repo.ref) : null
    const { kind } = parseAssetKey(item.key)
    const entryOf = (key: AssetKey, assetFiles: readonly AssetFile[]): RawEntry => ({
      key,
      kind: parseAssetKey(key).kind,
      files: assetFiles,
      dependsOn: key === item.key ? hit.dependsOn : [],
      source: { id: source.id, path: hit.path, revision: hit.revision },
    })
    const group = (rows: readonly { readonly key: AssetKey; readonly file: AssetFile }[]): RawEntry[] => {
      const byKey = new Map<AssetKey, AssetFile[]>()
      for (const row of rows) byKey.set(row.key, [...(byKey.get(row.key) ?? []), row.file])
      return [...byKey].map(([key, assetFiles]) => entryOf(key, assetFiles))
    }

    // 账本里的输入哈希相同、输出文件仍在且未被改动时，跳过复制与转换。
    const previous = ledger.recordsFrom(item.key)
    if (!options.force && previous.size > 0 && [...previous.values()].every((record) => record.inputHash === inputHash && record.source === source.id)) {
      let intact = true
      for (const [address, record] of previous) {
        const target = join(layout.files, address)
        if (!(await files.exists(target)) || sha256(await files.readBytes(target)) !== record.hash) {
          intact = false
          break
        }
      }
      if (intact) {
        const refreshed = new Map<string, LedgerRecord>()
        for (const [address, record] of previous) refreshed.set(address, { ...record, repo, revision: hit.revision, path: hit.path })
        ledger.replaceFrom(item.key, refreshed)
        return {
          reused: true,
          entries: group([...previous.values()].map((record) => ({ key: record.key, file: { role: record.role, name: record.name, format: record.format, bytes: record.bytes, hash: record.hash } }))),
        }
      }
    }

    const outputs: Output[] = []
    if (kind === "spine") {
      const skel = inputs.find((input) => input.role === "skel")
      const atlas = inputs.find((input) => input.role === "atlas")
      if (!skel?.name || !atlas) return { error: "a Spine hit needs one skeleton and one atlas" }
      const name = skel.name.replace(/\.skel$/i, "")
      let model
      try {
        model = assembleSpine({
          name,
          skel: skel.data,
          atlas: asBuffer(atlas.data).toString("utf8"),
          pages: new Map(inputs.filter((input) => input.role === "page" && input.name !== null).map((input) => [input.name as string, input.data])),
          premultipliedAlpha: hit.premultipliedAlpha ?? false,
        })
      } catch (cause) {
        return { error: errorText(cause) }
      }
      for (const file of model.files) outputs.push({ key: item.key, role: file.role, name: file.name, format: file.format, data: file.data })
      const meta = model.files.find((file) => file.role === "meta")
      if (meta) outputs.push({ key: spineMetaKeyOf(item.key), role: "main", name: null, format: "json", data: meta.data })
    } else {
      for (const input of inputs) {
        const upstream = formatOfPath(input.path)
        if (!upstream) return { error: `${input.path} has an unsupported file type` }
        if (!validate(upstream, input.data)) return { error: `${input.path} is not a valid ${upstream} file` }
        if (input.convert === "woff2") {
          let encoded: Uint8Array
          try {
            encoded = encodeWoff2(asBuffer(input.data))
          } catch (cause) {
            return { error: `${input.path} WOFF2 conversion failed: ${errorText(cause)}` }
          }
          if (!validate("woff2", encoded)) return { error: `${input.path} WOFF2 conversion produced an invalid file` }
          outputs.push({ key: item.key, role: input.role, name: null, format: "woff2", data: encoded })
        } else outputs.push({ key: item.key, role: input.role, name: null, format: upstream, data: input.data })
      }
    }

    const records = new Map<string, LedgerRecord>()
    const rows: { key: AssetKey; file: AssetFile }[] = []
    for (const output of outputs) {
      const address = fileAddress(output.key, { name: output.name, format: output.format })
      const target = join(layout.files, address)
      const hash = sha256(output.data)
      if (options.force || !(await files.exists(target)) || sha256(await files.readBytes(target)) !== hash) {
        await files.writeBytesAtomic(target, output.data)
        writtenCount += 1
      }
      records.set(address, {
        key: output.key,
        from: item.key,
        role: output.role,
        name: output.name,
        format: output.format,
        source: source.id,
        repo,
        revision: hit.revision,
        path: hit.path,
        inputHash,
        bytes: output.data.byteLength,
        hash,
      })
      rows.push({ key: output.key, file: { role: output.role, name: output.name, format: output.format, bytes: output.data.byteLength, hash } })
    }
    ledger.replaceFrom(item.key, records)
    return { reused: false, entries: group(rows) }
  }

  // MARK: rounds
  let pending = [...work.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  while (pending.length > 0) {
    const round: { item: Work; source: AssetSource; hit: SourceHit }[] = []
    for (const item of pending) {
      while (item.cursor < item.candidates.length) {
        const source = item.candidates[item.cursor] as AssetSource
        const unavailable = await prepare(source)
        if (unavailable !== null) {
          item.tried.push({ source: source.id, reason: `unavailable: ${unavailable}` })
          item.cursor += 1
          continue
        }
        current = source.id
        const before = ambiguous.length
        let hit: SourceHit | null = null
        let failure: string | null = null
        try {
          hit = await source.locate(item.key, context)
        } catch (cause) {
          failure = `lookup failed: ${errorText(cause)}`
        }
        if (hit) {
          round.push({ item, source, hit })
          break
        }
        const found = ambiguous.slice(before).find((row) => row.key === item.key)
        item.tried.push({ source: source.id, reason: failure ?? (found ? `${found.candidates.length} upstream files share this name` : "not found") })
        item.cursor += 1
      }
    }

    const byRepo = new Map<RepoWorkspace, string[]>()
    for (const { hit } of round) {
      if (!hit.repo) continue
      const list = byRepo.get(hit.repo) ?? []
      for (const file of hit.files) list.push(repoPath(hit.repo, file.location))
      byRepo.set(hit.repo, list)
    }
    const checkoutFailures = new Map<RepoWorkspace, string>()
    for (const [repo, paths] of byRepo) {
      try {
        await repo.checkout(sparseDirectories(paths))
      } catch (cause) {
        checkoutFailures.set(repo, errorText(cause))
      }
    }

    for (const { item, source, hit } of round) {
      const checkoutFailure = hit.repo ? checkoutFailures.get(hit.repo) : undefined
      const result: Materialized = checkoutFailure ? { error: `checkout failed: ${checkoutFailure}` } : await materialize(item, source, hit)
      if ("error" in result) {
        problems.push({ key: item.key, source: source.id, reason: result.error })
        item.tried.push({ source: source.id, reason: result.error })
        item.cursor += 1
        continue
      }
      for (const entry of result.entries) entries.set(entry.key, entry)
      if (result.reused) reusedCount += 1
      item.resolved = true
      if (item.tried.length > 0) fallbacks.push({ key: item.key, source: source.id, tried: [...item.tried] })
    }
    pending = pending.filter((item) => !item.resolved && item.cursor < item.candidates.length)
  }

  // MARK: catalog
  const missing: MissingNeed[] = []
  for (const item of work.values()) {
    if (item.resolved || item.implicit) continue
    const tried = [...item.tried]
    if (item.candidates.length === 0) {
      tried.push({ source: TABLE_SOURCE_ID, reason: routeOf(item.key, table) ? "no source provides this namespace" : "namespace is not registered in the source table" })
    }
    missing.push({ key: item.key, required: item.required, tried })
  }
  for (const need of metaNeeds) {
    if (entries.has(need.key)) continue
    const spineKey = formatAssetKey("spine", parseAssetKey(need.key).segments.slice(1).join("/"))
    missing.push({ key: need.key, required: need.required, tried: [{ source: SPINE_META_SOURCE_ID, reason: `${spineKey} is missing` }] })
  }
  const catalog = buildRawCatalog(entries.values(), missing)
  const missingRequired = catalog.missing.filter((need) => need.required).map((need) => need.key)
  const absentReason = new Map(options.needs.flatMap((need) => (need.absent === undefined ? [] : [[need.key, need.absent] as const])))
  const missingOptional = catalog.missing.filter((need) => !need.required).map((need) => need.key)
  const report: ExtractReport = {
    schemaVersion: 1,
    needs: {
      total: options.needs.length,
      resolved: options.needs.filter((need) => entries.has(need.key)).length,
      missingRequired,
      missingOptional,
      absentUpstream: missingOptional.flatMap((key) => {
        const reason = absentReason.get(key)
        return reason === undefined ? [] : [{ key, reason }]
      }),
      unexplained: missingOptional.filter((key) => !absentReason.has(key)),
    },
    fallbacks: fallbacks.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
    ambiguous: ambiguous.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
    problems: problems.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
    repos: await repos.stats(),
    reused: reusedCount,
    written: writtenCount,
    elapsedMs: Date.now() - started,
  }
  await files.writeTextAtomic(layout.catalog, serializeRawCatalog(catalog))
  await ledger.save(files)
  await files.writeTextAtomic(layout.report, serializeReport(report))
  log(`[extract] ${report.needs.resolved}/${report.needs.total} needs resolved, ${missingRequired.length} required missing, ${writtenCount} files written, ${reusedCount} entries reused`)
  return { catalog, report, missingRequired }
}
