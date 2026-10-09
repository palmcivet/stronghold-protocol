// 组装一个 Spine 模型：骨架原样保留，图集补 size（按真实页图）与 pma，页名换成安全名，再解析骨架写出 SpineMeta 侧车。

import type { FileFormat, FileRole, SpineMeta } from "arknights-assets-catalog"
import { isCompletePng, isSkelBinary, pngSize } from "#download/format.js"
import { safeName } from "#source/name.js"
import { atlasInfo, normalizeAtlas, parseAtlas } from "#spine/atlas.js"
import { parseSkel } from "#spine/skel.js"

export interface SpineInput {
  /** Base name for the skeleton, atlas and sidecar files. */
  readonly name: string
  readonly skel: Uint8Array
  readonly atlas: string
  /** Page images by their upstream file name. */
  readonly pages: ReadonlyMap<string, Uint8Array>
  readonly premultipliedAlpha: boolean
}

export interface SpineOutputFile {
  readonly role: FileRole
  readonly name: string
  readonly format: FileFormat
  readonly data: Uint8Array
}

export interface SpineModel {
  /** Skeleton, atlas, pages sorted by name, then the sidecar. */
  readonly files: readonly SpineOutputFile[]
  readonly meta: SpineMeta
}

export class SpineAssemblyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SpineAssemblyError"
  }
}

function sortObject<T>(value: Readonly<Record<string, T>>): Record<string, T> {
  const out: Record<string, T> = {}
  for (const key of Object.keys(value).sort()) out[key] = value[key] as T
  return out
}

/** The sidecar as stable JSON text. */
export function spineMetaText(meta: SpineMeta): string {
  return `${JSON.stringify({ ...meta, animations: sortObject(meta.animations) }, null, 2)}\n`
}

export function assembleSpine(input: SpineInput): SpineModel {
  if (!isSkelBinary(input.skel)) throw new SpineAssemblyError(`${input.name}.skel is not a Spine binary`)
  const upstreamPages = parseAtlas(input.atlas).pages.map((page) => page.name)
  if (upstreamPages.length === 0) throw new SpineAssemblyError(`${input.name}.atlas has no pages`)
  const pageFiles = new Map<string, Uint8Array>()
  for (const page of upstreamPages) {
    const data = input.pages.get(page)
    if (!data) throw new SpineAssemblyError(`${input.name}.atlas page ${page} is not in the source folder`)
    if (!isCompletePng(data)) throw new SpineAssemblyError(`${input.name}.atlas page ${page} is not a complete PNG`)
    pageFiles.set(safeName(page), data)
  }
  const normalized = normalizeAtlas(input.atlas, {
    pageSize: (page) => pngSize(input.pages.get(page)),
    pma: input.premultipliedAlpha,
    renamePage: safeName,
  })
  const info = atlasInfo(normalized.text)
  let facts
  try {
    facts = parseSkel(input.skel, info.regions)
  } catch (cause) {
    throw new SpineAssemblyError(`${input.name}.skel parse failed: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  const meta: SpineMeta = {
    spineVersion: facts.version || "unknown",
    premultipliedAlpha: info.hasPma,
    bounds: facts.bounds,
    animations: facts.animations,
    pages: [...info.pages],
    missingRegions: facts.missingRegions,
  }
  const encoder = new TextEncoder()
  return {
    files: [
      { role: "skel", name: `${input.name}.skel`, format: "skel", data: input.skel },
      { role: "atlas", name: `${input.name}.atlas`, format: "atlas", data: encoder.encode(normalized.text) },
      ...[...pageFiles.keys()].sort().map((name): SpineOutputFile => ({ role: "page", name, format: "png", data: pageFiles.get(name) as Uint8Array })),
      { role: "meta", name: `${input.name}.meta.json`, format: "json", data: encoder.encode(spineMetaText(meta)) },
    ],
    meta,
  }
}
