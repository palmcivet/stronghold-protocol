// 从官方 display / activity / item 表编译对局表情清单，写到 product/season/<id>/emotes.json。

import { setTimeout as delay } from "node:timers/promises"
import { join, resolve } from "node:path"
import { CatalogReadError, type CatalogFiles, type CatalogHttp } from "arknights-assets-catalog"
import { dataWorkspace } from "#compiler/workspace.js"

const workspace = dataWorkspace()
const GAMEDATA_URL = "https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/"
const SCENE = "AUTOCHESS_BATTLE"

export const THEME_DIRS: Readonly<Record<string, string>> = Object.freeze({
  emoticon_autochess_basic: "basic",
  emoticon_originium_slug: "slug",
  emoticon_autochess_basic_2: "basic_2",
  emoticon_foolsday_doctor: "fooldoctor",
  emoticon_foolsday_amiya: "foolamiya",
  emoticon_foolsday_wisdel: "foolwisdel",
})

export const EMOTE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  autochess_battle_happy: "开心",
  autochess_battle_scared: "害怕",
  autochess_battle_sorry: "对不起",
  autochess_battle_thanks: "谢谢",
  autochess_battle_thinking: "思考",
  autochess_battle_nice_cooperate: "合作愉快",
  autochess_battle_noproblem: "没问题！",
  autochess_battle_respect: "敬礼！",
  autochess_battle_call: "欢呼！",
  autochess_battle_playingcool: "酷！",
  autochess_battle_sad: "伤心",
  autochess_battle_dying: "快死了",
  slug_autochess_battle_nice_work: "合作愉快！",
  slug_autochess_battle_thanks: "谢谢！",
  slug_autochess_battle_sorry: "对不起！",
  slug_autochess_battle_bye: "再见！",
  slug_autochess_battle_distrust: "？？？",
  slug_autochess_battle_very_soon: "很快就好！",
})

export interface EmoteThemeRecord {
  readonly themeId: string
  readonly dir: string
  readonly sortId: number | null
  readonly isBasic: boolean
  readonly name: string
  readonly emotes: readonly string[]
}

export interface EmoteRecord {
  readonly id: string
  readonly themeId: string
  readonly sortId: number
  readonly picId: string
  readonly art: string
  readonly label: string
}

export interface EmoteDocument {
  readonly version: number
  readonly source: string
  readonly chatCD: number | null
  readonly chatTime: number | null
  readonly themes: readonly EmoteThemeRecord[]
  readonly emotes: readonly EmoteRecord[]
}

export interface EmoteBuild {
  readonly doc: EmoteDocument
  readonly warnings: readonly string[]
}

