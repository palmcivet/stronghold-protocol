// 有界并发下载。每个文件先写到临时路径再改名，半截内容不会留在最终路径上。
// 404/410 立刻换下一个地址；网络错误、403/429/5xx 和校验失败按指数退避重试。
// 账本在 .cache/assets-ledger.json，只记录 url 和字节数。

import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { mirrorUrl } from "./source.js"
import { validate, type AssetKind } from "./format.js"

export interface DownloadJob {
  rel: string
  readonly urls: readonly string[]
  readonly kind: AssetKind
  readonly bytes?: number
  readonly mutable?: boolean
}

export type JobStatus = "ok" | "skip" | "miss" | "error"

export interface JobResult {
  readonly status: JobStatus
  readonly bytes: number
  readonly url?: string
  readonly error?: string
  readonly sizeChanged?: boolean
}

export interface LedgerFile {
  readonly url: string
  readonly bytes: number
}

export interface AssetLedger {
  files: Record<string, LedgerFile | undefined>
}

export interface DownloadTotals {
  ok: number
  skip: number
  miss: number
  error: number
  bytesDownloaded: number
  sizeChanged: number
}

export interface DownloaderOptions {
  readonly root: string
  readonly ledgerPath: string
  readonly concurrency?: number
  readonly retries?: number
  readonly timeoutMs?: number
  readonly force?: boolean
  readonly log?: (message: string) => void
  readonly fetchImpl?: typeof fetch
  readonly backoffMs?: number
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

class HttpError extends Error {
  readonly status: number
  constructor(status: number, url: string) {
    super(`HTTP ${status} ${url}`)
    this.status = status
  }
}

function formatMegabytes(n: number): string {
  return (n / 1048576).toFixed(1) + " MB"
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

type FetchOutcome = { readonly buf: Buffer } | { readonly notFound: true } | { readonly error: string }

export class Downloader {
  readonly root: string
  readonly ledgerPath: string
  readonly concurrency: number
  readonly retries: number
  readonly timeoutMs: number
  readonly force: boolean
  readonly log: (message: string) => void
  readonly fetchImpl: typeof fetch
  readonly backoffMs: number
  ledger: AssetLedger
  readonly totals: DownloadTotals
  dirty: number
  saving: boolean

  constructor(options: DownloaderOptions) {
    this.root = options.root
    this.ledgerPath = options.ledgerPath
    this.concurrency = Math.max(1, Math.min(64, Number(options.concurrency) || 16))
    this.retries = Math.max(1, Number(options.retries) || 3)
    this.timeoutMs = options.timeoutMs ?? 120000
    this.force = options.force ?? false
    this.log = options.log ?? console.log
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.backoffMs = Math.max(0, Number(options.backoffMs ?? 400) || 0)
    this.ledger = { files: {} }
    this.totals = { ok: 0, skip: 0, miss: 0, error: 0, bytesDownloaded: 0, sizeChanged: 0 }
    this.dirty = 0
    this.saving = false
  }

  async loadLedger(): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.ledgerPath, "utf8"))
      if (parsed && typeof parsed === "object" && "files" in parsed && parsed.files && typeof parsed.files === "object") {
        this.ledger = parsed as AssetLedger
      }
    } catch {
      // 第一次运行没有账本。
    }
  }

  async saveLedger(): Promise<void> {
    await mkdir(dirname(this.ledgerPath), { recursive: true })
    const temporary = this.ledgerPath + ".tmp"
    await writeFile(temporary, JSON.stringify(this.ledger))
    await rename(temporary, this.ledgerPath)
    this.dirty = 0
  }

  async existingSize(job: DownloadJob): Promise<number> {
    if (this.force) return -1
    const absolute = join(this.root, job.rel)
    let info: Awaited<ReturnType<typeof stat>>
    try {
      info = await stat(absolute)
    } catch {
      return -1
    }
    if (!info.isFile() || info.size <= 0) return -1
    const recorded = this.ledger.files[job.rel]
    if (job.mutable) {
      try {
        return validate(job.kind, await readFile(absolute)) ? info.size : -1
      } catch {
        return -1
      }
    }
    if (recorded && recorded.bytes === info.size) return info.size
    if (job.bytes && job.bytes === info.size) return info.size
    if (recorded && recorded.bytes !== info.size) return -1
    try {
      return validate(job.kind, await readFile(absolute)) ? info.size : -1
    } catch {
      return -1
    }
  }

  async fetchWithRetries(url: string, kind: AssetKind): Promise<FetchOutcome> {
    let lastError = "unknown error"
    for (let attempt = 1; attempt <= this.retries; attempt++) {
      try {
        const response = await this.fetchImpl(url, {
          headers: { "user-agent": "stronghold-protocol-fetch-assets/1.0" },
          signal: AbortSignal.timeout(this.timeoutMs),
          redirect: "follow",
        })
        if (response.status === 404 || response.status === 410) {
          try {
            await response.body?.cancel()
          } catch {
            // 丢掉未读的响应体。
          }
          return { notFound: true }
        }
        if (!response.ok) {
          try {
            await response.body?.cancel()
          } catch {
            // 丢掉未读的响应体。
          }
          throw new HttpError(response.status, url)
        }
        const buf = Buffer.from(await response.arrayBuffer())
        const length = Number(response.headers.get("content-length"))
        const encoding = response.headers.get("content-encoding")
        if (!encoding && Number.isFinite(length) && length > 0 && length !== buf.length) {
          throw new Error(`truncated body ${buf.length}/${length} ${url}`)
        }
        if (!validate(kind, buf)) throw new Error(`invalid ${kind} payload (${buf.length} B) ${url}`)
        return { buf }
      } catch (cause) {
        lastError = errorMessage(cause)
        if (attempt < this.retries && this.backoffMs) {
          await sleep(this.backoffMs * 2 ** (attempt - 1) + Math.floor(Math.random() * this.backoffMs))
        }
      }
    }
    return { error: lastError }
  }

  async runJob(job: DownloadJob): Promise<JobResult> {
    const kept = await this.existingSize(job)
    if (kept >= 0) return { status: "skip", bytes: kept }
    let lastError: string | null = null
    for (const url of job.urls) {
      const mirror = mirrorUrl(url)
      const sources = mirror ? [url, mirror] : [url]
      for (const src of sources) {
        const fetched = await this.fetchWithRetries(src, job.kind)
        if ("notFound" in fetched) continue
        if ("error" in fetched) {
          lastError = fetched.error
          continue
        }
        const absolute = join(this.root, job.rel)
        await mkdir(dirname(absolute), { recursive: true })
        const temporary = `${absolute}.part${process.pid}`
        try {
          await writeFile(temporary, fetched.buf)
          await rename(temporary, absolute)
        } catch (cause) {
          try {
            await unlink(temporary)
          } catch {
            // 临时文件可能已经不在。
          }
          return { status: "error", bytes: 0, error: `write failed: ${errorMessage(cause)}` }
        }
        this.ledger.files[job.rel] = { url: src, bytes: fetched.buf.length }
        this.dirty++
        const sizeChanged = !!(job.bytes && job.bytes !== fetched.buf.length && !job.mutable)
        return { status: "ok", bytes: fetched.buf.length, url: src, sizeChanged }
      }
    }
    return lastError
      ? { status: "error", bytes: 0, error: lastError }
      : { status: "miss", bytes: 0, error: "not found (404) on all sources" }
  }

  async run(jobs: readonly DownloadJob[], label = "download"): Promise<Map<string, JobResult>> {
    const unique: DownloadJob[] = []
    const seen = new Set<string>()
    for (const job of jobs) {
      if (seen.has(job.rel)) continue
      seen.add(job.rel)
      unique.push(job)
    }
    const results = new Map<string, JobResult>()
    const started = Date.now()
    let done = 0
    let bytes = 0
    let lastLog = 0
    const counts: Record<JobStatus, number> = { ok: 0, skip: 0, miss: 0, error: 0 }
    const progress = (force: boolean): void => {
      const now = Date.now()
      if (!force && now - lastLog < 2000) return
      lastLog = now
      const seconds = Math.max(0.001, (now - started) / 1000)
      this.log(
        `[${label}] ${done}/${unique.length} ok=${counts.ok} skip=${counts.skip} miss=${counts.miss} err=${counts.error} ` +
          `${formatMegabytes(bytes)} ${(bytes / 1048576 / seconds).toFixed(2)} MB/s`,
      )
    }
    let next = 0
    const worker = async (): Promise<void> => {
      while (next < unique.length) {
        const job = unique[next]
        next += 1
        if (!job) continue
        let result: JobResult
        try {
          result = await this.runJob(job)
        } catch (cause) {
          result = { status: "error", bytes: 0, error: errorMessage(cause) }
        }
        results.set(job.rel, result)
        counts[result.status] += 1
        this.totals[result.status] += 1
        if (result.status === "ok") {
          bytes += result.bytes
          this.totals.bytesDownloaded += result.bytes
        }
        if (result.sizeChanged) this.totals.sizeChanged++
        done++
        if (this.dirty >= 200 && !this.saving) {
          this.saving = true
          try {
            await this.saveLedger()
          } catch {
            // 结束时还会再写一次。
          } finally {
            this.saving = false
          }
        }
        progress(false)
      }
    }
    await Promise.all(Array.from({ length: Math.min(this.concurrency, unique.length) }, () => worker()))
    if (unique.length) progress(true)
    await this.saveLedger()
    return results
  }
}
