// 下载 skel / atlas / 页图，补 size 和 pma，再解析动画角色。
// 本地客户端才有的敌人模型把元数据写在 local-enemy-spines.json，清单用 spineLocal 引用它。

import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { Stats } from "node:fs"
import { atlasInfo, normalizeAtlas } from "./atlas.js"
import { resolveRoles, type AnimRoles } from "./anim-role.js"
import type { DownloadJob, Downloader } from "#compiler/download/downloader.js"
import { kindOf, pngSize } from "#compiler/download/format.js"
import { assetUrl, safeName, urlDir } from "#compiler/download/source.js"
import { parseSkel, type SkelInfo, type SpineBounds } from "./skel.js"

export const localEnemySpineDir: string = "local/spine/enemy/"

export function localEnemySpineGroup(id: string): string {
  return `spine/enemy/${id}`
}

export interface LocalEnemyModel {
  readonly dir: string
  readonly skel: string
  readonly atlas: string
  readonly pngs: readonly string[]
}

export interface LocalSpineMeta {
  readonly skel: string
  readonly atlas: string
  readonly textures: readonly string[]
  readonly pma: boolean
  readonly anims: AnimRoles
  readonly animations: Readonly<Record<string, number>>
  readonly events: readonly string[]
  readonly hits: Readonly<Record<string, readonly number[]>>
  readonly bounds: SpineBounds | null
}

export interface SpineEntry {
  readonly skel: string
  readonly atlas: string
  readonly textures: readonly string[]
  readonly pma: boolean
  readonly anims: AnimRoles
  readonly animations: Readonly<Record<string, number>>
  readonly events: readonly string[]
  readonly hits: Readonly<Record<string, readonly number[]>>
  readonly bounds: SpineBounds | null
}

export interface PlannedSpineModel {
  readonly key: string
  readonly kind: string
  readonly dir: string
  readonly pma: boolean
  readonly skillIndices: readonly number[]
  readonly baseUrl: string
  readonly skel: DownloadJob
  readonly atlas: DownloadJob
  pngs: DownloadJob[]
}