function record(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function field(value: unknown, key: string): unknown {
  const row = record(value)
  if (!row || !Object.hasOwn(row, key)) return undefined
  return row[key]
}

function themeDir(themeId: string): string {
  return THEME_DIRS[themeId] ?? themeId.replace(/^emo?ticon_(autochess_)?/, "")
}

function shortName(name: string, themeId: string): string {
  return String(name || themeId).replace(/^表情套组[：:]/, "")
}

interface EmojiRow {
  readonly id: string
  readonly sortId: number
  readonly picId: string
  readonly desc: unknown
}

export function buildEmotes(source: { readonly display: unknown; readonly activity: unknown; readonly items?: unknown }): EmoteBuild {
  const warnings: string[] = []
  const emoticon = record(field(source.display, "emoticonData"))
  const autoChess = record(field(source.activity, "autoChessData"))
  const emojiData = record(emoticon?.["emojiDataDict"])
  const themeData = record(emoticon?.["emoticonThemeDataDict"])
  if (!emojiData || !themeData) throw new Error("display_meta_table: emoticonData missing")
  const enabled = autoChess?.["enabledEmoticonThemeIdList"]
  if (!Array.isArray(enabled)) throw new Error("activity_table: autoChessData.enabledEmoticonThemeIdList missing")
  const themeTypes = record(emoticon?.["emoticonThemeTypeDict"])
  const themes: EmoteThemeRecord[] = []
  const emotes: EmoteRecord[] = []
  const seenIds = new Set<string>()
  const seenDirs = new Set<string>()
  for (const themeId of enabled) {
    if (typeof themeId !== "string") continue
    if (themes.some((theme) => theme.themeId === themeId)) {
      warnings.push(`theme ${themeId}: listed twice, kept once`)
      continue
    }
    const ids = Object.hasOwn(themeData, themeId) ? themeData[themeId] : null
    if (!Array.isArray(ids)) {
      warnings.push(`theme ${themeId}: not in emoticonThemeDataDict`)
      continue
    }
    const type = (themeTypes && Object.hasOwn(themeTypes, themeId) ? record(themeTypes[themeId]) : null) ?? {}
    const rows = ids
      .map((id): EmojiRow | null => {
        if (typeof id !== "string" || !emojiData || !Object.hasOwn(emojiData, id)) return null
        const row = record(emojiData[id])
        if (!row || row["type"] !== SCENE || typeof row["id"] !== "string" || typeof row["picId"] !== "string" || !row["picId"]) return null
        const sortId = typeof row["sortId"] === "number" ? row["sortId"] : 0
        return { id: row["id"], sortId, picId: row["picId"], desc: row["desc"] }
      })
      .filter((row): row is EmojiRow => row !== null)
      .filter((row) => {
        if (seenIds.has(row.id)) {
          warnings.push(`${row.id}: already on an earlier page, not repeated in ${themeId}`)
          return false
        }
        seenIds.add(row.id)
        return true
      })
      .sort((a, b) => a.sortId - b.sortId || (a.id < b.id ? -1 : 1))
    if (!rows.length) {
      warnings.push(`theme ${themeId}: no ${SCENE} emoji`)
      continue
    }
    const dir = themeDir(themeId)
    if (seenDirs.has(dir)) throw new Error(`theme ${themeId}: art dir emoticon/${dir} is already used by another theme`)
    seenDirs.add(dir)
    const itemName = field(field(field(source.items, "items"), themeId), "name")
    const name = typeof itemName === "string" && itemName ? itemName : themeId
    const sortId = typeof type["sortId"] === "number" ? type["sortId"] : null
    themes.push({ themeId, dir, sortId, isBasic: !!type["isBasic"], name, emotes: rows.map((row) => row.id) })
    rows.forEach((row, index) => {
      if (row.desc) warnings.push(`${row.id}: has a desc (${String(row.desc)}); the UI still shows the picture only`)
      emotes.push({
        id: row.id,
        themeId,
        sortId: row.sortId,
        picId: row.picId,
        art: `/assets/ui/emoticon/${dir}/${row.picId}.png`,
        label: EMOTE_LABELS[row.id] ?? `${shortName(name, themeId)} ${index + 1}`,
      })
    })
  }
  const constants = record(autoChess?.["constData"]) ?? {}
  const chatCD = typeof constants["chatCD"] === "number" && Number.isFinite(constants["chatCD"]) ? constants["chatCD"] : null
  const chatTime = typeof constants["chatTime"] === "number" && Number.isFinite(constants["chatTime"]) ? constants["chatTime"] : null
  return {
    doc: {
      version: 1,
      source: "display_meta_table.emoticonData (type AUTOCHESS_BATTLE) × activity_table autoChessData.enabledEmoticonThemeIdList",
      chatCD,
      chatTime,
      themes,
      emotes,
    },
    warnings,
  }
}

export function formatEmotes(doc: EmoteDocument): string {
  const line = (value: unknown): string => JSON.stringify(value)
  return (
    `{\n  "version": ${doc.version},\n  "source": ${line(doc.source)},\n  "chatCD": ${line(doc.chatCD)},\n  "chatTime": ${line(doc.chatTime)},\n` +
    `  "themes": [\n${doc.themes.map((theme) => `    ${line(theme)}`).join(",\n")}\n  ],\n` +
    `  "emotes": [\n${doc.emotes.map((emote) => `    ${line(emote)}`).join(",\n")}\n  ]\n}\n`
  )
}

interface GamedataRequest {
  readonly cache: string
  readonly rel: string
  readonly offline: boolean
  readonly optional?: boolean
}

async function ensureGamedata(files: CatalogFiles, http: CatalogHttp, request: GamedataRequest): Promise<string | null> {
  const absolute = join(request.cache, request.rel)
  if (await files.exists(absolute)) return absolute
  if (request.offline) {
    if (request.optional) return null
    throw new CatalogReadError(absolute, `missing cached file ${request.rel} (offline mode)`)
  }
  let lastError = "unknown error"
  for (let attempt = 1; attempt <= 3; attempt++) {
    let text: string
    try {
      text = await http.getText(GAMEDATA_URL + request.rel, 180000)
    } catch (cause) {
      lastError = cause instanceof Error ? cause.message : String(cause)
      await delay(500 * attempt)
      continue
    }
    try {
      JSON.parse(text)
    } catch (cause) {
      lastError = cause instanceof Error ? cause.message : String(cause)
      await delay(500 * attempt)
      continue
    }
    try {
      await files.writeTextAtomic(absolute, text)
    } catch (cause) {
      lastError = cause instanceof Error ? cause.message : String(cause)
      await delay(500 * attempt)
      continue
    }
    return absolute
  }
  if (request.optional) return null
  throw new CatalogReadError(request.rel, `download failed for ${request.rel}: ${lastError}`)
}

interface EmoteArgs {
  readonly offline: boolean
  readonly check: boolean
  readonly out: string
  readonly cache: string
}

function parseEmoteArgs(argv: readonly string[]): EmoteArgs {
  let offline = false
  let check = false
  let out: string | null = null
  let cache: string | null = null
  let season: string | null = null
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--offline") offline = true
    else if (arg === "--check") check = true
    else if (arg === "--out" || arg === "--cache" || arg === "--season") {
      const value = argv[++i]
      if (!value || value.startsWith("--")) throw new Error(`${arg} needs a value`)
      if (arg === "--out") out = resolve(value)
      else if (arg === "--cache") cache = resolve(value)
      else season = value
    } else if (arg?.startsWith("--season=")) {
      const value = arg.slice("--season=".length)
      if (!value) throw new Error("--season needs an id")
      season = value
    } else {
      throw new Error(`unknown option ${arg}\nusage: [--offline] [--check] --season <id> [--out <file>] [--cache <dir>]`)
    }
  }
  if (!season && !out) throw new Error("--season is required")
  const seasonOut = season ? join(workspace.seasonDir(season), "emotes.json") : ""
  return { offline, check, out: out ?? seasonOut, cache: cache ?? workspace.gamedataCacheDir }
}

