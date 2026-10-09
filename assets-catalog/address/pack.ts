import { AssetAddressError } from "#address/file.js"
import type { PackInfo, PackType } from "#schema/pack-manifest.js"

/** Site path that holds every published file and manifest. */
export const RESOURCE_ROOT = "/res/"
/** Directory of asset files under `RESOURCE_ROOT`, laid out by `fileAddress`. */
export const FILES_DIRECTORY = "files/"
/** Directory of published pack manifests under `RESOURCE_ROOT`. */
export const PACKS_DIRECTORY = "packs/"
/** Directory of the local overlay manifest under `RESOURCE_ROOT`. */
export const LOCAL_DIRECTORY = "local/"
export const MANIFEST_FILE = "manifest.json"

/** Packs that have a place in the published layout. Upstream manifests are built by the client. */
export type PublishedPackType = Exclude<PackType, "upstream">

export type PublishedPack = Pick<PackInfo, "id" | "version" | "contentHash"> & { readonly type: PublishedPackType }

const PATH_SEGMENT = /^[A-Za-z0-9_.+-]+$/

function segment(pack: PublishedPack, field: "id" | "version" | "contentHash"): string {
  const value = pack[field]
  if (!PATH_SEGMENT.test(value) || value === "." || value === "..") {
    throw new AssetAddressError(`${pack.type} pack ${field} ${JSON.stringify(value)} cannot be a path segment`)
  }
  return value
}

/**
 * Directory of a pack under `RESOURCE_ROOT`:
 * `packs/base/<version>/`, `packs/season/<id>/<contentHash>/`, `packs/mod/<id>/<version>/`, `local/`.
 */
export function packDirectory(pack: PublishedPack): string {
  switch (pack.type) {
    case "base":
      return `${PACKS_DIRECTORY}base/${segment(pack, "version")}/`
    case "season":
      return `${PACKS_DIRECTORY}season/${segment(pack, "id")}/${segment(pack, "contentHash")}/`
    case "mod":
      return `${PACKS_DIRECTORY}mod/${segment(pack, "id")}/${segment(pack, "version")}/`
    case "local":
      return LOCAL_DIRECTORY
  }
}

/** Manifest address of a pack under `RESOURCE_ROOT`. */
export function packManifestAddress(pack: PublishedPack): string {
  return `${packDirectory(pack)}${MANIFEST_FILE}`
}

/** `fileRoot` for a published pack: the shared `files/` directory, relative to the pack directory. */
export function packFileRoot(pack: PublishedPack): string {
  const depth = packDirectory(pack).split("/").filter((part) => part.length > 0).length
  return `${"../".repeat(depth)}${FILES_DIRECTORY}`
}
