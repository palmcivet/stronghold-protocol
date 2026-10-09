// 全量基础需求：按官方 gamedata 表列出全部干员、皮肤、召唤物与敌人的图与 Spine，全部为可选。

import type { Need } from "arknights-assets-catalog"
import { safeName } from "arknights-assets-extractor"
import { listOf, needOf, recordOf, textOf, uniqueNeeds } from "#compiler/media/need/input.js"

/** gamedata tables only the full base needs read, relative to `zh_CN/gamedata/`. */
export const FULL_GAMEDATA_TABLES: readonly string[] = Object.freeze(["excel/skin_table.json"])

/** Parsed gamedata tables from the extractor cache; a table that is not extracted yet is null. */
export interface FullTables {
  readonly characters: unknown | null
  readonly skills: unknown | null
  readonly skins: unknown | null
  readonly handbook: unknown | null
  readonly enemyDatabase: unknown | null
}

export interface FullNeeds {
  readonly needs: readonly Need[]
  /** Every operator of `character_table`, for the voice needs. */
  readonly operatorIds: readonly string[]
}

const NON_OPERATOR_PROFESSIONS: ReadonlySet<string> = new Set(["TOKEN", "TRAP"])
const KEY_SEGMENT = /^[A-Za-z0-9_-]+$/

function isOperator(id: string, row: Readonly<Record<string, unknown>>): boolean {
  return id.startsWith("char_") && !NON_OPERATOR_PROFESSIONS.has(textOf(row["profession"]) ?? "")
}

function isToken(id: string, row: Readonly<Record<string, unknown>>): boolean {
  return id.startsWith("token_") || textOf(row["profession"]) === "TOKEN"
}

function operatorNeeds(id: string, row: Readonly<Record<string, unknown>>, skills: Readonly<Record<string, unknown>>): Need[] {
  const needs: Need[] = [
    needOf("image", `char/avatar/${id}`, false),
    needOf("image", `char/portrait/${id}_1`, false),
    needOf("spine", `char/${id}/front`, false),
    needOf("spine", `char/${id}/back`, false),
  ]
  if (listOf(row["phases"]).length >= 3) {
    needs.push(needOf("image", `char/avatar/${id}_2`, false), needOf("image", `char/portrait/${id}_2`, false))
  }
  const subProfession = textOf(row["subProfessionId"])
  if (subProfession) needs.push(needOf("image", `prof/sub/${safeName(subProfession)}`, false))
  for (const skill of listOf(row["skills"])) {
    const skillId = textOf(recordOf(skill)["skillId"])
    if (!skillId) continue
    const iconId = textOf(recordOf(skills[skillId])["iconId"]) ?? skillId
    needs.push(needOf("image", `skill/${safeName(iconId)}`, false))
  }
  return needs
}

/** Battle Spine of every skin that replaces the default model: `spine:skin/<skin>/<pose>` for operators, a variant for summons. */
function skinNeeds(skins: unknown, operators: ReadonlySet<string>, tokens: ReadonlySet<string>): Need[] {
  const needs: Need[] = []
  for (const skin of Object.values(recordOf(recordOf(skins)["charSkins"]))) {
    const row = recordOf(skin)
    const charId = textOf(row["charId"])
    const model = textOf(recordOf(row["battleSkin"])["skinOrPrefabId"])
    if (!charId || !model || model === "DefaultSkin") continue
    const name = safeName(model)
    if (!KEY_SEGMENT.test(name)) continue
    if (operators.has(charId)) needs.push(needOf("spine", `skin/${name}/front`, false), needOf("spine", `skin/${name}/back`, false))
    else if (tokens.has(charId)) needs.push(needOf("spine", `token/${charId}/${name}`, false))
  }
  return needs
}

/** Icon of every handbook enemy, and the Spine of every enemy model (the `prefabKey` of each enemy). */
function enemyNeeds(handbook: unknown, enemyDatabase: unknown): Need[] {
  const needs: Need[] = []
  for (const id of Object.keys(recordOf(recordOf(handbook)["enemyData"]))) needs.push(needOf("image", `enemy/icon/${safeName(id)}`, false))
  for (const enemy of listOf(recordOf(enemyDatabase)["enemies"])) {
    const row = recordOf(enemy)
    const data = recordOf(recordOf(listOf(row["Value"])[0])["enemyData"])
    const prefab = textOf(recordOf(data["prefabKey"])["m_value"]) ?? textOf(row["Key"])
    if (prefab) needs.push(needOf("spine", `enemy/${safeName(prefab)}`, false))
  }
  return needs
}

/** Optional needs for everything the official tables list. Tables that are not extracted yet contribute nothing. */
export function fullBaseNeeds(tables: FullTables): FullNeeds {
  const characters = recordOf(tables.characters)
  const skills = recordOf(tables.skills)
  const needs: Need[] = []
  const operatorIds: string[] = []
  const tokenIds: string[] = []
  for (const id of Object.keys(characters).sort()) {
    const row = recordOf(characters[id])
    if (isOperator(id, row)) {
      operatorIds.push(id)
      needs.push(...operatorNeeds(id, row, skills))
    } else if (isToken(id, row)) {
      tokenIds.push(id)
      needs.push(needOf("image", `token/icon/${id}`, false), needOf("spine", `token/${id}/front`, false))
    }
  }
  if (tables.skins) needs.push(...skinNeeds(tables.skins, new Set(operatorIds), new Set(tokenIds)))
  needs.push(...enemyNeeds(tables.handbook, tables.enemyDatabase))
  return { needs: uniqueNeeds(needs), operatorIds }
}