async function readJson(files: CatalogFiles, path: string | null): Promise<unknown> {
  if (!path) return null
  const text = await files.readText(path)
  try {
    return JSON.parse(text) as unknown
  } catch (cause) {
    throw new CatalogReadError(path, cause instanceof Error ? cause.message : String(cause))
  }
}

export async function compileEmotes(files: CatalogFiles, http: CatalogHttp, argv: readonly string[]): Promise<number> {
    const options = parseEmoteArgs(argv)
    const display = await readJson(files, await ensureGamedata(files, http, { cache: options.cache, rel: "excel/display_meta_table.json", offline: options.offline }))
    const activity = await readJson(files, await ensureGamedata(files, http, { cache: options.cache, rel: "excel/activity_table.json", offline: options.offline }))
    const items = await readJson(
      files,
      await ensureGamedata(files, http, { cache: options.cache, rel: "excel/item_table.json", offline: options.offline, optional: true }),
    )
    if (!items) console.warn("build-emotes: item_table unavailable, theme names fall back to theme ids")
    const built = items == null ? buildEmotes({ display, activity }) : buildEmotes({ display, activity, items })
    for (const warning of built.warnings) console.warn(`build-emotes: ${warning}`)
    const text = formatEmotes(built.doc)
    if (options.check) {
      const exists = await files.exists(options.out)
      const previous = exists ? await files.readText(options.out) : null
      if (previous !== text) {
        console.error(`build-emotes: ${options.out} is out of date (run the emote compiler)`)
        return 1
      }
      console.log(`build-emotes: ${options.out} is up to date (${built.doc.themes.length} themes, ${built.doc.emotes.length} emotes)`)
      return 0
    }
    await files.writeTextAtomic(options.out, text)
    console.log(`build-emotes: wrote ${options.out} (${built.doc.themes.length} themes, ${built.doc.emotes.length} emotes)`)
    return 0
}
