// 资源计划：每个需要的文件从哪下、写到哪，形状和 media manifest 一样。
// 叶子是 { alts }，模型是 { model }，literal 原样进清单。

import {
  BATTLE_SFX,
  indexVoice,
  pickUnitSfx,
  resolveSpec,
  UI_SFX,
  VOICE_BATTLE_SLOTS,
  VOICE_DIRS,
  type AudioIndex,
  type BankMix,
  type UnitSfx,
} from "./audio-bank.js"
import {
  joinUrl,
  kindOf,
  RAW_BASES,
  safeName,
  urlBase,
  urlDir,
  type AssetKind,
  type DownloadJob,
  type LocalSpineMeta,
  type PlannedSpineModel,
} from "arknights-assets-catalog/compile"
import { EMOTE_CATALOG } from "./emote-catalog.js"
import { literal } from "./manifest.js"

const VOICE_ID_LANG = "CN"

export const ENEMY_SPINE_ALIAS: Readonly<Record<string, string>> = Object.freeze({
  enemy_1305_mhslim: "enemy_1007_slime",
  enemy_1305_mhslim_2: "enemy_1007_slime",
})

const LOADING_USED: ReadonlySet<string> = new Set(["loading_ac_core", "loading_ac_prototype", "loading_ac_hard", "loading_ac_abyss"])

const PROFESSIONS: readonly string[] = ["caster", "medic", "pioneer", "sniper", "special", "support", "tank", "warrior"]

export const GUIDE_PAGES: readonly string[] = Object.freeze([
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) => `autochess_home_${index}`),
  ...[1, 2, 3, 4, 5, 6].map((index) => `autochess_shop_${index}`),
  ...[1, 2, 3, 4].map((index) => `autochess_handbook_${index}`),
])

export type UiExtra = readonly [group: string, key: string, path: string]

function buildUiExtras(): readonly UiExtra[] {
  const rows: UiExtra[] = []
  const modeChoice = "ui/autochess/[uc]autochessouter/modechoice/auto_chess_mode_choice_state/"
  for (const mode of ["normal", "hard", "abyss", "funny"]) rows.push(["modeChoice", `${mode}_rhodes_island`, `${modeChoice}${mode}_rhodes_island.png`])
  const battleReady = "ui/autochess/[uc]autochessouter/battleready/auto_chess_battle_ready_state/"
  for (const key of ["bg_mountain1", "bg_mountain2", "bg_terrain", "bg_ring", "rhodes", "rhodes_white", "rhodes_outline"]) {
    rows.push(["battleReady", key, `${battleReady}${key}.png`])
  }
  const battleNew = "arts/ui/[uc]battlecommon/ui_battle_new/"
  for (const key of ["btn_speed_1x", "btn_speed_2x", "btn_pause", "slider_hp_back", "slider_hp_fill", "attack_range_attack", "attack_range_stand"]) {
    rows.push(["battleUi", key, `${battleNew}${key}.png`])
  }
  rows.push(["battleUi", "boss_avatar_bg", `${battleNew}enemybossinfo/sprite_enemy_boss_avatar_bg.png`])
  rows.push(["battleUi", "skill_ready", "arts/ui/[uc]battlecommon/ui_battle/sprite_skill_ready.png"])
  rows.push(["skillIcon", "empty", "arts/ui/[uc]charcommon/skills/empty_skill.png"])
  rows.push(["skillIcon", "empty_large", "arts/ui/[uc]charcommon/skills/empty_skill_large.png"])
  rows.push(["entry", "season_logo_settle", "activity/[uc]act2autochess/arts/seasonlogo/season_logo_settle_game.png"])
  const effectChoose = "ui/autochess/[uc]autochessbattle/effectchoose/"
  for (const key of ["bg_circle", "bg_grad", "bottom", "deco_glow_top", "plus", "square_1", "square_2", "square_fill_1", "square_fill_2", "tip_glow", "tip_wait", "title"]) {
    rows.push(["effectChoose", key, `${effectChoose}autochess_battle_effect_choose_panel/${key}.png`])
  }
  for (const key of ["bg_normal", "bg_selected", "btn_bg", "btn_icon", "select_frame", "select_glow"]) {
    rows.push(["effectChoose", `card_${key}`, `${effectChoose}card_small_item/${key}.png`])
  }
  for (const key of ["head_bg", "head_outline"]) rows.push(["effectChoose", `avatar_${key}`, `${effectChoose}card_avatar_item/${key}.png`])
  const equipReplace = "ui/autochess/[uc]autochessbattle/equipreplace/equip_replace_dialog/equip_replace_"
  for (const key of ["bg", "arrow_head", "arrow_line", "avatart_bg", "avatart_frame", "close", "replace_icon", "opiton_bg"]) {
    rows.push(["equipReplace", key, `${equipReplace}${key}.png`])
  }
  const bondDetail = "ui/autochess/[uc]autochessbattle/hud/dialog/autochess_hud_bond_detail_dialog/"
  for (const key of ["active_icon", "active_stack_bg", "arrow", "detail_bg", "matte_circle", "title_char_icon"]) {
    rows.push(["bondDetail", key, `${bondDetail}${key}.png`])
  }
  const prepReady = "ui/autochess/[uc]autochessbattle/prepready/"
  for (const key of ["cancel_bg", "cancel_icon", "player_bg", "player_frame", "player_ready", "ready_bg", "ready_frame", "ready_icon"]) {
    rows.push(["prepReady", key, `${prepReady}panel_prep_ready/${key}.png`])
  }
  rows.push(["prepReady", "countdown_arrow", `${prepReady}countdown_arrow.png`])
  const stageInfo = "ui/autochess/[uc]autochessouter/stageinfo/auto_chess_stage_info_state/"
  for (const key of ["img_title_mode_abyss", "img_title_mode_funny", "img_title_mode_hard", "img_title_mode_normal", "btn_confirm", "btn_confirmed"]) {
    rows.push(["stageInfo", key, `${stageInfo}${key}.png`])
  }
  for (const emote of EMOTE_CATALOG) rows.push([`emoticon/${emote.dir}`, emote.picId, `ui/emoticon/theme/[uc]${emote.themeId}/icon/${emote.picId}.png`])
  for (const key of GUIDE_PAGES) rows.push(["guide", key, `arts/guidebookpages/[pack]autochess/${key}.png`])
  return Object.freeze(rows.map((row) => Object.freeze(row) as UiExtra))
}

