// Kengxxiao/ArknightsGameData 的 zh_CN/gamedata：`json:gamedata/<路径>` 对应 `<路径>.json`。

import { parseAssetKey, type AssetKey } from "arknights-assets-catalog"
import type { RepoRef, RepoWorkspace } from "#download/repo-cache.js"
import type { AssetSource, SourceHit } from "#source/asset-source.js"
import { fileHit, openRepository } from "#source/repository.js"

export const GAMEDATA_REPO: RepoRef = { owner: "Kengxxiao", repo: "ArknightsGameData", branch: "master" }

const ROOT = "zh_CN/gamedata"

export function gamedataSource(): AssetSource {
  let workspace: RepoWorkspace | null = null
  return {
    id: "gamedata",
    covers: [{ kind: "json", namespace: "gamedata" }],
    async prepare(context) {
      workspace = await openRepository(context, GAMEDATA_REPO)
    },
    async locate(key: AssetKey): Promise<SourceHit | null> {
      if (!workspace) return null
      const { kind, segments } = parseAssetKey(key)
      if (kind !== "json" || segments[0] !== "gamedata" || segments.length < 2) return null
      return fileHit(workspace, `${ROOT}/${segments.slice(1).join("/")}.json`)
    },
  }
}
