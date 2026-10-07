import { createHash } from "node:crypto"
import type { CatalogFiles } from "#port/catalog-files.js"
import type { CatalogEntry, CatalogKind } from "#schema/catalog-entry.js"

export interface CatalogRelease {
  readonly schemaVersion: 1
  readonly contentVersion: string
  readonly generator: string
  readonly entries: Readonly<Record<string, CatalogEntry>>
}

export interface CatalogReleaseOptions {
  readonly files: CatalogFiles
  readonly paths: readonly string[]
  readonly readPath?: (path: string) => string
  readonly generator?: string
}

function kindOf(path: string): CatalogKind {
  const extension = path.toLowerCase().split(".").pop()
  if (extension === "mp3" || extension === "m4a" || extension === "ogg" || extension === "wav") return "audio"
  if (extension === "otf" || extension === "ttf" || extension === "woff" || extension === "woff2") return "font"
  if (extension === "skel" || extension === "atlas") return "spine"
  if (extension === "obj" || extension === "json") return "model"
  return "image"
}

function addressOf(path: string): string {
  return path.startsWith("font/") ? `/fonts/${path.slice("font/".length)}` : `/assets/${path}`
}

export async function buildCatalogRelease(options: CatalogReleaseOptions): Promise<CatalogRelease> {
  const entries: Record<string, CatalogEntry> = {}
  for (const path of [...new Set(options.paths)].sort()) {
    const bytes = await options.files.readBytes(options.readPath?.(path) ?? path)
    const hash = createHash("sha256").update(bytes).digest("hex")
    entries[path] = {
      id: hash.slice(0, 16),
      kind: kindOf(path),
      address: addressOf(path),
      bytes: bytes.byteLength,
      hash,
      dependsOn: [],
      fallbackId: null,
      preloadGroup: kindOf(path) === "audio" ? "audio" : kindOf(path) === "image" ? "image" : null,
    }
  }
  for (const [path, entry] of Object.entries(entries)) {
    if (entry.kind !== "spine") continue
    const directory = path.slice(0, path.lastIndexOf("/"))
    const dependsOn = Object.entries(entries)
      .filter(([sibling, value]) => sibling !== path && value.kind !== "font" && sibling.slice(0, sibling.lastIndexOf("/")) === directory)
      .map(([, value]) => value.id)
    entries[path] = { ...entry, dependsOn }
  }
  const contentVersion = createHash("sha256").update(JSON.stringify(entries)).digest("hex").slice(0, 16)
  return {
    schemaVersion: 1,
    contentVersion,
    generator: options.generator ?? "assets-catalog",
    entries,
  }
}
