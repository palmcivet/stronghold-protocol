import { validSpine, type SpineFile } from "arknights-assets-catalog"
import { asMap, asText, own, type JsonMap } from "./json-map.js"

function textAt(map: JsonMap | null, key: string): string | null {
  return asText(own(map, key))
}

export function baseCharId(id: string): string | null {
  const text = asText(id)
  if (!text) return null
  return text.replace(/_(1|2)$/, "")
}

export function avatarUrl(manifest: unknown, id: string, preferElite = false): string | null {
  const text = asText(id)
  if (!text) return null
  const chars = asMap(own(asMap(manifest), "chars"))
  let record = asMap(own(chars, text))
  let elite = preferElite
  if (!record) {
    const base = baseCharId(text)
    record = base ? asMap(own(chars, base)) : null
    if (record && /_2$/.test(text)) elite = true
  }
  if (!record) return null
  return (elite ? textAt(record, "avatarE2") : null) ?? textAt(record, "avatar")
}

export function portraitUrl(manifest: unknown, id: string, preferElite = false): string | null {
  const text = asText(id)
  if (!text) return null
  const chars = asMap(own(asMap(manifest), "chars"))
  let record = asMap(own(chars, text))
  let elite = preferElite
  if (!record) {
    const base = baseCharId(text)
    record = base ? asMap(own(chars, base)) : null
    if (record && /_2$/.test(text)) elite = true
  }
  if (!record) return null
  return (elite ? textAt(record, "portraitE2") : null) ?? textAt(record, "portrait")
}

export function chessAvatarUrl(manifest: unknown, chess: unknown): string | null {
  const record = asMap(chess)
  const assets = asMap(record ? own(record, "assets") : null)
  const id = textAt(assets, "avatar") ?? (record ? textAt(record, "charId") : null)
  const chars = asMap(own(asMap(manifest), "chars"))
  if (!chars || !id) return null
  if (id.endsWith("_2") && !asMap(own(chars, id))) {
    const base = asMap(own(chars, id.slice(0, -2)))
    return textAt(base, "avatarE2") ?? textAt(base, "avatar")
  }
  const direct = asMap(own(chars, id))
  const byChar = record ? textAt(record, "charId") : null
  return textAt(direct, "avatar") ?? (byChar ? textAt(asMap(own(chars, byChar)), "avatar") : null)
}

export function chessPortraitUrl(manifest: unknown, chess: unknown): string | null {
  const record = asMap(chess)
  const chars = asMap(own(asMap(manifest), "chars"))
  if (!chars) return null
  const assets = asMap(record ? own(record, "assets") : null)
  const id = textAt(assets, "portrait")
  if (id?.endsWith("_2") || id?.endsWith("_1")) {
    const base = asMap(own(chars, id.slice(0, -2)))
    if (base) return (id.endsWith("_2") ? textAt(base, "portraitE2") : null) ?? textAt(base, "portrait")
  }
  const charId = record ? textAt(record, "charId") : null
  const byChar = charId ? asMap(own(chars, charId)) : null
  if (!byChar) return null
  const elite = record?.["isGolden"] === true
  return (elite ? textAt(byChar, "portraitE2") : null) ?? textAt(byChar, "portrait")
}

export function uiUrl(manifest: unknown, key: string): string | null {
  return textAt(asMap(own(asMap(manifest), "ui")), key)
}

export function enemyIconUrl(manifest: unknown, enemyKey: string): string | null {
  const enemies = asMap(own(asMap(manifest), "enemies"))
  const direct = textAt(asMap(own(enemies, enemyKey)), "icon")
  if (direct) return direct
  const base = enemyKey.replace(/_\d+$/, "")
  if (base === enemyKey) return null
  return textAt(asMap(own(enemies, base)), "icon")
}

