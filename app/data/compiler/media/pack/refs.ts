import { parseAssetKey, type AssetKey, type SchemaIssue } from "arknights-assets-catalog"
import { indexVoice } from "#compiler/media/need/audio-bank.js"
import { baseRefsIssues, isBaseRefs, isSeasonRefs, seasonRefsIssues, type BaseRefs, type SeasonRefs } from "#schema/pack-refs.js"

interface Tree {
  [name: string]: Tree | AssetKey | AssetKey[]
}

function at(root: Tree, path: readonly string[]): Tree {
  let node = root
  for (const name of path) {
    const next = node[name]
    if (next === undefined) {
      const created: Tree = {}
      node[name] = created
      node = created
    } else if (typeof next === "object" && !Array.isArray(next)) {
      node = next
    } else {
      throw new Error(`refs.${path.join(".")}: ${name} already holds a key`)
    }
  }
  return node
}

function set(root: Tree, path: readonly string[], key: AssetKey): void {
  const name = path[path.length - 1]
  if (name === undefined) return
  at(root, path.slice(0, -1))[name] = key
}

function push(root: Tree, path: readonly string[], key: AssetKey): void {
  const name = path[path.length - 1]
  if (name === undefined) return
  const parent = at(root, path.slice(0, -1))
  const list = parent[name]
  if (list === undefined) parent[name] = [key]
  else if (Array.isArray(list)) {
    if (!list.includes(key)) list.push(key)
  } else throw new Error(`refs.${path.join(".")} is not a list`)
}

/** Places one key into the tree by its path. Keys without a domain id are left out. */
function placeKey(refs: Tree, key: AssetKey, voiceSlotsOf: ReadonlyMap<string, Record<string, string[]>>): void {
  const { kind, segments } = parseAssetKey(key)
  const [namespace, second, third, fourth] = segments
  if (kind === "image") {
    if (namespace === "char" && second === "avatar" && third) {
      const elite = third.endsWith("_2")
      set(refs, ["chars", elite ? third.slice(0, -2) : third, elite ? "avatarElite" : "avatar"], key)
    } else if (namespace === "char" && second === "portrait" && third) {
      const match = /^(.+)_([12])$/.exec(third)
      if (match?.[1]) set(refs, ["chars", match[1], match[2] === "2" ? "portraitElite" : "portrait"], key)
    } else if (namespace === "enemy" && second === "icon" && third) {
      set(refs, ["enemies", third, "icon"], key)
    } else if (namespace === "token" && second === "icon" && third) {
      set(refs, ["tokens", third, "icon"], key)
    } else if (namespace === "skill" && second) {
      set(refs, ["skills", second], key)
    } else if (namespace === "prof" && second === "sub" && third) {
      set(refs, ["prof", "sub", third], key)
    } else if (namespace === "prof" && (second === "large" || second === "card") && third) {
      set(refs, ["prof", second, third], key)
    } else if (namespace === "prof" && second) {
      set(refs, ["prof", "icon", second], key)
    } else if (namespace === "camp" && second) {
      set(refs, ["camp", second], key)
    } else if (namespace === "band" && second) {
      set(refs, ["bands", second], key)
    } else if (namespace === "bond" && second) {
      set(refs, ["bonds", second], key)
    } else if (namespace === "season" && second && third === "trap" && fourth) {
      set(refs, ["items", fourth], key)
    }
  } else if (kind === "spine") {
    if (namespace === "char" && second && (third === "front" || third === "back")) set(refs, ["chars", second, "spine", third], key)
    else if (namespace === "skin" && second && (third === "front" || third === "back")) set(refs, ["skins", second, "spine", third], key)
    else if (namespace === "enemy" && second && segments.length === 2) set(refs, ["enemies", second, "spine"], key)
    else if (namespace === "token" && second && third === "front") set(refs, ["tokens", second, "spine"], key)
    else if (namespace === "token" && second && third) set(refs, ["tokens", second, "spineVariants", third], key)
  } else if (kind === "audio") {
    if (namespace === "voice" && second && third && fourth) {
      const lines = voiceSlotsOf.get(third)
      const slot = lines && Object.entries(lines).find(([, assets]) => assets.some((asset) => asset.split("/")[1]?.toLowerCase() === fourth))?.[0]
      if (slot) push(refs, ["voice", third, slot], key)
    } else if (namespace === "sfx" && second && third) {
      set(refs, ["sfx", second, third], key)
    } else if (namespace === "bgm" && second) {
      set(refs, ["bgm", second], key)
    }
  } else if (kind === "json") {
    if (namespace === "anim-roles" && second) set(refs, ["animRoles"], key)
    else if (namespace === "board" && second && third === "tiles") set(refs, ["board", "theme"], key)
  } else if (kind === "font" && namespace && second) {
    set(refs, ["fonts", namespace, second], key)
  }
}

function treeOf(keys: Iterable<AssetKey>, charword: unknown | null): Tree {
  const refs: Tree = {}
  const voiceSlotsOf = charword ? indexVoice(charword, "CN", null) : new Map<string, Record<string, string[]>>()
  for (const key of [...keys].sort()) placeKey(refs, key, voiceSlotsOf)
  return refs
}

function invalid(type: string, issues: readonly SchemaIssue[]): Error {
  return new Error(`${type} refs are invalid: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`)
}

/**
 * `refs` of the base pack, read from the key paths. Only ids with a key among `keys` appear, and every leaf is a key.
 * `charword` is the parsed `charword_table.json`, which gives each voice line its slot.
 */
export function baseRefs(keys: Iterable<AssetKey>, charword: unknown | null): BaseRefs {
  const refs = treeOf(keys, charword)
  if (isBaseRefs(refs)) return refs
  throw invalid("base", baseRefsIssues(refs))
}

/** `refs` of a season pack, read from the key paths. Only ids with a key among `keys` appear, and every leaf is a key. */
export function seasonRefs(keys: Iterable<AssetKey>): SeasonRefs {
  const refs = treeOf(keys, null)
  if (isSeasonRefs(refs)) return refs
  throw invalid("season", seasonRefsIssues(refs))
}
