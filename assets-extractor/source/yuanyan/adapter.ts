// yuanyan3060/ArknightsGameResource：头像、立绘、敌人图标、技能图标、物品图标与物品稀有度背景。

import { parseAssetKey, type AssetKey } from "arknights-assets-catalog"
import type { RepoRef, RepoWorkspace } from "#download/repo-cache.js"
import type { AssetSource, SourceContext, SourceHit } from "#source/asset-source.js"
import { safeName } from "#source/name.js"
import { fileHit, onlyCandidate, openRepository } from "#source/repository.js"

export const YUANYAN_REPO: RepoRef = { owner: "yuanyan3060", repo: "ArknightsGameResource", branch: "main" }

const SKILL_PREFIX = "skill_icon_"

function inSkillDirectory(path: string): boolean {
  return path.startsWith("skill/")
}

/** Upstream path of a key with a direct rule, or undefined when the key needs a lookup by name. */
function rulePath(segments: readonly string[]): string | null | undefined {
  const [namespace, second, third] = segments
  if (namespace === "char" && segments.length === 3 && second === "avatar") return `avatar/${third}.png`
  if (namespace === "char" && segments.length === 3 && second === "portrait") return `portrait/${third}.png`
  if (namespace === "skin" && segments.length === 3 && second === "portrait") return `skin/${third}.png`
  if (namespace === "enemy" && segments.length === 3 && second === "icon") return `enemy/${third}.png`
  // 敌人充当召唤物时（如 `enemy_9012_acloon`），图标在敌人目录。
  if (namespace === "token" && segments.length === 3 && second === "icon") return third?.startsWith("enemy_") ? `enemy/${third}.png` : `avatar/${third}.png`
  if (namespace === "item" && segments.length === 3 && second === "rarity") return `item_rarity_img/sprite_item_${third}.png`
  if (namespace === "item" && segments.length === 2) return `item/${second}.png`
  if (namespace === "skill" && segments.length === 2) return undefined
  return null
}

export function yuanyanSource(): AssetSource {
  let workspace: RepoWorkspace | null = null
  return {
    id: "yuanyan",
    covers: [
      { kind: "image", namespace: "char" },
      { kind: "image", namespace: "skin" },
      { kind: "image", namespace: "enemy" },
      { kind: "image", namespace: "token" },
      { kind: "image", namespace: "skill" },
      { kind: "image", namespace: "item" },
    ],
    async prepare(context) {
      workspace = await openRepository(context, YUANYAN_REPO)
    },
    async locate(key: AssetKey, context: SourceContext): Promise<SourceHit | null> {
      if (!workspace) return null
      const { kind, segments } = parseAssetKey(key)
      if (kind !== "image") return null
      const path = rulePath(segments)
      if (path !== undefined) return fileHit(workspace, path)
      // 技能图标的上游名可能含 `[`、`]`，键里换成了 `_`，按安全名反查。
      const name = `${SKILL_PREFIX}${segments[1]}.png`
      return fileHit(workspace, onlyCandidate(key, workspace.index.named(name, inSkillDirectory, safeName), context))
    },
  }
}