export const UI_EXTRAS: readonly UiExtra[] = buildUiExtras()

const ARTS_GROUPS: Readonly<Record<string, string>> = Object.freeze({
  rarityStars: "rarity",
  rarityStarsYellow: "rarityYellow",
  eliteIcon: "elite",
  eliteIconLarge: "eliteLarge",
  campLogo: "campLogo",
  loadingIllust: "loading",
  battleCommon: "battle",
  act2Entry: "entry",
  itemRarityBg: "itemRarity",
})

function rec(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function field(value: unknown, key: string): unknown {
  const row = rec(value)
  if (!row || !Object.hasOwn(row, key)) return undefined
  return row[key]
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function entriesOf(value: unknown): [string, unknown][] {
  const row = rec(value)
  return row ? Object.entries(row) : []
}

function listOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}

export interface ManifestLeafNode {
  readonly alts: DownloadJob[]
}

function alt(rel: string, urls: unknown, bytes?: number): DownloadJob {
  const raw = Array.isArray(urls) ? urls : [urls]
  const list = raw.filter((url): url is string => typeof url === "string" && url.length > 0)
  const job: DownloadJob = { rel, urls: list, kind: kindOf(rel) satisfies AssetKind }
  if (typeof bytes === "number" && Number.isInteger(bytes) && bytes > 0) return { ...job, bytes }
  return job
}

function leaf(...parts: readonly unknown[]): ManifestLeafNode | null {
  const list: DownloadJob[] = []
  for (const item of parts.flat()) {
    if (!item || typeof item !== "object" || !("urls" in item)) continue
    const urls = (item as DownloadJob).urls
    if (!urls || !urls.length) continue
    list.push(item as DownloadJob)
  }
  return list.length ? { alts: list } : null
}

function voiceAlt(asset: string, lang: string): DownloadJob | null {
  const parts = String(asset).split("/")
  const charId = parts[0]
  const voiceId = parts[1]
  if (!charId || !voiceId || !/^[a-z0-9_]+$/i.test(charId) || !/^[a-z]{2}_\d+$/i.test(voiceId)) return null
  const folder = VOICE_DIRS[lang]
  if (!folder) return null
  const file = `${charId}/${voiceId.toLowerCase()}.mp3`
  return alt(`audio/voice/${lang}/${file}`, joinUrl(RAW_BASES.aa2voice, `${folder}/${file}`))
}

function soundAlt(path: string, sub = "sfx"): DownloadJob {
  const rel = `audio/${sub}/` + path.split("/").map(safeName).join("/")
  return alt(rel, joinUrl(RAW_BASES.aa2voice, path))
}

function soundLeaf(paths: readonly string[] | null | undefined, sub = "sfx", max = 4): ManifestLeafNode | null {
  return leaf((paths ?? []).slice(0, max).map((path) => soundAlt(path, sub)))
}

function urlsOf(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [typeof value === "string" ? value : field(value, "url")]
  return list.filter((item): item is string => typeof item === "string" && item.length > 0)
}

function bytesField(value: unknown): number | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const bytes = (value as { bytes?: unknown }).bytes
  return typeof bytes === "number" && Number.isInteger(bytes) ? bytes : undefined
}

function bytesOf(record: unknown, url: string): number | undefined {
  const row = rec(record)
  if (!row || row["url"] !== url) return undefined
  const bytes = row["bytes"]
  return typeof bytes === "number" && Number.isInteger(bytes) ? bytes : undefined
}

