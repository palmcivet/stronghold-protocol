// ArknightsAssets/ArknightsAssets2 的 voice 分支（sound_beta_2）：全部音频。
// 语音按规则推出；BGM 与音效先查路径表，再在音频树中按文件名反查，同名多个即视为未命中。

import { parseAssetKey, type AssetKey } from "arknights-assets-catalog"
import type { RepoRef, RepoWorkspace } from "#download/repo-cache.js"
import type { AssetSource, SourceContext, SourceHit } from "#source/asset-source.js"
import type { PathTable } from "#source/path-table.js"
import { fileHit, onlyCandidate, openRepository } from "#source/repository.js"

export const VOICE_REPO: RepoRef = { owner: "ArknightsAssets", repo: "ArknightsAssets2", branch: "voice" }

export const SOUND_ROOT = "assets/dyn/audio/sound_beta_2"

/** Voice folders by the language segment of `audio:voice/<lang>/...`. */
export const VOICE_FOLDERS: Readonly<Record<string, string>> = Object.freeze({
  cn: "voice_cn",
  jp: "voice",
  en: "voice_en",
  kr: "voice_kr",
})

function inMusic(path: string): boolean {
  return path.startsWith(`${SOUND_ROOT}/music/`)
}

function inEffects(path: string): boolean {
  if (!path.startsWith(`${SOUND_ROOT}/`)) return false
  const top = path.slice(SOUND_ROOT.length + 1).split("/")[0] ?? ""
  return top !== "music" && !top.startsWith("voice")
}

export function voiceSource(paths: PathTable): AssetSource {
  let workspace: RepoWorkspace | null = null
  return {
    id: "voice",
    covers: [
      { kind: "audio", namespace: "voice" },
      { kind: "audio", namespace: "bgm" },
      { kind: "audio", namespace: "sfx" },
    ],
    async prepare(context) {
      workspace = await openRepository(context, VOICE_REPO)
    },
    async locate(key: AssetKey, context: SourceContext): Promise<SourceHit | null> {
      if (!workspace) return null
      const { kind, segments } = parseAssetKey(key)
      if (kind !== "audio") return null
      const listed = paths.get(key)
      if (listed !== undefined) return fileHit(workspace, listed)
      const [namespace, second, third, fourth] = segments
      if (namespace === "voice") {
        const folder = second === undefined ? undefined : VOICE_FOLDERS[second]
        if (segments.length !== 4 || !folder || !third || !fourth) return null
        return fileHit(workspace, `${SOUND_ROOT}/${folder}/${third}/${fourth.toLowerCase()}.mp3`)
      }
      const name = segments[segments.length - 1]
      if (namespace === "bgm" && segments.length === 2) return fileHit(workspace, onlyCandidate(key, workspace.index.named(`${name}.mp3`, inMusic), context))
      if (namespace === "sfx" && segments.length === 3) return fileHit(workspace, onlyCandidate(key, workspace.index.named(`${name}.mp3`, inEffects), context))
      return null
    },
  }
}
