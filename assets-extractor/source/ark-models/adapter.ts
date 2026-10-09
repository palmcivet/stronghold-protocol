// isHarryh/Ark-Models：敌人 Spine，以及由敌人充当的召唤物的正面 Spine。文件名来自仓库根目录的 models_data.json（assetList）。

import { join } from "node:path"
import { parseAssetKey, type AssetKey } from "arknights-assets-catalog"
import type { RepoRef, RepoWorkspace } from "#download/repo-cache.js"
import type { AssetSource, SourceHit } from "#source/asset-source.js"
import { safeName, stemOf } from "#source/name.js"
import { openRepository, repoHit } from "#source/repository.js"

export const ARK_MODELS_REPO: RepoRef = { owner: "isHarryh", repo: "Ark-Models", branch: "main" }

export const MODELS_DATA = "models_data.json"

const DEFAULT_ENEMY_STORAGE = "models_enemies"

interface ModelsIndex {
  readonly storage: string
  readonly data: Readonly<Record<string, unknown>>
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Readonly<Record<string, unknown>>) : null
}

/** The asset of a list: a plain string, or the first entry without a "$" variant marker, else the first entry. */
function pick(value: unknown): string | null {
  if (typeof value === "string") return value || null
  if (!Array.isArray(value)) return null
  const plain = value.find((item): item is string => typeof item === "string" && item.length > 0 && !item.includes("$"))
  const first = value[0]
  return plain ?? (typeof first === "string" && first ? first : null)
}

export function parseModelsData(value: unknown): ModelsIndex {
  const root = record(value)
  const data = record(root?.["data"])
  if (!data) throw new Error(`${MODELS_DATA} has no "data" object`)
  const storage = record(root?.["storageDirectory"])?.["Enemy"]
  return { storage: typeof storage === "string" && storage ? storage : DEFAULT_ENEMY_STORAGE, data }
}

export function arkModelsSource(): AssetSource {
  let workspace: RepoWorkspace | null = null
  let models: ModelsIndex | null = null
  return {
    id: "ark-models",
    covers: [
      { kind: "spine", namespace: "enemy" },
      { kind: "spine", namespace: "token" },
    ],
    async prepare(context) {
      workspace = await openRepository(context, ARK_MODELS_REPO)
      models = parseModelsData(JSON.parse(await context.files.readText(join(workspace.root, MODELS_DATA))))
    },
    async locate(key: AssetKey): Promise<SourceHit | null> {
      if (!workspace || !models) return null
      const { kind, segments } = parseAssetKey(key)
      const [namespace, spineId, pose] = segments
      if (kind !== "spine" || !spineId) return null
      const enemy = namespace === "enemy" && segments.length === 2
      const enemyToken = namespace === "token" && segments.length === 3 && pose === "front" && spineId.startsWith("enemy_")
      if (!enemy && !enemyToken) return null
      const id = spineId.replace(/^enemy_/, "")
      const assets = record(record(models.data[id])?.["assetList"])
      const skel = pick(assets?.[".skel"])
      const atlas = pick(assets?.[".atlas"])
      const page = pick(assets?.[".png"])
      if (!skel || !atlas || !page) return null
      const dir = `${models.storage}/${id}`
      const paths = [skel, atlas, page].map((file) => `${dir}/${file}`)
      if (!paths.every((path) => (workspace as RepoWorkspace).index.has(path))) return null
      const name = safeName(stemOf(skel))
      return repoHit(
        workspace,
        dir,
        [
          { role: "skel", name: `${name}.skel`, path: paths[0] as string },
          { role: "atlas", name: `${name}.atlas`, path: paths[1] as string, convert: "atlas" },
          { role: "page", name: page, path: paths[2] as string },
        ],
        { premultipliedAlpha: true },
      )
    },
  }
}