function skelStem(urlOrName: string): string {
  return safeName(urlBase(urlOrName).replace(/\.skel$/i, ""))
}

function walkKeys(node: unknown, add: (key: string) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walkKeys(item, add)
    return
  }
  const row = rec(node)
  if (!row) return
  const key = text(row["key"])
  if (key) add(key)
  for (const value of Object.values(row)) walkKeys(value, add)
}

export function skillIndicesByChar(ops03: unknown): Map<string, number[]> {
  const primary = new Map<string, number>()
  const all = new Map<string, Set<number>>()
  const add = (id: unknown, idx: unknown, isPrimary: boolean): void => {
    if (typeof id !== "string" || typeof idx !== "number" || !Number.isInteger(idx) || idx < 0) return
    let set = all.get(id)
    if (!set) {
      set = new Set()
      all.set(id, set)
    }
    set.add(idx)
    if (isPrimary && !primary.has(id)) primary.set(id, idx)
  }
  const chess = listOf(field(ops03, "chess"))
  for (const item of chess) {
    const row = rec(item)
    if (row?.["charId"]) add(row["charId"], row["defaultSkillIndex"], row["isGolden"] !== true)
  }
  for (const item of chess) {
    const backup = rec(field(item, "backup"))
    if (backup?.["charId"]) add(backup["charId"], backup["skillIndex"], true)
  }
  const out = new Map<string, number[]>()
  for (const [id, set] of all) {
    const first = primary.has(id) ? primary.get(id) : Math.min(...set)
    if (first === undefined) continue
    out.set(id, [first, ...[...set].filter((index) => index !== first).sort((a, b) => a - b)])
  }
  return out
}

export interface EnemyIdSources {
  readonly assets07: unknown
  readonly enemies05: unknown
  readonly maps05: unknown
  readonly ops03?: unknown
}

export function collectEnemyIds(sources: EnemyIdSources): string[] {
  const known = (id: string): boolean => !!(rec(field(sources.enemies05, "enemies"))?.[id] || rec(field(sources.assets07, "enemies"))?.[id])
  const set = new Set(Object.keys(rec(field(sources.assets07, "enemies")) ?? {}))
  const add = (key: unknown): void => {
    if (typeof key === "string" && /^enemy_\d+_[a-z0-9_]+$/i.test(key)) set.add(key)
  }
  for (const item of listOf(field(sources.ops03, "chess"))) {
    const row = rec(item)
    const kit = JSON.stringify([row?.["skill"] ?? null, row?.["talents"] ?? null, row?.["tokens"] ?? null])
    for (const match of kit.match(/enemy_\d+_[a-z0-9_]+/gi) ?? []) add(match)
  }
  for (const level of Object.values(rec(field(sources.maps05, "roundLevels")) ?? {})) {
    const row = rec(level)
    const usedBy = listOf(row?.["usedBy"]).map((item) => String(item))
    if (usedBy.length && usedBy.every((item) => item.startsWith("mode_training"))) continue
    for (const ref of listOf(row?.["enemyDbRefs"])) add(Array.isArray(ref) ? ref[0] : ref)
    walkKeys(row?.["waves"], add)
    walkKeys(row?.["branches"], add)
  }
  for (const boss of Object.values(rec(field(sources.enemies05, "bosses")) ?? {})) {
    const row = rec(boss)
    add(row?.["enemyId"])
    for (const spawn of listOf(row?.["spawns"])) add(spawn)
  }
  let changed = true
  const enemies = rec(field(sources.enemies05, "enemies"))
  while (changed) {
    changed = false
    for (const id of [...set]) {
      const enemy = rec(enemies?.[id])
      if (!enemy) continue
      const refs = new Set<string>(
        listOf(field(field(field(enemy, "ac"), "rand"), "spawns")).filter((item): item is string => typeof item === "string"),
      )
      const kit = JSON.stringify([enemy["skills"] ?? null, enemy["talent"] ?? null])
      for (const match of kit.match(/enemy_\d+_[a-z0-9_]+/gi) ?? []) refs.add(match)
      for (const ref of refs) {
        if (!set.has(ref) && known(ref)) {
          set.add(ref)
          changed = true
        }
      }
    }
  }
  return [...set].sort()
}

export interface BuildPlanInput {
  readonly assets07: unknown
  readonly ops03: unknown
  readonly enemies05: unknown
  readonly maps05: unknown
  readonly audio: AudioIndex
  readonly modelsData: unknown
  readonly charword?: unknown
  readonly voiceLang?: string
  readonly voiceSlots?: Iterable<string> | null
  readonly extraEnemyIds?: readonly string[]
  readonly extraTokenIds?: readonly string[]
  readonly extraHandbook?: Readonly<Record<string, string>>
  readonly localEnemySpines?: Readonly<Record<string, LocalSpineMeta>>
}

