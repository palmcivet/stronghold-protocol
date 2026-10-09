import { FILE_FORMATS, type FileFormat, type FileRole, type PackFile } from "arknights-assets-catalog"
import type { JsonRecord } from "#data/asset/rules.js"

/** A file of an upstream entry, addressed by its master path such as `/assets/char/avatar/char_002_amiya.png`. */
export interface UpstreamFile {
  readonly role: FileRole
  readonly name: string | null
  readonly format: FileFormat
  readonly address: string
}

export type SpineFilesResult = { readonly files: readonly UpstreamFile[] } | { readonly reason: string }

const MASTER_AUDIO_PREFIX = "/assets/audio/"

/** Extension of an address when it is a file format of the catalog. */
export function fileFormatOf(address: string): FileFormat | null {
  const dot = address.lastIndexOf(".")
  const extension = dot < 0 ? "" : address.slice(dot + 1)
  return (FILE_FORMATS as readonly string[]).includes(extension) ? (extension as FileFormat) : null
}

function baseNameOf(address: string): string {
  return address.slice(address.lastIndexOf("/") + 1)
}

function spineFile(role: FileRole, address: string, format: FileFormat): UpstreamFile {
  return { role, name: baseNameOf(address), format, address }
}

/**
 * Files of one Spine record: skeleton, atlas and texture pages. A page keeps its file name, since the atlas refers to pages by name.
 * The master record also lists animations and bounds; they are not files and are not read.
 */
export function spineFiles(record: JsonRecord): SpineFilesResult {
  const skel = record["skel"]
  const atlas = record["atlas"]
  const textures = record["textures"]
  if (typeof skel !== "string" || typeof atlas !== "string" || !Array.isArray(textures) || textures.length === 0) {
    return { reason: "a Spine record needs skel, atlas and a non-empty textures list" }
  }
  if (fileFormatOf(skel) !== "skel") return { reason: `a Spine skeleton must be a .skel file, got ${skel}` }
  if (fileFormatOf(atlas) !== "atlas") return { reason: `a Spine atlas must be an .atlas file, got ${atlas}` }
  const pages: UpstreamFile[] = []
  for (const page of textures) {
    const format = typeof page === "string" ? fileFormatOf(page) : null
    if ((format !== "png" && format !== "webp") || typeof page !== "string") return { reason: `a Spine page must be a png or webp address, got ${String(page)}` }
    pages.push(spineFile("page", page, format))
  }
  return { files: [spineFile("skel", skel, "skel"), spineFile("atlas", atlas, "atlas"), ...pages] }
}

/** Absolute address of a master file. Audio is served by the extension-less `/media/` route, the rest by the static `/assets/` and `/fonts/` paths. */
export function hrefOf(root: string, address: string): string {
  if (address.startsWith(MASTER_AUDIO_PREFIX)) {
    const path = address.slice(MASTER_AUDIO_PREFIX.length).replace(/\.[^./]+$/, "")
    return new URL(`media/${path}`, root).toString()
  }
  return new URL(address.slice(1), root).toString()
}

/** The catalog file of an upstream entry: no byte count and no hash, since the master file list has neither. */
export function packFileOf(root: string, file: UpstreamFile): PackFile {
  return { role: file.role, name: file.name, format: file.format, bytes: 0, hash: "", href: hrefOf(root, file.address) }
}