export function tokenAvatarUrl(manifest: unknown, tokenId: string): string | null {
  const tokens = asMap(own(asMap(manifest), "tokens"))
  const record = asMap(own(tokens, tokenId))
  if (!record) return null
  const avatar = textAt(record, "avatar")
  if (avatar) return avatar
  const owner = textAt(record, "owner")
  if (owner) {
    const ownerAvatar = avatarUrl(manifest, owner)
    if (ownerAvatar) return ownerAvatar
  }
  const prof = asMap(own(asMap(manifest), "prof"))
  return textAt(asMap(own(prof, "battlecard")), "token")
}

export function bondIconUrl(manifest: unknown, bondId: string): string | null {
  return asText(own(asMap(own(asMap(manifest), "bonds")), bondId))
}

export function bandIconUrl(manifest: unknown, bandId: string): string | null {
  return asText(own(asMap(own(asMap(manifest), "bands")), bandId))
}

export function itemIconUrl(manifest: unknown, item: unknown): string | null {
  const items = asMap(own(asMap(manifest), "items"))
  if (typeof item === "string") return textAt(items, item)
  const record = asMap(item)
  const id = (record ? textAt(record, "iconId") : null) ?? (record ? textAt(record, "trapId") : null)
  return id ? textAt(items, id) : null
}

export function skillIconUrl(manifest: unknown, id: string, fallback = true): string | null {
  const root = asMap(manifest)
  const skills = asMap(own(root, "skills"))
  const direct = textAt(skills, id)
  if (direct) return direct
  const iconId = textAt(asMap(own(root, "skillsById")), id)
  const mapped = iconId ? textAt(skills, iconId) : null
  if (mapped) return mapped
  return fallback ? uiUrl(manifest, "skillIcon/empty") : null
}

export function skillRecordIconUrl(manifest: unknown, skill: unknown, empty = true): string | null {
  const record = asMap(skill)
  for (const id of [record ? textAt(record, "iconId") : null, record ? textAt(record, "skillId") : null]) {
    if (!id) continue
    const url = skillIconUrl(manifest, id, false)
    if (url) return url
  }
  return empty ? uiUrl(manifest, "skillIcon/empty") : null
}

export function chessSkillIconUrl(manifest: unknown, chess: unknown): string | null {
  const record = asMap(chess)
  const assets = asMap(record ? own(record, "assets") : null)
  const skill = asMap(record ? own(record, "skill") : null)
  const id = textAt(assets, "skillIcon") ?? (skill ? textAt(skill, "iconId") : null) ?? (skill ? textAt(skill, "skillId") : null)
  if (id) {
    const url = skillIconUrl(manifest, id, false)
    if (url) return url
  }
  return uiUrl(manifest, "skillIcon/empty")
}

export function profIconUrl(manifest: unknown, profession: string, kind = "icon"): string | null {
  const name = asText(profession)
  if (!name) return null
  const prof = asMap(own(asMap(manifest), "prof"))
  return textAt(asMap(own(prof, kind)), name.toLowerCase())
}

export function subProfIconUrl(manifest: unknown, chessOrId: unknown): string | null {
  const prof = asMap(own(asMap(manifest), "prof"))
  const sub = asMap(own(prof, "sub"))
  if (!sub) return null
  if (typeof chessOrId === "string") {
    const id = chessOrId.replace(/^sub_/, "").replace(/_icon$/, "")
    return textAt(sub, id)
  }
  const record = asMap(chessOrId)
  const assets = asMap(record ? own(record, "assets") : null)
  const raw = textAt(assets, "subProfIcon")
  const id = raw ? raw.replace(/^sub_/, "").replace(/_icon$/, "") : record ? textAt(record, "subProfessionId") : null
  return id ? textAt(sub, id) : null
}

export function factionIconUrl(manifest: unknown, iconId: string): string | null {
  return iconId ? uiUrl(manifest, `enemyTypeIcon/${iconId}`) : null
}

export function titleIconUrl(manifest: unknown, picId: string): string | null {
  return picId ? uiUrl(manifest, `titleIcon/${picId}`) : null
}

