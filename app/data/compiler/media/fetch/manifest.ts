// 计划模板落到磁盘上实际存在的文件，组装成 media manifest。
// 叶子是 { alts }，模型引用是 { model }，literal 原样写入、背后没有文件。

import { createHash } from "node:crypto"
import { existsSync, statSync } from "node:fs"
import { join } from "node:path"
import { assetUrl, mirrorUrl, type DownloadJob, type Downloader } from "arknights-assets-catalog/compile"

export const manifestVersion: number = 1

export const literalKey: unique symbol = Symbol("assets-catalog.media.literal")

export interface LiteralNode {
  readonly [literalKey]: unknown
}

export interface ManifestLeaf {
  readonly alts: readonly DownloadJob[]
}

export interface ModelRef {
  readonly model: string
}

export interface TemplateLeaf {
  readonly path: string
  readonly leaf: ManifestLeaf
}

export interface ResolvedTemplate {
  readonly value: Record<string, unknown>
  readonly misses: readonly string[]
  readonly fallbacks: readonly string[]
  readonly files: ReadonlySet<string>
}

const isLeaf = (node: unknown): node is ManifestLeaf => {
  if (!node || typeof node !== "object" || !("alts" in node)) return false
  return Array.isArray(node.alts)
}

const isModelRef = (node: unknown): node is ModelRef => {
  if (!node || typeof node !== "object" || Array.isArray(node)) return false
  return typeof (node as { model?: unknown }).model === "string" && Object.keys(node).length === 1
}

export function isLiteral(node: unknown): node is LiteralNode {
  return !!node && typeof node === "object" && Object.hasOwn(node, literalKey)
}

export function literal(value: unknown): LiteralNode {
  return { [literalKey]: JSON.parse(JSON.stringify(value)) as unknown }
}

export function collectLeaves(node: unknown, path = "", out: TemplateLeaf[] = []): TemplateLeaf[] {
  if (isLeaf(node)) {
    out.push({ path, leaf: node })
    return out
  }
  if (isModelRef(node) || isLiteral(node) || !node || typeof node !== "object") return out
  for (const [key, value] of Object.entries(node)) collectLeaves(value, path ? `${path}.${key}` : key, out)
  return out
}

export async function downloadLeaves(
  leaves: readonly TemplateLeaf[],
  downloader: Downloader,
  root: string,
  label = "files",
): Promise<string[]> {
  const tried = new Map<TemplateLeaf, number>(leaves.map((leaf) => [leaf, 0]))
  const blocked = new Set<TemplateLeaf>()
  const satisfied = (leaf: TemplateLeaf): boolean => {
    const count = tried.get(leaf) ?? 0
    return leaf.leaf.alts.slice(0, count).some((alt) => existsSync(join(root, alt.rel)))
  }
  let last = new Map<string, { readonly status?: string }>()
  for (let round = 0; round < 8; round++) {
    const jobs: DownloadJob[] = []
    for (const leaf of leaves) {
      const count = tried.get(leaf) ?? 0
      if (blocked.has(leaf)) continue
      if (count > 0 && satisfied(leaf)) continue
      const previous = leaf.leaf.alts[count - 1]
      if (count > 0 && previous && last.get(previous.rel)?.status === "error") {
        blocked.add(leaf)
        continue
      }
      if (count >= leaf.leaf.alts.length) continue
      const job = leaf.leaf.alts[count]
      if (!job) continue
      jobs.push(job)
      tried.set(leaf, count + 1)
    }
    if (!jobs.length) break
    last = await downloader.run(jobs, round === 0 ? label : `${label} fallback#${round}`)
  }
  return [...blocked].map((leaf) => leaf.path)
}

export function resolveTemplate(
  template: unknown,
  options: {
    readonly root: string
    readonly spine: ReadonlyMap<string, { readonly skel: string; readonly atlas: string; readonly textures: readonly string[] }>
    readonly sourceOf?: (rel: string) => string | undefined
  },
): ResolvedTemplate {
  const misses: string[] = []
  const fallbacks: string[] = []
  const files = new Set<string>()
  const sourceOf = options.sourceOf ?? ((): undefined => undefined)
  const isContainer = (value: unknown): boolean => !!value && typeof value === "object" && !isLeaf(value) && !isModelRef(value) && !isLiteral(value)
  const walk = (node: unknown, path: string): unknown => {
    if (node === null || node === undefined) return undefined
    if (isLiteral(node)) return JSON.parse(JSON.stringify(node[literalKey])) as unknown
    if (isLeaf(node)) {
      for (let i = 0; i < node.alts.length; i++) {
        const alt = node.alts[i]
        if (!alt) continue
        if (!existsSync(join(options.root, alt.rel))) continue
        const src = sourceOf(alt.rel)
        const primary = (node.alts[0]?.urls ?? []).flatMap((url) => {
          const mirror = mirrorUrl(url)
          return mirror ? [url, mirror] : [url]
        })
        if (i > 0) fallbacks.push(`${path} ← ${src || alt.urls[0]}`)
        else if (src && !primary.includes(src)) fallbacks.push(`${path} ← ${src}`)
        files.add(alt.rel)
        return assetUrl(alt.rel)
      }
      misses.push(path)
      return undefined
    }
    if (isModelRef(node)) {
      const entry = options.spine.get(node.model)
      if (!entry) {
        misses.push(`${path} (spine ${node.model})`)
        return undefined
      }
      for (const url of [entry.skel, entry.atlas, ...entry.textures]) files.add(url.replace(/^\/assets\//, ""))
      return entry
    }
    if (Array.isArray(node)) return node.map((item, index) => walk(item, `${path}[${index}]`)).filter((item) => item !== undefined)
    if (typeof node !== "object") return node
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node)) {
      const resolved = walk(value, path ? `${path}.${key}` : key)
      if (resolved === undefined) continue
      if (resolved && typeof resolved === "object" && !Array.isArray(resolved) && !Object.keys(resolved).length && isContainer(value)) continue
      out[key] = resolved
    }
    return out
  }
  const value = walk(template, "")
  return {
    value: value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {},
    misses,
    fallbacks,
    files,
  }
}

export function totalBytes(root: string, rels: Iterable<string>): number {
  let total = 0
  for (const rel of rels) {
    try {
      total += statSync(join(root, rel)).size
    } catch {
      // 文件不在磁盘上就不计入。
    }
  }
  return total
}

export function contentHash(value: unknown): string {
  return createHash("sha1").update(JSON.stringify(value)).digest("hex").slice(0, 12)
}

const buildFields: ReadonlySet<string> = new Set(["version", "hash", "generator", "stats"])

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

export function droppedEntries(prev: unknown, next: unknown): string[] {
  const out: string[] = []
  const leaves = (value: unknown, path: string): void => {
    if (!isObject(value)) {
      out.push(path)
      return
    }
    for (const [key, item] of Object.entries(value)) leaves(item, `${path}.${key}`)
  }
  const walk = (previous: unknown, current: unknown, path: string): void => {
    if (current === undefined) {
      leaves(previous, path)
      return
    }
    if (!isObject(previous) || !isObject(current)) return
    for (const [key, value] of Object.entries(previous)) {
      walk(value, Object.hasOwn(current, key) ? current[key] : undefined, `${path}.${key}`)
    }
  }
  if (!isObject(prev)) return out
  const incoming = isObject(next) ? next : {}
  for (const [key, value] of Object.entries(prev)) {
    if (!buildFields.has(key)) walk(value, Object.hasOwn(incoming, key) ? incoming[key] : undefined, key)
  }
  return out.sort()
}
