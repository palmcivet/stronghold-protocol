// 基础包需求：不绑定模式的基础信息（干员、召唤物、敌人、基础界面与音效、字体），以及打包与推导所需的 gamedata 表。

import type { Need } from "arknights-assets-catalog"
import { safeName, FONTS } from "arknights-assets-extractor"
import { indexVoice, pickUnitSfx, type AudioIndex } from "#compiler/media/need/audio-bank.js"
import { ENEMY_SPINE_ALIAS, collectEnemyIds, handbookIdsOf } from "#compiler/media/need/enemy-ids.js"
import { listOf, needOf, recordOf, soundNeeds, tableNeeds, textOf, uniqueNeeds, type NeedContext } from "#compiler/media/need/input.js"

/** gamedata tables the packet compile reads, relative to `zh_CN/gamedata/`. */
export const GAMEDATA_TABLES: readonly string[] = Object.freeze([
  "excel/activity_table.json",
  "excel/character_table.json",
  "excel/skill_table.json",
  "excel/range_table.json",
  "excel/uniequip_table.json",
  "excel/battle_equip_table.json",
  "excel/enemy_handbook_table.json",
  "excel/display_meta_table.json",
  "excel/item_table.json",
  "excel/audio_data.json",
  "excel/charword_table.json",
  "levels/enemydata/enemy_database.json",
])

/** Ids of the professions with a badge in the upstream arts. */
export const PROFESSIONS: readonly string[] = Object.freeze(["caster", "medic", "pioneer", "sniper", "special", "support", "tank", "warrior"])

/** Base namespaces that the path tables supply. `image:skill/empty` also covers `skill/empty_large`. */
const BASE_IMAGE_PREFIXES: readonly string[] = Object.freeze(["image:battle/common/", "image:camp/", "image:prof/", "image:rank/", "image:skill/empty"])
const BASE_AUDIO_PREFIXES: readonly string[] = Object.freeze(["audio:sfx/battle/", "audio:sfx/ui/"])

/** Gamedata table keys for the given relative paths. These keys are only read by the build and are never published. */
export function gamedataNeeds(relatives: readonly string[]): Need[] {
  return relatives.map((rel) => needOf("json", `gamedata/${rel.slice(0, -".json".length)}`, true))
}

/** Base needs for every operator, summon, enemy and shared resource. `audio` is null until the audio tables are extracted. */
export function baseNeeds(context: NeedContext): Need[] {
  const { research } = context
  const assets07 = recordOf(research.assets07)
  const operators = recordOf(assets07["operators"])
  const needs: Need[] = [...gamedataNeeds(GAMEDATA_TABLES)]
  const operatorIds = Object.keys(operators).sort()

  for (const id of operatorIds) {
    const row = recordOf(operators[id])
    const avatar = recordOf(row["avatar"])
    const portrait = recordOf(row["portrait"])
    const spine = recordOf(row["battleSpine"])
    needs.push(needOf("image", `char/avatar/${id}`, true))
    if (avatar["e2"]) needs.push(needOf("image", `char/avatar/${id}_2`, false))
    needs.push(needOf("image", `char/portrait/${id}_1`, true))
    if (portrait["e2"]) needs.push(needOf("image", `char/portrait/${id}_2`, false))
    needs.push(needOf("spine", `char/${id}/front`, !!spine["front"]))
    if (spine["back"]) needs.push(needOf("spine", `char/${id}/back`, false))
    const subProfession = textOf(row["subProfessionId"])
    if (subProfession) needs.push(needOf("image", `prof/sub/${safeName(subProfession)}`, false))
    for (const skill of listOf(row["skills"])) {
      const iconId = textOf(recordOf(skill)["iconId"]) ?? textOf(recordOf(skill)["skillId"])
      if (iconId) needs.push(needOf("image", `skill/${safeName(iconId)}`, false))
    }
  }

  for (const profession of PROFESSIONS) needs.push(needOf("image", `prof/${profession}`, false))

  const tokenIds = new Set([...researchTokenIds(assets07), ...context.packet.tokenIds])
  for (const id of [...tokenIds].sort()) {
    needs.push(needOf("image", `token/icon/${id}`, false))
    needs.push(needOf("spine", `token/${id}/front`, false))
    for (const variant of listOf(recordOf(recordOf(assets07["tokens"])[id])["battleSpineSkinVariantsOnly"])) {
      const name = textOf(variant)
      if (name && /^[A-Za-z0-9_-]+$/.test(name)) needs.push(needOf("spine", `token/${id}/${name}`, false))
    }
  }

  const handbookOf = new Map([...handbookIdsOf(research.enemies05), ...context.packet.handbookOf])
  const enemyIds = new Set(collectEnemyIds({ assets07, enemies05: research.enemies05, maps05: research.maps05, ops03: research.ops03 }))
  for (const id of context.packet.enemyIds) enemyIds.add(id)
  for (const handbookId of handbookOf.values()) enemyIds.add(handbookId)
  for (const id of [...enemyIds].sort()) {
    needs.push(needOf("image", `enemy/icon/${id}`, false))
    const spineId = context.packet.spineOf.get(id) ?? id
    needs.push(needOf("spine", `enemy/${spineId}`, false))
    const alias = ENEMY_SPINE_ALIAS[spineId]
    if (alias) needs.push(needOf("spine", `enemy/${alias}`, false))
  }

  for (const name of Object.keys(recordOf(recordOf(assets07["arts"])["itemRarityBg"]))) {
    needs.push(needOf("image", `item/rarity/${safeName(name)}`, false))
  }

  for (const path of Object.keys(FONTS)) needs.push({ key: path as Need["key"], required: true })
  needs.push(...tableNeeds(context.arknightsAssets, BASE_IMAGE_PREFIXES))
  needs.push(...tableNeeds(context.voice, BASE_AUDIO_PREFIXES))

  if (context.audio) needs.push(...unitSoundNeeds(context, context.audio, operatorIds, enemyIds, handbookOf, tokenIds))
  if (context.charword) needs.push(...voiceNeeds(context, operatorIds))

  return uniqueNeeds(needs)
}

