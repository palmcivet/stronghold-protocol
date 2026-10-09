// TimWangZi/The-font-of-Arknights：Bender 与 Novecento Wide。主文件转成 WOFF2，原文件作为 fallback。

import type { AssetKey } from "arknights-assets-catalog"
import type { RepoRef, RepoWorkspace } from "#download/repo-cache.js"
import type { AssetSource, SourceHit } from "#source/asset-source.js"
import { openRepository, repoHit } from "#source/repository.js"

export const FONTS_REPO: RepoRef = { owner: "TimWangZi", repo: "The-font-of-Arknights", branch: "master" }

/** Font keys and their files in the repository. */
export const FONTS: Readonly<Record<string, string>> = Object.freeze({
  "font:bender/regular": "font/Bender/BENDER.OTF",
  "font:bender/light": "font/Bender/BenderLight.woff.ttf",
  "font:novecento-wide/normal": "font/Novecento-Wide-Normal-2.otf",
})

export function fontsSource(): AssetSource {
  let workspace: RepoWorkspace | null = null
  return {
    id: "fonts",
    covers: [{ kind: "font", namespace: "" }],
    async prepare(context) {
      workspace = await openRepository(context, FONTS_REPO)
    },
    async locate(key: AssetKey): Promise<SourceHit | null> {
      const path = FONTS[key]
      if (!workspace || path === undefined || !workspace.index.has(path)) return null
      return repoHit(workspace, path, [
        { role: "main", name: null, path, convert: "woff2" },
        { role: "fallback", name: null, path },
      ])
    },
  }
}