export function localAssetUrl(local: unknown, group: string, name: string): string | null {
  const groups = asMap(own(asMap(local), "groups"))
  const entries = asMap(own(groups, group))
  const entry = asMap(own(entries, name))
  return entry ? textAt(entry, "path") : null
}

export function artUrls(local: unknown, manifest: unknown, group: string, name: string): readonly string[] {
  const urls: string[] = []
  const localUrl = localAssetUrl(local, group, name)
  if (localUrl) urls.push(localUrl)
  const web = uiUrl(manifest, `${group}/${name}`)
  if (web && web !== localUrl) urls.push(web)
  return urls
}

const GREEK: Readonly<Record<string, string>> = { α: "a", β: "b", γ: "g", δ: "d", Δ: "d" }
const moduleIconIndex = new WeakMap<object, ReadonlyMap<string, string>>()

export function moduleTypeIconUrl(local: unknown, typeName: string): string | null {
  const group = asMap(own(asMap(own(asMap(local), "groups")), "module"))
  const name = asText(typeName)?.trim() ?? null
  if (!group || !name) return null
  const exact = textAt(asMap(own(group, name)), "path")
  if (exact) return exact
  let index = moduleIconIndex.get(group)
  if (!index) {
    const built = new Map<string, string>()
    for (const [key, value] of Object.entries(group)) {
      const path = textAt(asMap(value), "path")
      const folded = key.toLowerCase()
      if (path && !built.has(folded)) built.set(folded, path)
    }
    index = built
    moduleIconIndex.set(group, index)
  }
  const key = name.replace(/[αβγδΔ]/g, (letter) => GREEK[letter] ?? letter).toLowerCase()
  return index.get(key) ?? null
}

export function effectIconUrl(manifest: unknown, effect: unknown): string | null {
  const record = asMap(effect)
  const kind = record ? asText(own(record, "iconKind")) : null
  const id = record ? textAt(record, "iconId") : null
  if (kind === "band") {
    return (id ? bandIconUrl(manifest, id) : null) ?? (id?.startsWith("icon_") ? bandIconUrl(manifest, `band_${id.slice(5)}`) : null)
  }
  if (kind === "item") return id ? itemIconUrl(manifest, id) : null
  if (kind === "garrison") return uiUrl(manifest, `garrisonTypeIcon/${id ?? "s_icon_bond"}`) ?? uiUrl(manifest, "garrisonTypeIcon/s_icon_bond")
  if (kind === "team") return uiUrl(manifest, `buffIcon/${id?.startsWith("icon_") ? id : "icon_team_buff"}`)
  if (kind === "choice") return uiUrl(manifest, `buffIcon/${id?.startsWith("icon_") ? id : "icon_player_buff"}`)
  return id ? uiUrl(manifest, `buffIcon/${id}`) : null
}

export function unitPictureUrl(manifest: unknown, id: string): string | null {
  return avatarUrl(manifest, id) ?? tokenAvatarUrl(manifest, id) ?? enemyIconUrl(manifest, id) ?? itemIconUrl(manifest, id)
}

export interface BgmClip {
  readonly intro: string | null
  readonly loop: string
}

export function bgmEntry(manifest: unknown, kind: string): BgmClip | null {
  const audio = asMap(own(asMap(manifest), "audio"))
  const clip = asMap(own(asMap(own(audio, "bossBgm")), kind)) ?? asMap(own(asMap(own(audio, "bgm")), kind))
  const loop = clip ? textAt(clip, "loop") : null
  if (!clip || !loop) return null
  return { intro: textAt(clip, "intro"), loop }
}

export function sfxUrl(manifest: unknown, group: string, key: string): string | null {
  const audio = asMap(own(asMap(manifest), "audio"))
  const sfx = asMap(own(audio, "sfx"))
  return textAt(asMap(own(sfx, group)), key)
}

