import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"

function walk(start: string, found: (dir: string) => boolean): string {
  let dir = dirname(start)
  for (let step = 0; step < 8; step += 1) {
    if (found(dir)) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`package root not found from ${start}`)
}

/** 本包根：package.json 的 name 是 stronghold-app。源码和 dist 都从当前文件往上找。 */
export function appRootFrom(filePath: string): string {
  return walk(filePath, (dir) => {
    const manifest = join(dir, "package.json")
    if (!existsSync(manifest)) return false
    try {
      const parsed = JSON.parse(readFileSync(manifest, "utf8")) as { readonly name?: unknown }
      return parsed.name === "stronghold-app"
    } catch {
      return false
    }
  })
}