export interface AssetTemplate {
  readonly chars: Record<string, unknown>
  readonly enemies: Record<string, unknown>
  readonly tokens: Record<string, unknown>
  readonly bonds: Record<string, unknown>
  readonly items: Record<string, unknown>
  readonly bands: Record<string, unknown>
  readonly skills: Record<string, unknown>
  readonly skillsById: Record<string, unknown>
  readonly ui: Record<string, unknown>
  readonly prof: Record<string, unknown>
  readonly audio: {
    readonly bgm: Record<string, unknown>
    readonly bossBgm: Record<string, unknown>
    readonly voice: Record<string, unknown>
    readonly sfx: {
      readonly ui: Record<string, unknown>
      readonly battle: Record<string, unknown>
      readonly units: Record<string, unknown>
    }
  }
}

export interface AssetPlan {
  readonly template: AssetTemplate
  readonly models: Map<string, PlannedSpineModel>
  readonly notes: string[]
}

export function buildPlan(input: BuildPlanInput): AssetPlan {
  const notes: string[] = []
  const models = new Map<string, PlannedSpineModel>()
  const skillIdx = skillIndicesByChar(input.ops03)
  const audio = input.audio
  const voiceLang = input.voiceLang ?? "cn"
  const voiceSlots = input.voiceSlots === undefined ? VOICE_BATTLE_SLOTS : input.voiceSlots
  const extraEnemyIds = input.extraEnemyIds ?? []
  const extraTokenIds = input.extraTokenIds ?? []
  const extraHandbook = input.extraHandbook ?? {}
  const localEnemySpines = input.localEnemySpines ?? {}
  const assets07 = input.assets07
  const ops03 = input.ops03
  const enemies05 = input.enemies05
  const maps05 = input.maps05

  const addModel = (key: string, def: Omit<PlannedSpineModel, "key">): { readonly model: string } => {
    if (!models.has(key)) models.set(key, { key, ...def })
    return { model: key }
  }

  const fexliModel = (
    key: string,
    kind: string,
    dir: string,
    record: unknown,
    skillIndices: readonly number[],
  ): { readonly model: string } | null => {
    const skelUrls = urlsOf(field(record, "skel"))
    const atlasUrls = urlsOf(field(record, "atlas"))
    const pngUrls = urlsOf(field(record, "png"))
    const firstSkel = skelUrls[0]
    const firstAtlas = atlasUrls[0]
    const firstPng = pngUrls[0]
    if (!firstSkel || !firstAtlas || !firstPng) return null
    const stem = skelStem(firstSkel)
    const atlasJob = alt(`${dir}${stem}.atlas`, atlasUrls, bytesField(field(record, "atlas")))
    return addModel(key, {
      kind,
      dir,
      pma: false,
      skillIndices,
      baseUrl: urlDir(firstAtlas),
      skel: alt(`${dir}${stem}.skel`, skelUrls, bytesField(field(record, "skel"))),
      atlas: { ...atlasJob, mutable: true },
      pngs: [alt(dir + safeName(urlBase(firstPng)), pngUrls, bytesField(field(record, "png")))],
    })
  }

  // MARK: operators
  const chars: Record<string, unknown> = {}
  const skills: Record<string, unknown> = {}
  const skillsById: Record<string, unknown> = {}
  const unitsSfx: Record<string, unknown> = {}
  const charIds = Object.keys(rec(field(assets07, "operators")) ?? {}).sort()
  for (const id of charIds) {
    const operator = rec(rec(field(assets07, "operators"))?.[id]) ?? {}
    const idx0 = skillIdx.get(id) ?? [0]
    const more = listOf(operator["skills"])
      .map((item) => field(item, "index"))
      .filter((index): index is number => typeof index === "number" && Number.isInteger(index) && index >= 0 && !idx0.includes(index))
      .sort((a, b) => a - b)
    const idx = [...idx0, ...more]
    const card: Record<string, unknown> = {}
    const avatarE0 = field(field(operator, "avatar"), "e0e1")
    card["avatar"] = leaf(alt(`char/avatar/${id}.png`, text(field(avatarE0, "url")), bytesField(avatarE0)))
    const avatarE2 = text(field(field(operator, "avatar"), "e2") && field(field(field(operator, "avatar"), "e2"), "url"))
    if (avatarE2) {
      const record = field(field(operator, "avatar"), "e2")
      card["avatarE2"] = leaf(alt(`char/avatar/${id}_2.png`, avatarE2, bytesField(record)))
    }
    const portraitE0 = field(field(operator, "portrait"), "e0e1")
    card["portrait"] = leaf(alt(`char/portrait/${id}_1.png`, text(field(portraitE0, "url")), bytesField(portraitE0)))
    const portraitE2 = text(field(field(field(operator, "portrait"), "e2"), "url"))
    if (portraitE2) {
      const record = field(field(operator, "portrait"), "e2")
      card["portraitE2"] = leaf(alt(`char/portrait/${id}_2.png`, portraitE2, bytesField(record)))
    }
    const spine: Record<string, unknown> = {}
    const front = fexliModel(`op:${id}:front`, "op", `spine/op/${id}/front/`, field(field(operator, "battleSpine"), "front"), idx)
    if (front) spine["front"] = front
    else notes.push(`${id}: no Front battle Spine in research data`)
    const back = fexliModel(`op:${id}:back`, "op", `spine/op/${id}/back/`, field(field(operator, "battleSpine"), "back"), idx)
    if (back) spine["back"] = back
    card["spine"] = spine
    chars[id] = card
    const short = id.replace(/^char_\d+_/, "")
    const sfx = pickUnitSfx(audio.unitBanks.get(id), {
      operator: true,
      projectile: {
        born: audio.bank(`battle.ON_PROJECTILE_BORN.projectile_chr_${short}`),
        hit: audio.bank(`battle.ON_PROJECTILE_HIT.projectile_chr_${short}`),
      },
    })
    const sounded = unitSounds(audio, sfx)
    const skillSfx: Record<string, unknown> = {}
    for (const index of idx) {
      const skill = listOf(operator["skills"])
        .map(rec)
        .find((row) => row?.["index"] === index)
      if (!skill) {
        notes.push(`${id}: skill index ${index} missing in research data`)
        continue
      }
      const iconId = text(skill["iconId"]) || text(skill["skillId"])
      const icon = rec(skill["icon"])
      if (iconId && text(icon?.["url"]) && !skills[iconId]) {
        skills[iconId] = leaf(alt(`skill/${safeName(iconId)}.png`, text(icon?.["url"]), bytesField(icon)))
      }
      const skillId = text(skill["skillId"])
      if (skillId && iconId) skillsById[skillId] = iconId
      const start = skillId ? audio.skillBanks.get(skillId)?.get("ON_SKILL_START") : undefined
      if (start?.length) skillSfx[String(index)] = soundLeaf(start)
    }
    const roles = sounded.roles
    const primarySkill = skillSfx[String(idx[0] ?? 0)]
    if (primarySkill) roles["skill"] = primarySkill
    if (Object.keys(skillSfx).length > 1) roles["skills"] = skillSfx
    if (sounded.mix) roles["mix"] = sounded.mix
    if (Object.keys(roles).length) unitsSfx[id] = roles
  }

  // MARK: tokens
  const chessById = new Map<string, Record<string, unknown>>()
  for (const item of listOf(field(ops03, "chess"))) {
    const row = rec(item)
    const chessId = text(row?.["chessId"])
    if (row && chessId) chessById.set(chessId, row)
  }
  const tokens: Record<string, unknown> = {}
  const tokenIds = new Set(Object.keys(rec(field(assets07, "tokens")) ?? {}))
  for (const id of extraTokenIds) if (/^token_\d+_[a-z0-9_]+$/i.test(id)) tokenIds.add(id)
  for (const id of [...tokenIds].sort()) {
    const knownToken = rec(rec(field(assets07, "tokens"))?.[id])
    const token =
      knownToken ??
      ({
        avatar: { url: `${RAW_BASES.yuanyan}avatar/${id}.png` },
        battleSpineDefault: null,
        battleSpineSkinVariantsOnly: [id],
      } as Record<string, unknown>)
    const usedBy = listOf(field(field(field(ops03, "tokensUsedByPool"), id), "usedByChess"))
    const ownerChess = usedBy.map((chessId) => (typeof chessId === "string" ? chessById.get(chessId) : undefined)).find((row) => row)
    const backup = rec(ownerChess?.["backup"])
    const entry: Record<string, unknown> = { owner: text(ownerChess?.["charId"]) || text(backup?.["charId"]) || null }
    const avatar = rec(token["avatar"])
    entry["avatar"] = text(avatar?.["url"]) ? leaf(alt(`token/avatar/${id}.png`, text(avatar?.["url"]), bytesField(avatar))) : null
    let model: { readonly model: string } | null = null
    if (token["battleSpineDefault"]) {
      model = fexliModel(`token:${id}`, "token", `spine/token/${id}/`, token["battleSpineDefault"], [0])
    } else if (Array.isArray(token["battleSpineSkinVariantsOnly"]) && token["battleSpineSkinVariantsOnly"].length) {
      const variant = token["battleSpineSkinVariantsOnly"][0]
      if (typeof variant === "string") {
        const bases = ["Spine", "Front"].map(
          (folder) => `${RAW_BASES.fexli}spine/${encodeURIComponent(id)}/${encodeURIComponent(variant)}/${folder}/${encodeURIComponent(variant)}`,
        )
        model = fexliModel(
          `token:${id}`,
          "token",
          `spine/token/${id}/`,
          { skel: bases.map((base) => base + ".skel"), atlas: bases.map((base) => base + ".atlas"), png: bases.map((base) => base + ".png") },
          [0],
        )
        if (model) entry["spineVariant"] = variant
      }
    }
    entry["spine"] = model
    tokens[id] = entry
    const sounded = unitSounds(audio, pickUnitSfx(audio.unitBanks.get(id)))
    if (sounded.mix) sounded.roles["mix"] = sounded.mix
    if (Object.keys(sounded.roles).length) unitsSfx[id] = sounded.roles
  }

  // MARK: enemies
  const handbookOf = new Map<string, string>()
  for (const boss of Object.values(rec(field(enemies05, "bosses")) ?? {})) {
    const row = rec(boss)
    const enemyId = text(row?.["enemyId"])
    const handbookId = text(row?.["handbookId"])
    if (enemyId && handbookId && handbookId !== enemyId) handbookOf.set(enemyId, handbookId)
  }
  for (const [enemyId, handbookId] of Object.entries(extraHandbook)) {
    if (handbookId !== enemyId && !handbookOf.has(enemyId)) handbookOf.set(enemyId, handbookId)
  }
  const modelRoot = rec(input.modelsData)
  const modelData = rec(modelRoot?.["data"]) ?? {}
  const enemyStorage = text(field(field(modelRoot, "storageDirectory"), "Enemy")) || "models_enemies"
  const pick = (value: unknown): unknown => {
    if (!Array.isArray(value)) return value
    return value.find((item) => typeof item === "string" && !item.includes("$")) ?? value[0]
  }
  const arkModel = (enemyId: string): { readonly model: string } | null => {
    const key = enemyId.replace(/^enemy_/, "")
    const assetList = rec(field(rec(modelData[key]), "assetList"))
    const skel = pick(assetList?.[".skel"])
    const atlas = pick(assetList?.[".atlas"])
    const png = pick(assetList?.[".png"])
    if (typeof skel !== "string" || typeof atlas !== "string" || typeof png !== "string" || !skel || !atlas || !png) return null
    const base = `${RAW_BASES.arkModels}${enemyStorage}/${encodeURIComponent(key)}/`
    const research = field(rec(rec(field(assets07, "enemies"))?.[enemyId]), "battleSpine")
    const dir = `spine/enemy/${enemyId}/`
    const stem = skelStem(skel)
    const make = (file: string, record: unknown, rel?: string): DownloadJob =>
      alt(rel ?? dir + safeName(file), base + encodeURIComponent(file), bytesOf(record, base + encodeURIComponent(file)))
    const atlasJob = make(atlas, field(research, "atlas"), `${dir}${stem}.atlas`)
    return addModel(`enemy:${enemyId}`, {
      kind: "enemy",
      dir,
      pma: true,
      skillIndices: [0],
      baseUrl: base,
      skel: make(skel, field(research, "skel"), `${dir}${stem}.skel`),
      atlas: { ...atlasJob, mutable: true },
      pngs: [make(png, field(research, "png"))],
    })
  }
  const baseIdOf = (enemyId: string): string | null => {
    const match = /^(enemy_\d+_[a-z0-9]+?)_\d+$/i.exec(enemyId)
    return match?.[1] ?? null
  }
  const enemyIdSet = new Set(collectEnemyIds({ assets07, enemies05, maps05, ops03 }))
  for (const id of extraEnemyIds) if (/^enemy_\d+_[a-z0-9_]+$/i.test(id)) enemyIdSet.add(id)
  for (const handbookId of handbookOf.values()) if (/^enemy_\d+_[a-z0-9_]+$/i.test(handbookId)) enemyIdSet.add(handbookId)
  const enemies: Record<string, unknown> = {}
  for (const id of [...enemyIdSet].sort()) {
    const enemy: Record<string, unknown> = {}
    const icon07 = field(rec(rec(field(assets07, "enemies"))?.[id]), "icon")
    const iconAlts = [alt(`enemy/icon/${id}.png`, `${RAW_BASES.yuanyan}enemy/${id}.png`, bytesOf(icon07, `${RAW_BASES.yuanyan}enemy/${id}.png`))]
    for (const other of [handbookOf.get(id), baseIdOf(id)]) if (other) iconAlts.push(alt(`enemy/icon/${id}.png`, `${RAW_BASES.yuanyan}enemy/${other}.png`))
    enemy["icon"] = leaf(iconAlts)
    let spine = arkModel(id)
    if (!spine) {
      const seen = new Set([id])
      const queue = [ENEMY_SPINE_ALIAS[id], baseIdOf(id), handbookOf.get(id)].filter((item): item is string => !!item)
      while (!spine && queue.length) {
        const candidate = queue.shift()
        if (!candidate || seen.has(candidate)) continue
        seen.add(candidate)
        spine = arkModel(candidate)
        if (spine) enemy["spineAliasOf"] = candidate
        else queue.push(...[ENEMY_SPINE_ALIAS[candidate], baseIdOf(candidate), handbookOf.get(candidate)].filter((item): item is string => !!item))
      }
      if (!spine) notes.push(`${id}: no enemy Spine upstream (client draws the icon, if any, or a glyph)`)
      else notes.push(`${id}: Spine aliased to ${String(enemy["spineAliasOf"])}`)
    }
    enemy["spine"] = spine
    const local = Object.hasOwn(localEnemySpines, id) ? localEnemySpines[id] : null
    if (local && typeof local === "object") {
      enemy["spineLocal"] = literal({ group: `spine/enemy/${id}`, ...local })
      notes.push(`${id}: official Spine from the local client when extracted (spineLocal)`)
    }
    enemies[id] = enemy
    let banks = audio.unitBanks.get(id)
    for (const other of [handbookOf.get(id), text(enemy["spineAliasOf"]), baseIdOf(id)]) {
      if (banks?.size) break
      if (other) banks = audio.unitBanks.get(other)
    }
    const sounded = unitSounds(audio, pickUnitSfx(banks))
    if (sounded.mix) sounded.roles["mix"] = sounded.mix
    if (Object.keys(sounded.roles).length) unitsSfx[id] = sounded.roles
  }

  // MARK: bonds, items, bands, professions
  const bonds: Record<string, unknown> = {}
  for (const [bondId, bond] of entriesOf(field(assets07, "bonds"))) {
    const row = rec(bond)
    const icon = rec(row?.["icon"])
    bonds[bondId] = leaf(
      alt(`bond/${bondId}.png`, text(icon?.["url"]), bytesField(icon)),
      text(row?.["fallbackCampLogo"]) ? alt(`bond/${bondId}.png`, text(row?.["fallbackCampLogo"])) : null,
    )
  }
  const items: Record<string, unknown> = {}
  for (const [trapId, item] of entriesOf(field(assets07, "items"))) {
    const icon = rec(field(item, "icon"))
    items[trapId] = leaf(alt(`item/${trapId}.png`, text(icon?.["url"]), bytesField(icon)))
  }
  const bands: Record<string, unknown> = {}
  for (const [bandId, band] of entriesOf(field(assets07, "bands"))) {
    const icon = rec(field(band, "icon"))
    bands[bandId] = leaf(alt(`band/${bandId}.png`, text(icon?.["url"]), bytesField(icon)))
  }
  const prof: Record<string, unknown> = { icon: {}, large: {}, battlecard: {}, sub: {} }
  const profIcon = rec(prof["icon"]) ?? {}
  const profLarge = rec(prof["large"]) ?? {}
  const profCard = rec(prof["battlecard"]) ?? {}
  const profSub = rec(prof["sub"]) ?? {}
  for (const profession of PROFESSIONS) {
    const icon = field(field(field(assets07, "arts"), "professionIcon"), profession)
    if (typeof icon === "string" && icon) profIcon[profession] = leaf(alt(`prof/icon_${profession}.png`, icon))
    const large = field(field(field(assets07, "arts"), "professionIconLargeWhite"), profession)
    if (typeof large === "string" && large) profLarge[profession] = leaf(alt(`prof/large_${profession}.png`, large))
  }
  for (const profession of [...PROFESSIONS, "token"]) {
    profCard[profession] = leaf(
      alt(`prof/battlecard_${profession}.png`, joinUrl(RAW_BASES.aa2, `arts/ui/[uc]battlecommon/ui_battle_new/battlecard/icon_profession_${profession}.png`)),
    )
  }
  for (const operator of Object.values(rec(field(assets07, "operators")) ?? {})) {
    const row = rec(operator)
    const sub = text(row?.["subProfessionId"])
    if (sub && !profSub[sub] && row?.["subProfessionIcon"]) profSub[sub] = leaf(alt(`prof/sub/${safeName(sub)}.png`, row["subProfessionIcon"]))
  }

  // MARK: ui
  const ui: Record<string, unknown> = {}
  const addUi = (group: string, key: string, url: unknown): void => {
    const name = `${group}/${safeName(key)}`
    if (!ui[name] && typeof url === "string" && url) ui[name] = leaf(alt(`ui/${group}/${safeName(key)}.png`, url))
  }
  for (const [group, entries] of entriesOf(field(assets07, "autochessUi"))) {
    for (const [key, url] of entriesOf(entries)) addUi(group, key, url)
  }
  const nations = new Set(
    Object.values(rec(field(assets07, "operators")) ?? {})
      .map((operator) => text(field(operator, "nationId")))
      .filter((nation): nation is string => !!nation),
  )
  const logos = new Set(["logo_rhodes", ...[...nations].map((nation) => `logo_${nation}`)])
  for (const bond of Object.values(rec(field(assets07, "bonds")) ?? {})) {
    const logo = text(field(bond, "fallbackCampLogo"))
    if (logo) logos.add(urlBase(logo).replace(/\.png$/i, ""))
  }
  for (const [src, group] of Object.entries(ARTS_GROUPS)) {
    for (const [key, url] of entriesOf(field(field(assets07, "arts"), src))) {
      if (src === "campLogo" && !logos.has(key)) continue
      if (src === "loadingIllust" && !LOADING_USED.has(key)) continue
      addUi(group, key, url)
    }
  }
  for (const [group, key, path] of UI_EXTRAS) addUi(group, key, joinUrl(RAW_BASES.aa2, path))

  // MARK: audio
  const bgmLeaf = (bankName: string): Record<string, unknown> | null => {
    const track = audio.bgm(bankName)
    if (!track?.loop) {
      notes.push(`BGM bank ${bankName} not found`)
      return null
    }
    const out: Record<string, unknown> = { loop: soundLeaf([track.loop], "bgm", 1) }
    if (track.intro) out["intro"] = soundLeaf([track.intro], "bgm", 1)
    return out
  }
  const flatBgm = (node: Record<string, unknown> | null): Record<string, unknown> | null => {
    if (!node) return node
    for (const key of Object.keys(node)) {
      const row = node[key]
      if (!row || typeof row !== "object" || !("alts" in row) || !Array.isArray(row.alts)) continue
      for (const item of row.alts) {
        if (!item || typeof item !== "object" || !("rel" in item) || typeof item.rel !== "string") continue
        item.rel = "audio/bgm/" + safeName(String(item.rel.split("/").pop()))
      }
    }
    return node
  }
  const unite = flatBgm(bgmLeaf("battle.ON_GAME_READY.corrosion"))
  const combatAlts = ["battle.ON_GAME_READY.bat_kazimierz2_1", "battle.ON_GAME_READY.bat_kazimierz2_2"]
    .map((name) => flatBgm(bgmLeaf(name)))
    .filter((row): row is Record<string, unknown> => row !== null)
  const bgm: Record<string, unknown> = {
    lobby: flatBgm(bgmLeaf("sys.ON_ACTIVITY_LOADED.act2autochess")),
    prep: flatBgm(bgmLeaf("battle.ON_GAME_READY.act1autochess_shop")),
    combat: flatBgm(bgmLeaf("battle.ON_GAME_READY.act1autochess_shop")),
    boss: flatBgm(bgmLeaf("battle.ON_GAME_READY.rglk1phantomcastle")),
  }
  if (combatAlts.length) bgm["combatAlts"] = combatAlts
  if (unite) bgm["unite"] = unite
  const bossBgm: Record<string, unknown> = {}
  for (const level of Object.values(rec(field(maps05, "roundLevels")) ?? {})) {
    const row = rec(level)
    const track = text(row?.["bgm"])
    if (!track) continue
    for (const used of listOf(row?.["usedBy"])) {
      const match = /\(boss:(boss_\d+)\)/.exec(String(used))
      const bossId = match?.[1]
      if (bossId && !bossBgm[bossId] && !String(used).startsWith("mode_training")) {
        bossBgm[bossId] = flatBgm(bgmLeaf(`battle.ON_GAME_READY.${track}`))
      }
    }
  }
  const sfxUi: Record<string, unknown> = {}
  for (const [name, spec] of Object.entries(UI_SFX)) {
    const row = soundLeaf(resolveSpec(spec, audio.bank))
    if (row) sfxUi[name] = row
    else notes.push(`UI SFX ${name}: no sound`)
  }
  const sfxBattle: Record<string, unknown> = {}
  for (const [name, spec] of Object.entries(BATTLE_SFX)) {
    const row = soundLeaf(resolveSpec(spec, audio.bank))
    if (row) sfxBattle[name] = row
    else notes.push(`battle SFX ${name}: no sound`)
  }

  // MARK: voice
  const voice: Record<string, unknown> = {}
  for (const [charId, slots] of indexVoice(input.charword ?? null, VOICE_ID_LANG, voiceSlots)) {
    if (!chars[charId]) continue
    const linesBySlot: Record<string, unknown> = {}
    for (const [slot, assets] of Object.entries(slots)) {
      const lines = assets.map((asset) => leaf(voiceAlt(asset, voiceLang))).filter((row): row is ManifestLeafNode => row !== null)
      if (!lines.length) continue
      const only = lines[0]
      linesBySlot[slot] = lines.length === 1 && only ? only : lines
    }
    if (Object.keys(linesBySlot).length) voice[charId] = linesBySlot
  }
  if (!Object.keys(voice).length) notes.push("battle voice: charword_table.json has no slots (index missing?)")

  const template: AssetTemplate = {
    chars,
    enemies,
    tokens,
    bonds,
    items,
    bands,
    skills,
    skillsById,
    ui,
    prof,
    audio: {
      bgm,
      bossBgm: Object.fromEntries(Object.entries(bossBgm).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))),
      voice,
      sfx: { ui: sfxUi, battle: sfxBattle, units: unitsSfx },
    },
  }
  return { template, models, notes }
}

function unitSounds(audio: AudioIndex, sfx: UnitSfx): { readonly roles: Record<string, unknown>; readonly mix: Record<string, BankMix> | null } {
  const roles: Record<string, unknown> = {}
  let mix: Record<string, BankMix> | null = null
  for (const role of ["attack", "hit", "die", "born"] as const) {
    const paths = sfx[role]
    if (!paths) continue
    roles[role] = soundLeaf(paths)
    const row = audio.mixOf(paths)
    if (!row) continue
    if (!mix) mix = {}
    mix[role] = row
  }
  return { roles, mix }
}