export function unitSfxUrl(manifest: unknown, id: string, kind: string, skillIndex?: number): string | null {
  const audio = asMap(own(asMap(manifest), "audio"))
  const units = asMap(own(asMap(own(audio, "sfx")), "units"))
  const base = baseCharId(id)
  const record = asMap(own(units, id)) ?? (base ? asMap(own(units, base)) : null)
  if (!record) return null
  if (kind === "skill" && skillIndex !== undefined && Number.isInteger(skillIndex)) {
    const skills = own(record, "skills")
    const picked = Array.isArray(skills) ? asText(skills[skillIndex]) : textAt(asMap(skills), String(skillIndex))
    if (picked) return picked
  }
  return textAt(record, kind)
}

const localSpines = new WeakMap<object, { readonly local: object; readonly web: SpineFile | null; readonly entry: SpineFile | null }>()

export function localSpineEntry(spineLocal: unknown, local: unknown, web: SpineFile | null): SpineFile | null {
  const source = asMap(spineLocal)
  const manifest = asMap(local)
  if (!source || !manifest) return null
  const cached = localSpines.get(source)
  if (cached && cached.local === manifest && cached.web === web) return cached.entry
  const group = textAt(source, "group")
  const url = (name: unknown): string | null => {
    const text = asText(name)
    return group && text ? localAssetUrl(manifest, group, text) : null
  }
  const skel = url(own(source, "skel"))
  const atlas = url(own(source, "atlas"))
  const textureNames = Array.isArray(source["textures"]) ? source["textures"] : []
  const textures = textureNames.map((name) => url(name))
  let entry: SpineFile | null = null
  if (skel && atlas && skel.replace(/\.skel$/, ".atlas") === atlas && textures.length > 0 && textures.every((item) => item !== null)) {
    const built: SpineFile = {
      skel,
      atlas,
      textures: textures.filter((item): item is string => item !== null),
      pma: source["pma"] === true,
      anims: asMap(own(source, "anims")) ?? {},
      animations: own(source, "animations"),
      events: own(source, "events"),
      hits: own(source, "hits"),
      bounds: own(source, "bounds"),
      local: true,
      fallback: web,
    }
    entry = validSpine(built) ? built : null
  }
  localSpines.set(source, { local: manifest, web, entry })
  return entry
}

export function spineEntry(manifest: unknown, id: string, back = false, local?: unknown): SpineFile | null {
  const text = asText(id)
  if (!text) return null
  const root = asMap(manifest)
  const chars = asMap(own(root, "chars"))
  const base = baseCharId(text)
  const character = asMap(own(chars, text)) ?? (base ? asMap(own(chars, base)) : null)
  const spine = asMap(character ? own(character, "spine") : null)
  if (character && spine) {
    const picked = back ? asMap(own(spine, "back")) : null
    const file = picked ?? asMap(own(spine, "front"))
    return file && validSpine(file) ? file : null
  }
  const token = asMap(own(asMap(own(root, "tokens")), text))
  if (token) {
    const file = own(token, "spine")
    return validSpine(file) ? file : null
  }
  const enemy = asMap(own(asMap(own(root, "enemies")), text))
  if (!enemy) return null
  let web: SpineFile | null = null
  if (validSpine(own(enemy, "spine"))) web = own(enemy, "spine") as SpineFile
  else {
    const alias = textAt(enemy, "spineAliasOf")
    const aliased = alias ? asMap(own(asMap(own(root, "enemies")), alias)) : null
    const file = aliased ? own(aliased, "spine") : null
    web = file && validSpine(file) ? file : null
  }
  if (local !== undefined) return localSpineEntry(own(enemy, "spineLocal"), local, web) ?? web
  return web
}

export function hasBackSpine(manifest: unknown, id: string): boolean {
  const chars = asMap(own(asMap(manifest), "chars"))
  const base = baseCharId(id)
  const character = asMap(own(chars, id)) ?? (base ? asMap(own(chars, base)) : null)
  const spine = asMap(character ? own(character, "spine") : null)
  return spine !== null && validSpine(own(spine, "back"))
}