/** Summon ids of the research table. An entry without a name is not an official summon and is left out. */
export function researchTokenIds(assets07: unknown): string[] {
  const tokens = recordOf(recordOf(assets07)["tokens"])
  return Object.keys(tokens).filter((id) => textOf(recordOf(tokens[id])["name"]) !== null)
}

/** Voice lines of the operators, limited to the slots of the context. Needs the charword table. */
export function voiceNeeds(context: NeedContext, operatorIds: readonly string[]): Need[] {
  const operators = new Set(operatorIds)
  const out: Need[] = []
  for (const [charId, slots] of indexVoice(context.charword, "CN", context.voiceSlots)) {
    if (!operators.has(charId)) continue
    for (const assets of Object.values(slots)) {
      for (const asset of assets) {
        const [assetChar, voiceId] = asset.split("/")
        if (assetChar !== charId || !voiceId || !/^[a-z]{2}_\d+$/i.test(voiceId)) continue
        out.push(needOf("audio", `voice/${context.voiceLang}/${charId}/${voiceId.toLowerCase()}`, false))
      }
    }
  }
  return out
}

function unitSoundNeeds(
  context: NeedContext,
  audio: AudioIndex,
  operatorIds: readonly string[],
  enemyIds: ReadonlySet<string>,
  handbookOf: ReadonlyMap<string, string>,
  tokenIds: ReadonlySet<string>,
): Need[] {
  const out: Need[] = []
  const addSounds = (sfx: ReturnType<typeof pickUnitSfx>): void => {
    for (const paths of [sfx.attack, sfx.hit, sfx.die, sfx.born]) out.push(...soundNeeds(paths, "battle"))
  }
  const operators = recordOf(recordOf(context.research.assets07)["operators"])
  for (const id of operatorIds) {
    const short = id.replace(/^char_\d+_/, "")
    addSounds(
      pickUnitSfx(audio.unitBanks.get(id), {
        operator: true,
        projectile: {
          born: audio.bank(`battle.ON_PROJECTILE_BORN.projectile_chr_${short}`),
          hit: audio.bank(`battle.ON_PROJECTILE_HIT.projectile_chr_${short}`),
        },
      }),
    )
    for (const skill of listOf(recordOf(operators[id])["skills"])) {
      const skillId = textOf(recordOf(skill)["skillId"])
      if (skillId) out.push(...soundNeeds(audio.skillBanks.get(skillId)?.get("ON_SKILL_START"), "battle"))
    }
  }
  for (const id of enemyIds) {
    const banks = audio.unitBanks.get(id) ?? audio.unitBanks.get(handbookOf.get(id) ?? "") ?? audio.unitBanks.get(ENEMY_SPINE_ALIAS[id] ?? "")
    addSounds(pickUnitSfx(banks))
  }
  for (const id of tokenIds) addSounds(pickUnitSfx(audio.unitBanks.get(id)))
  return out
}
