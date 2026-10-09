// fexli/ArknightsResource：干员、皮肤与召唤物的战斗 Spine，目录为 spine/<所有者>/<模型>/<姿势>/。

import { parseAssetKey, type AssetKey } from "arknights-assets-catalog"
import type { RepoRef, RepoWorkspace } from "#download/repo-cache.js"
import type { AssetSource, SourceContext, SourceHit } from "#source/asset-source.js"
import { baseNameOf, safeName, stemOf } from "#source/name.js"
import { onlyCandidate, openRepository, repoHit } from "#source/repository.js"

export const FEXLI_REPO: RepoRef = { owner: "fexli", repo: "ArknightsResource", branch: "main" }

const CHAR_POSES: Readonly<Record<string, readonly string[]>> = { front: ["Front", "Spine"], back: ["Back"] }
/** Operators whose model folder inside `spine/<id>/` is not named after the id. */
const CHAR_FOLDER_NAME: Readonly<Record<string, string>> = Object.freeze({ char_107_liskam: "char_107_liskarm" })
const SKIN_POSES: Readonly<Record<string, readonly string[]>> = { front: ["Front", "Spine"], back: ["Back"] }
const TOKEN_POSES: Readonly<Record<string, readonly string[]>> = { front: ["Spine", "Front"] }
const TOKEN_VARIANT_POSES: readonly string[] = ["Spine", "Front"]

function hasExtension(path: string, extension: string): boolean {
  return path.toLowerCase().endsWith(extension)
}

type Folder = { readonly dir: string; readonly skel: string } | { readonly ambiguous: readonly string[] } | null

/** The single skeleton in a folder. */
function folderOf(workspace: RepoWorkspace, dir: string): Folder {
  const skels = workspace.index.filesIn(dir).filter((path) => hasExtension(path, ".skel"))
  if (skels.length === 0) return null
  if (skels.length > 1) return { ambiguous: skels }
  return { dir, skel: skels[0] as string }
}

function firstFolder(workspace: RepoWorkspace, base: string, poses: readonly string[]): Folder {
  for (const pose of poses) {
    const folder = folderOf(workspace, `${base}/${pose}`)
    if (folder) return folder
  }
  return null
}

function spineHit(workspace: RepoWorkspace, folder: { readonly dir: string; readonly skel: string }): SourceHit | null {
  const stem = stemOf(folder.skel)
  const atlas = `${folder.dir}/${stem}.atlas`
  if (!workspace.index.has(atlas)) return null
  const pages = workspace.index.filesIn(folder.dir).filter((path) => hasExtension(path, ".png"))
  if (pages.length === 0) return null
  const name = safeName(stem)
  return repoHit(
    workspace,
    folder.dir,
    [
      { role: "skel", name: `${name}.skel`, path: folder.skel },
      { role: "atlas", name: `${name}.atlas`, path: atlas, convert: "atlas" },
      ...pages.map((path) => ({ role: "page" as const, name: baseNameOf(path), path })),
    ],
    { premultipliedAlpha: false },
  )
}

function settle(key: AssetKey, workspace: RepoWorkspace, folder: Folder, context: SourceContext): SourceHit | null {
  if (folder === null) return null
  if ("ambiguous" in folder) {
    onlyCandidate(key, folder.ambiguous, context)
    return null
  }
  return spineHit(workspace, folder)
}

export function fexliSource(): AssetSource {
  let workspace: RepoWorkspace | null = null
  let models: Map<string, string[]> | null = null

  /** Model folders `spine/<owner>/<model>` by the safe name of the model. */
  const modelFolders = (current: RepoWorkspace): Map<string, string[]> => {
    if (models) return models
    models = new Map()
    const seen = new Set<string>()
    for (const path of current.index.paths) {
      const parts = path.split("/")
      if (parts[0] !== "spine" || parts.length < 4) continue
      const folder = parts.slice(0, 3).join("/")
      if (seen.has(folder)) continue
      seen.add(folder)
      const name = safeName(parts[2] as string)
      const list = models.get(name)
      if (list) list.push(folder)
      else models.set(name, [folder])
    }
    return models
  }

  return {
    id: "fexli",
    covers: [
      { kind: "spine", namespace: "char" },
      { kind: "spine", namespace: "skin" },
      { kind: "spine", namespace: "token" },
    ],
    async prepare(context) {
      workspace = await openRepository(context, FEXLI_REPO)
      models = null
    },
    async locate(key, context) {
      if (!workspace) return null
      const { kind, segments } = parseAssetKey(key)
      const [namespace, id, pose] = segments
      if (kind !== "spine" || segments.length !== 3 || !id || !pose) return null
      if (namespace === "char") {
        const poses = CHAR_POSES[pose]
        if (!poses) return null
        const model = CHAR_FOLDER_NAME[id] ?? id
        return settle(key, workspace, firstFolder(workspace, `spine/${id}/${model}`, poses), context)
      }
      if (namespace === "token") {
        // 非 `front` 的段是召唤物的皮肤变体名，目录为 `spine/<id>/<变体名>/`。
        if (pose !== "front") return settle(key, workspace, firstFolder(workspace, `spine/${id}/${pose}`, TOKEN_VARIANT_POSES), context)
        const poses = TOKEN_POSES[pose]
        if (!poses) return null
        const own = firstFolder(workspace, `spine/${id}/${id}`, poses)
        if (own) return settle(key, workspace, own, context)
        // 只有皮肤变体的召唤物：唯一的变体才算命中。
        const variants = workspace.index
          .directoriesIn(`spine/${id}`)
          .filter((name) => name !== id)
          .map((name) => firstFolder(workspace as RepoWorkspace, `spine/${id}/${name}`, poses))
          .filter((folder): folder is NonNullable<Folder> => folder !== null)
        if (variants.length > 1) {
          onlyCandidate(key, variants.map((folder) => ("dir" in folder ? folder.dir : (folder.ambiguous[0] as string))), context)
          return null
        }
        return settle(key, workspace, variants[0] ?? null, context)
      }
      if (namespace === "skin") {
        const poses = SKIN_POSES[pose]
        if (!poses) return null
        const folder = onlyCandidate(key, modelFolders(workspace).get(id) ?? [], context)
        return folder ? settle(key, workspace, firstFolder(workspace, folder, poses), context) : null
      }
      return null
    },
  }
}
