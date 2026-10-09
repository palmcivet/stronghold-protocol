import type { AssetKey, PackRefs } from "arknights-assets-catalog"

type RefNode = { [name: string]: RefNode | AssetKey | readonly AssetKey[] }

function isNode(value: unknown): value is RefNode {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function sameValue(left: unknown, right: string | readonly string[]): boolean {
  if (typeof right === "string") return left === right
  return Array.isArray(left) && left.length === right.length && left.every((item, index) => item === right[index])
}

/** The `refs` tree of an upstream manifest, built path by path. A path that already holds another key is reported, not replaced. */
export class RefTable {
  private readonly root: RefNode = {}

  /** Sets the value at a path. Returns the reason when the path already holds a different value, or null. */
  set(path: readonly string[], value: AssetKey | readonly AssetKey[]): string | null {
    const last = path[path.length - 1]
    if (last === undefined) return "a ref needs a non-empty path"
    let node = this.root
    for (const [index, name] of path.slice(0, -1).entries()) {
      const next: unknown = node[name]
      if (next === undefined) {
        const created: RefNode = {}
        node[name] = created
        node = created
      } else if (isNode(next)) {
        node = next
      } else {
        return `${path.slice(0, index + 1).join(".")} is already a key, so ${path.join(".")} cannot be set`
      }
    }
    const current: unknown = node[last]
    if (current === undefined) {
      node[last] = value as RefNode[string]
      return null
    }
    return sameValue(current, value) ? null : `${path.join(".")} already refers to another key`
  }

  /** The key at a path, or null when the path is missing or ends at an object or a list. */
  get(path: readonly string[]): AssetKey | null {
    let node: unknown = this.root
    for (const name of path) {
      if (!isNode(node)) return null
      node = node[name]
    }
    return typeof node === "string" ? (node as AssetKey) : null
  }

  toRefs(): PackRefs {
    return this.root as PackRefs
  }
}
