// ArknightsAssets/ArknightsAssets2 的 cn 分支：界面图。先查路径表，再按规则推出职业、子职业、盟约与羁绊图标。

import { parseAssetKey, type AssetKey } from "arknights-assets-catalog"
import type { RepoRef, RepoWorkspace } from "#download/repo-cache.js"
import type { AssetSource, SourceHit } from "#source/asset-source.js"
import type { PathTable } from "#source/path-table.js"
import { fileHit, openRepository } from "#source/repository.js"

export const ARKNIGHTS_ASSETS_REPO: RepoRef = { owner: "ArknightsAssets", repo: "ArknightsAssets2", branch: "cn" }

const ROOT = "assets/dyn"
const AUTOCHESS_ARTS = `${ROOT}/ui/autochess/[uc]autochesscommon/arts`

function rulePath(segments: readonly string[]): string | null {
  const [namespace, second, third] = segments
  if (namespace === "prof" && segments.length === 2) return `${ROOT}/arts/profession_hub/icon_${second}.png`
  if (namespace === "prof" && segments.length === 3 && second === "sub") return `${ROOT}/arts/ui/subprofessionicon/sub_${third}_icon.png`
  if (namespace === "band" && segments.length === 2 && second) return `${AUTOCHESS_ARTS}/bandicon/icon_${second.replace(/^band_/, "")}.png`
  if (namespace === "bond" && segments.length === 2 && second) return `${AUTOCHESS_ARTS}/bondicon/icon_${second.toLowerCase()}.png`
  return null
}

export function arknightsAssetsSource(paths: PathTable): AssetSource {
  let workspace: RepoWorkspace | null = null
  return {
    id: "arknights-assets",
    covers: [
      { kind: "image", namespace: "prof" },
      { kind: "image", namespace: "camp" },
      { kind: "image", namespace: "battle" },
      { kind: "image", namespace: "rank" },
      { kind: "image", namespace: "skill/empty" },
      { kind: "image", namespace: "skill/empty_large" },
      { kind: "image", namespace: "ui" },
      { kind: "image", namespace: "band" },
      { kind: "image", namespace: "bond" },
      { kind: "image", namespace: "season" },
    ],
    async prepare(context) {
      workspace = await openRepository(context, ARKNIGHTS_ASSETS_REPO)
    },
    async locate(key: AssetKey): Promise<SourceHit | null> {
      if (!workspace) return null
      const { kind, segments } = parseAssetKey(key)
      if (kind !== "image") return null
      return fileHit(workspace, paths.get(key) ?? rulePath(segments))
    },
  }
}
