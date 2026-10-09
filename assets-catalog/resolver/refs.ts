import { isAssetKey, type AssetKey } from "#key/asset-key.js"
import type { PackRefNode, PackRefs } from "#schema/pack-manifest.js"
import { isRecord } from "#schema/issue.js"

function mergeNode(lower: PackRefNode | undefined, upper: PackRefNode): PackRefNode {
  if (lower === undefined || !isRecord(lower) || !isRecord(upper)) return upper
  return mergeRefs([lower as PackRefs, upper as PackRefs])
}

/**
 * Merges `refs` of several layers, lowest first, by JSON path: objects merge field by field,
 * while a key or an array in a higher layer replaces whatever the lower layers had at that path.
 */
export function mergeRefs(layers: readonly PackRefs[]): PackRefs {
  const merged = new Map<string, PackRefNode>()
  for (const refs of layers) {
    for (const [name, node] of Object.entries(refs)) merged.set(name, mergeNode(merged.get(name), node))
  }
  return Object.fromEntries(merged) as PackRefs
}

/** The node at a path of names. A string path splits on `.`. */
export function refNodeAt(refs: PackRefs, path: string | readonly string[]): PackRefNode | null {
  const names = typeof path === "string" ? path.split(".") : path
  let node: PackRefNode = refs
  for (const name of names) {
    if (Array.isArray(node)) {
      const index = Number(name)
      const list = node as readonly PackRefNode[]
      if (!Number.isInteger(index) || index < 0 || index >= list.length) return null
      node = list[index] as PackRefNode
    } else if (isRecord(node) && Object.hasOwn(node, name)) {
      node = (node as PackRefs)[name] as PackRefNode
    } else {
      return null
    }
  }
  return node
}

/** The key at a path of names, or null when the path is missing or ends at an object or array. */
export function refKeyAt(refs: PackRefs, path: string | readonly string[]): AssetKey | null {
  const node = refNodeAt(refs, path)
  return isAssetKey(node) ? node : null
}
