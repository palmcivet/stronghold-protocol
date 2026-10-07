// 上游索引只在缺失、损坏或显式刷新时重新下载，写回同一份 JSON 文件。

import { setTimeout as delay } from "node:timers/promises"
import { join } from "node:path"
import type { CatalogFiles } from "#port/catalog-files.js"
import { CatalogReadError } from "#port/catalog-error.js"
import type { CatalogHttp } from "#port/catalog-http.js"
import { mirrorUrl, RAW_BASES } from "./source.js"

export interface CachedJsonRequest {
  readonly cacheFile: string
  readonly url: string
  readonly refresh?: boolean
  readonly offline?: boolean
  readonly log?: (message: string) => void
}

export interface IndexLoadOptions {
  readonly refresh?: boolean
  readonly offline?: boolean
  readonly log?: (message: string) => void
}

export interface LoadedIndexes {
  readonly audioData: unknown
  readonly modelsData: unknown
  readonly charword: unknown
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

interface AttemptOk<T> {
  readonly ok: true
  readonly value: T
}

interface AttemptFail {
  readonly ok: false
  readonly message: string
}

async function attempt<T>(run: () => Promise<T>): Promise<AttemptOk<T> | AttemptFail> {
  try {
    return { ok: true, value: await run() }
  } catch (cause) {
    return { ok: false, message: errorMessage(cause) }
  }
}

export async function cachedJson(files: CatalogFiles, http: CatalogHttp, request: CachedJsonRequest): Promise<unknown> {
  const log = request.log ?? console.log
  const refresh = request.refresh ?? false
  const offline = request.offline ?? false
  if (!refresh || offline) {
    const cached = await attempt(() => files.readText(request.cacheFile))
    if (cached.ok) {
      try {
        return JSON.parse(cached.value) as unknown
      } catch (cause) {
        if (offline) {
          throw new CatalogReadError(
            request.cacheFile,
            `--offline: cached index ${request.cacheFile} is missing or corrupt (${errorMessage(cause)}); run once online`,
          )
        }
      }
    } else if (offline) {
      throw new CatalogReadError(
        request.cacheFile,
        `--offline: cached index ${request.cacheFile} is missing or corrupt (${cached.message}); run once online`,
      )
    }
  }
  let lastError = "unknown error"
  const mirror = mirrorUrl(request.url)
  const sources = mirror ? [request.url, mirror] : [request.url]
  for (const src of sources) {
    for (let attemptNo = 1; attemptNo <= 3; attemptNo++) {
      log(`[cache] downloading ${src}`)
      const downloaded = await attempt(() => http.getText(src, 180000))
      if (!downloaded.ok) {
        lastError = downloaded.message
        await delay(500 * attemptNo)
        continue
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(downloaded.value) as unknown
      } catch (cause) {
        lastError = errorMessage(cause)
        await delay(500 * attemptNo)
        continue
      }
      const written = await attempt(() => files.writeTextAtomic(request.cacheFile, downloaded.value))
      if (!written.ok) {
        lastError = written.message
        await delay(500 * attemptNo)
        continue
      }
      return parsed
    }
  }
  throw new CatalogReadError(request.url, `cannot fetch ${request.url}: ${lastError}`)
}

function indexRequest(cacheFile: string, url: string, options: IndexLoadOptions): CachedJsonRequest {
  const request: { cacheFile: string; url: string; refresh?: boolean; offline?: boolean; log?: (message: string) => void } = { cacheFile, url }
  if (options.refresh !== undefined) request.refresh = options.refresh
  if (options.offline !== undefined) request.offline = options.offline
  if (options.log) request.log = options.log
  return request
}

export async function loadIndexes(
  files: CatalogFiles,
  http: CatalogHttp,
  root: string,
  options: IndexLoadOptions = {},
): Promise<LoadedIndexes> {
  const audioData = await cachedJson(files, http, indexRequest(join(root, ".cache", "gamedata", "excel", "audio_data.json"), RAW_BASES.gamedata + "excel/audio_data.json", options))
  const charword = await cachedJson(files, http, indexRequest(join(root, ".cache", "gamedata", "excel", "charword_table.json"), RAW_BASES.gamedata + "excel/charword_table.json", options))
  const modelsData = await cachedJson(files, http, indexRequest(join(root, ".cache", "ark-models", "models_data.json"), RAW_BASES.arkModels + "models_data.json", options))
  return { audioData, modelsData, charword }
}
