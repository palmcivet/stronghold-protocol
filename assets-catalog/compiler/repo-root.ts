import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

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

/** 本包根：package.json 的 name 是 arknights-assets-catalog。源码和 dist 都从当前文件往上找。 */
export function catalogRootFrom(filePath: string): string {
  return walk(filePath, (dir) => {
    const manifest = join(dir, "package.json")
    if (!existsSync(manifest)) return false
    try {
      const parsed = JSON.parse(readFileSync(manifest, "utf8")) as { readonly name?: unknown }
      return parsed.name === "arknights-assets-catalog"
    } catch {
      return false
    }
  })
}

/** 本包根。定义在本包文件里，调用方在别的包时仍然定位到这里。 */
export function catalogPackageRoot(): string {
  return catalogRootFrom(fileURLToPath(import.meta.url))
}