async function fileStat(path: string): Promise<Stats | null> {
  try {
    const info = await stat(path)
    return info.isFile() ? info : null
  } catch {
    return null
  }
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export async function findLocalEnemyModels(root: string): Promise<Record<string, LocalEnemyModel>> {
  const out: Record<string, LocalEnemyModel> = {}
  let ids: string[] = []
  try {
    ids = (await readdir(join(root, localEnemySpineDir), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return out
  }
  for (const id of ids.sort()) {
    if (!/^enemy_\d+_[a-z0-9_]+$/i.test(id)) continue
    const dir = `${localEnemySpineDir}${id}/`
    let files: string[] = []
    try {
      files = (await readdir(join(root, dir))).sort()
    } catch {
      continue
    }
    const skel = files.find((file) => file.endsWith(".skel"))
    const stem = skel ? skel.slice(0, -".skel".length) : null
    const pngs = files.filter((file) => file.endsWith(".png"))
    if (!stem || !files.includes(`${stem}.atlas`) || !pngs.length) continue
    out[id] = { dir, skel: dir + skel, atlas: `${dir}${stem}.atlas`, pngs: pngs.map((file) => dir + file) }
  }
  return out
}

export async function localEnemySpineMeta(
  root: string,
  found: Readonly<Record<string, LocalEnemyModel>>,
): Promise<{ readonly meta: Record<string, LocalSpineMeta>; readonly problems: readonly string[] }> {
  const meta: Record<string, LocalSpineMeta> = {}
  const problems: string[] = []
  const base = (rel: string): string => rel.slice(rel.lastIndexOf("/") + 1)
  for (const id of Object.keys(found).sort()) {
    const model = found[id]
    if (!model) continue
    try {
      const text = await readFile(join(root, model.atlas), "utf8")
      const sizes = new Map<string, { width: number; height: number }>()
      for (const page of atlasInfo(text).pages) {
        const size = pngSize(await readFile(join(root, model.dir + page)))
        if (!size) throw new Error(`invalid page ${page}`)
        sizes.set(page, size)
      }
      const normalized = normalizeAtlas(text, { pageSize: (page) => sizes.get(page) ?? null, pma: true })
      if (normalized.missingSize.length) throw new Error(`cannot size pages ${normalized.missingSize.join(",")}`)
      const info = atlasInfo(normalized.text)
      if (!info.pages.length) throw new Error("atlas without pages")
      const skel = parseSkel(await readFile(join(root, model.skel)), info.regions)
      if (!skel.animations.length) throw new Error("skeleton has no animations")
      const missing = skel.missingRegions[0]
      if (skel.missingRegions.length && missing) problems.push(`${id}: ${skel.missingRegions.length} attachment(s) not in atlas (e.g. ${missing})`)
      meta[id] = {
        skel: base(model.skel),
        atlas: base(model.atlas),
        textures: [...info.pages],
        pma: true,
        anims: resolveRoles(skel.animations, { skillIndices: [0], durations: skel.durations }),
        animations: skel.durations,
        events: skel.events,
        hits: skel.hits,
        bounds: skel.bounds,
      }
    } catch (cause) {
      problems.push(`${id}: ${errorMessage(cause)}`)
    }
  }
  return { meta, problems }
}

export const localEnemySpinesFile: string = "input/spine/local-enemy-spines.json"

export async function loadLocalEnemySpines(path: string): Promise<Record<string, LocalSpineMeta>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"))
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const models = (parsed as { models?: unknown }).models
    if (!models || typeof models !== "object" || Array.isArray(models)) return {}
    return models as Record<string, LocalSpineMeta>
  } catch {
    return {}
  }
}

export interface ProcessModelsOptions {
  readonly root: string
  readonly dl: Downloader
  readonly cachePath: string
  readonly download?: boolean
  readonly log?: (message: string) => void
}

export interface ProcessModelsResult {
  readonly entries: Map<string, SpineEntry>
  readonly problems: readonly string[]
}

interface SpineCacheEntry {
  readonly key: string
  readonly info: SkelInfo
}

export async function processModels(
  models: ReadonlyMap<string, PlannedSpineModel>,
  options: ProcessModelsOptions,
): Promise<ProcessModelsResult> {
  const problems: string[] = []
  const list = [...models.values()]
  const download = options.download ?? true
  const log = options.log ?? console.log
  const { root, dl, cachePath } = options
  if (download) {
    const jobs: DownloadJob[] = []
    for (const model of list) jobs.push(model.skel, model.atlas, ...model.pngs)
    await dl.run(jobs, "spine")
    const extra: DownloadJob[] = []
    for (const model of list) {
      const text = await readFile(join(root, model.atlas.rel), "utf8").catch(() => null)
      if (!text) continue
      for (const page of atlasInfo(text).pages) {
        const rel = model.dir + safeName(page)
        if (model.pngs.some((png) => png.rel === rel)) continue
        const recorded = dl.ledger.files[model.atlas.rel]?.url
        const dirs = [...new Set([recorded ? urlDir(recorded) : null, model.baseUrl, ...model.atlas.urls.map(urlDir)].filter((dir): dir is string => !!dir))]
        const job: DownloadJob = { rel, urls: dirs.map((dir) => dir + encodeURIComponent(page)), kind: kindOf(page) }
        model.pngs.push(job)
        extra.push(job)
      }
    }
    if (extra.length) await dl.run(extra, "spine pages")
  }

  let cache: Record<string, SpineCacheEntry | undefined> = {}
  try {
    const parsed: unknown = JSON.parse(await readFile(cachePath, "utf8"))
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) cache = parsed as Record<string, SpineCacheEntry | undefined>
  } catch {
    cache = {}
  }
  const nextCache: Record<string, SpineCacheEntry> = {}
  const entries = new Map<string, SpineEntry>()
  let parsedCount = 0
  let cachedCount = 0
  let ledgerDirty = false
  const started = Date.now()
  for (const model of list) {
    const skelAbs = join(root, model.skel.rel)
    const atlasAbs = join(root, model.atlas.rel)
    const skelStat = await fileStat(skelAbs)
    const atlasText = await readFile(atlasAbs, "utf8").catch(() => null)
    if (!skelStat || !atlasText) {
      problems.push(`${model.key}: missing ${!skelStat ? "skel" : "atlas"}`)
      continue
    }
    const info0 = atlasInfo(atlasText)
    const sizes = new Map<string, { width: number; height: number }>()
    let pagesOk = info0.pages.length > 0
    for (const page of info0.pages) {
      const buf = await readFile(join(root, model.dir + safeName(page))).catch(() => null)
      const size = buf ? pngSize(buf) : null
      if (!size) {
        pagesOk = false
        problems.push(`${model.key}: missing/invalid page ${page}`)
        continue
      }
      sizes.set(page, size)
    }
    if (!pagesOk) continue
    const normalized = normalizeAtlas(atlasText, {
      pageSize: (page) => sizes.get(page) ?? null,
      pma: !!model.pma,
      renamePage: (page) => safeName(page),
    })
    if (normalized.missingSize.length) {
      problems.push(`${model.key}: cannot size pages ${normalized.missingSize.join(",")}`)
      continue
    }
    if (normalized.changed) {
      await writeFile(atlasAbs + ".tmp", normalized.text)
      await rename(atlasAbs + ".tmp", atlasAbs)
    }
    const atlasStat = await fileStat(atlasAbs)
    const info = atlasInfo(normalized.text)
    const cacheKey = `${model.skel.rel}|${skelStat.size}|${Math.floor(skelStat.mtimeMs)}|${atlasStat?.size}|${Math.floor(atlasStat?.mtimeMs ?? 0)}`
    const cachedEntry = cache[model.skel.rel]
    let skel: SkelInfo | null = cachedEntry?.key === cacheKey && cachedEntry.info ? cachedEntry.info : null
    if (skel) cachedCount++
    else {
      try {
        skel = parseSkel(await readFile(skelAbs), info.regions)
        parsedCount++
      } catch (cause) {
        problems.push(`${model.key}: skel parse failed (${errorMessage(cause)}); deleted, re-run to re-download`)
        try {
          await unlink(skelAbs)
        } catch {
          // 文件可能已经不在。
        }
        delete dl.ledger.files[model.skel.rel]
        ledgerDirty = true
        continue
      }
    }
    nextCache[model.skel.rel] = { key: cacheKey, info: skel }
    const sample = skel.missingRegions[0]
    if (skel.missingRegions.length && sample) problems.push(`${model.key}: ${skel.missingRegions.length} attachment(s) not in atlas (e.g. ${sample})`)
    if (!skel.animations.length) {
      problems.push(`${model.key}: skeleton has no animations`)
      continue
    }
    entries.set(model.key, {
      skel: assetUrl(model.skel.rel),
      atlas: assetUrl(model.atlas.rel),
      textures: info.pages.map((page) => assetUrl(model.dir + page)),
      pma: !!model.pma,
      anims: resolveRoles(skel.animations, { skillIndices: model.skillIndices, durations: skel.durations }),
      animations: skel.durations,
      events: skel.events,
      hits: skel.hits,
      bounds: skel.bounds,
    })
    if (Date.now() - started > 0 && (parsedCount + cachedCount) % 100 === 0) log(`[spine] processed ${parsedCount + cachedCount}/${list.length}`)
  }
  await mkdir(dirname(cachePath), { recursive: true })
  await writeFile(cachePath, JSON.stringify(nextCache))
  if (ledgerDirty) {
    try {
      await dl.saveLedger()
    } catch {
      // 下次运行会按文件内容重新校验。
    }
  }
  log(`[spine] models ok=${entries.size}/${list.length} (parsed ${parsedCount}, cached ${cachedCount})`)
  return { entries, problems }
}
