import { formatAssetKey, parseAssetKey, type AssetKey } from "arknights-assets-catalog"
import { ENEMY_SPINE_ALIAS } from "#compiler/media/need/enemy-ids.js"

/**
 * Key a missing key falls back to, or null. The target must be of the same kind and is only written
 * when the pack holds it, so a fallback never points outside the pack.
 */
export function fallbackTargetOf(key: AssetKey): AssetKey | null {
  const { kind, path, segments } = parseAssetKey(key)
  if (kind === "image" && segments[0] === "char" && segments[1] === "avatar" && segments.length === 3) {
    const match = /^(.+)_2$/.exec(path.slice("char/avatar/".length))
    return match ? formatAssetKey("image", `char/avatar/${match[1]}`) : null
  }
  if (kind === "image" && segments[0] === "char" && segments[1] === "portrait" && segments.length === 3) {
    const match = /^(.+)_2$/.exec(path.slice("char/portrait/".length))
    return match ? formatAssetKey("image", `char/portrait/${match[1]}_1`) : null
  }
  if (kind === "spine" && segments[0] === "enemy" && segments.length === 2) {
    const alias = ENEMY_SPINE_ALIAS[segments[1] as string]
    return alias ? formatAssetKey("spine", `enemy/${alias}`) : null
  }
  return null
}
