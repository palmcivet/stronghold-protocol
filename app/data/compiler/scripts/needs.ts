#!/usr/bin/env node
// pnpm compile:needs --season <id>...：按研究表与已提取的 gamedata 写出基础与赛季需求清单。
// 音频、语音或关卡表未提取时，对应需求留空并给出提示；提取后再运行一次即可补齐。
// --full 另按 gamedata 全表列出全部干员、皮肤、召唤物与敌人（可选需求）；compiler/input/base/absent.json 列出的键标为可选并写明原因。

import { join, resolve } from "node:path"
import { BuildReadError, loadPathTable, nodeBuildFiles, type BuildFiles } from "arknights-assets-extractor"
import { needsListIssues, type Need, type NeedsList } from "arknights-assets-catalog"
import { markAbsent, parseAbsentTable } from "#compiler/media/need/absent.js"
import { baseNeeds, gamedataNeeds, voiceNeeds } from "#compiler/media/need/base.js"
import { FULL_GAMEDATA_TABLES, fullBaseNeeds } from "#compiler/media/need/full.js"
import { indexAudio, VOICE_BATTLE_SLOTS, type VoiceLang } from "#compiler/media/need/audio-bank.js"
import { recordOf, textOf, uniqueNeeds, type NeedContext, type PacketIds } from "#compiler/media/need/input.js"
import { seasonNeeds } from "#compiler/media/need/season.js"
import { gamedataPath } from "#compiler/gamedata.js"
import { dataWorkspace } from "#workspace.js"
import { seasonPacketDirectory } from "#schema/packet-file.js"

const USAGE = "usage: compile:needs --season <id> [--season <id>...] [--out <dir>] [--cache <dir>] [--voice-lang cn|jp|en|kr] [--voice-all] [--full]"
const VOICE_LANGS: readonly VoiceLang[] = ["cn", "jp", "en", "kr"]

interface Options {
  readonly seasons: readonly string[]
  readonly outDir: string
  readonly extractCacheDir: string
  readonly voiceLang: VoiceLang
  readonly voiceAll: boolean
  /** Adds every operator, skin, summon and enemy of the gamedata tables to the base needs, as optional needs. */
  readonly full: boolean
}

function fail(message: string): never {
  console.error(`compile:needs: ${message}\n${USAGE}`)
  process.exit(2)
}

function parseOptions(argv: readonly string[], workspace: ReturnType<typeof dataWorkspace>): Options {
  const seasons: string[] = []
  let outDir = workspace.needsDir
  let extractCacheDir = workspace.extractCacheDir
  let voiceLang: VoiceLang = "cn"
  let voiceAll = false
  let full = false
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index] ?? ""
    const eq = token.indexOf("=")
    const name = eq === -1 ? token : token.slice(0, eq)
    const inline = eq === -1 ? null : token.slice(eq + 1)
    if (name === "--help" || name === "-h") {
      console.log(USAGE)
      process.exit(0)
    }
    if (name === "--voice-all") {
      voiceAll = true
      continue
    }
    if (name === "--full") {
      full = true
      continue
    }
    if (name === "--season" || name === "--out" || name === "--cache" || name === "--voice-lang") {
      const value = inline ?? argv[++index]
      if (!value || value.startsWith("--")) fail(`${name} needs a value`)
      if (name === "--season") seasons.push(value)
      else if (name === "--out") outDir = resolve(value)
      else if (name === "--cache") extractCacheDir = resolve(value)
      else if (VOICE_LANGS.includes(value as VoiceLang)) voiceLang = value as VoiceLang
      else fail(`--voice-lang must be one of ${VOICE_LANGS.join(", ")}`)
      continue
    }
    fail(`unknown option ${token}`)
  }
  if (seasons.length === 0) fail("--season is required")
  for (const season of seasons) {
    try {
      seasonPacketDirectory(season)
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : String(cause))
    }
  }
  return { seasons, outDir, extractCacheDir, voiceLang, voiceAll, full }
}

async function readJson(files: BuildFiles, path: string): Promise<unknown> {
  try {
    return JSON.parse(await files.readText(path)) as unknown
  } catch (cause) {
    throw new BuildReadError(path, cause instanceof Error ? cause.message : String(cause))
  }
}

/** Parsed gamedata table from the extractor cache, or null when it has not been extracted yet. */
async function cachedGamedata(files: BuildFiles, extractCacheDir: string, rel: string): Promise<unknown | null> {
  const path = gamedataPath(extractCacheDir, rel)
  if (!(await files.exists(path))) return null
  return readJson(files, path)
}

function sortedNeeds(needs: readonly Need[]): Need[] {
  return [...needs].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

/** Ids the season packets name. Missing packets contribute nothing, so the first run only sees the research tables. */
async function packetIds(files: BuildFiles, workspace: ReturnType<typeof dataWorkspace>, seasons: readonly string[]): Promise<PacketIds> {
  const enemyIds = new Set<string>()
  const tokenIds = new Set<string>()
  const handbookOf = new Map<string, string>()
  const spineOf = new Map<string, string>()
  for (const seasonId of seasons) {
    const directory = workspace.seasonDir(seasonId)
    const enemies = await readOptionalPacket(files, join(directory, "enemies.json"))
    const tokens = await readOptionalPacket(files, join(directory, "tokens.json"))
    const bosses = await readOptionalPacket(files, join(directory, "bosses.json"))
    for (const [id, record] of Object.entries(recordOf(enemies))) {
      enemyIds.add(id)
      const spine = textOf(recordOf(record)["spine"])
      if (spine && spine !== id) spineOf.set(id, spine)
    }
    for (const id of Object.keys(recordOf(tokens))) tokenIds.add(id)
    for (const boss of Object.values(recordOf(bosses))) {
      const row = recordOf(boss)
      const enemyKey = textOf(row["enemyKey"])
      const handbookId = textOf(row["handbookId"])
      if (enemyKey && handbookId) handbookOf.set(enemyKey, handbookId)
    }
  }
  return { enemyIds: [...enemyIds].sort(), tokenIds: [...tokenIds].sort(), handbookOf, spineOf }
}

async function readOptionalPacket(files: BuildFiles, path: string): Promise<unknown | null> {
  return (await files.exists(path)) ? readJson(files, path) : null
}

async function writeNeeds(files: BuildFiles, path: string, list: NeedsList): Promise<void> {
  const issues = needsListIssues(list)
  if (issues.length > 0) throw new BuildReadError(path, issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "))
  await files.writeTextAtomic(path, `${JSON.stringify(list, null, 2)}\n`)
}

async function main(): Promise<void> {
  const workspace = dataWorkspace()
  const options = parseOptions(process.argv.slice(2), workspace)
  const files = nodeBuildFiles
  const research = {
    ops03: await readJson(files, join(workspace.researchDir, "03-operators.json")),
    enemies05: await readJson(files, join(workspace.researchDir, "05-enemies.json")),
    maps05: await readJson(files, join(workspace.researchDir, "05-maps.json")),
    assets07: await readJson(files, join(workspace.researchDir, "07-assets.json")),
  }
  const audioData = await cachedGamedata(files, options.extractCacheDir, "excel/audio_data.json")
  const charword = await cachedGamedata(files, options.extractCacheDir, "excel/charword_table.json")
  const activity = await cachedGamedata(files, options.extractCacheDir, "excel/activity_table.json")
  const missing = [audioData, charword, activity].some((table) => table === null)
  const context: NeedContext = {
    research,
    audio: audioData === null ? null : indexAudio(audioData),
    charword,
    arknightsAssets: await loadPathTable(files, "arknights-assets"),
    voice: await loadPathTable(files, "voice"),
    voiceLang: options.voiceLang,
    voiceSlots: options.voiceAll ? null : VOICE_BATTLE_SLOTS,
    packet: await packetIds(files, workspace, options.seasons),
  }

  const absent = parseAbsentTable(await readJson(files, join(workspace.baseInputDir, "absent.json")), "absent.json")
  const fullNeeds = options.full ? await fullBase(files, options.extractCacheDir, context) : []
  const base = sortedNeeds(markAbsent(uniqueNeeds([...baseNeeds(context), ...fullNeeds]), absent))
  await writeNeeds(files, join(options.outDir, "base.json"), { schemaVersion: 1, pack: { type: "base", id: "base" }, needs: base })
  console.log(`[needs] base: ${base.length} needs (${base.filter((need) => need.required).length} required) -> ${join(options.outDir, "base.json")}`)

  for (const seasonId of options.seasons) {
    const needs = sortedNeeds(markAbsent(seasonNeeds(context, seasonId, activity), absent))
    const path = join(options.outDir, `season-${seasonId}.json`)
    await writeNeeds(files, path, { schemaVersion: 1, pack: { type: "season", id: seasonId }, needs })
    console.log(`[needs] season ${seasonId}: ${needs.length} needs (${needs.filter((need) => need.required).length} required) -> ${path}`)
  }

  if (missing) {
    console.log(
      "[needs] audio, charword or activity tables are not extracted yet; audio and level needs are left out. Run pnpm extract:media, then pnpm compile:needs again.",
    )
  }
}

/** Optional base needs from the full gamedata tables, plus the tables themselves as required needs. */
async function fullBase(files: BuildFiles, extractCacheDir: string, context: NeedContext): Promise<Need[]> {
  const characters = await cachedGamedata(files, extractCacheDir, "excel/character_table.json")
  const skins = await cachedGamedata(files, extractCacheDir, "excel/skin_table.json")
  const full = fullBaseNeeds({
    characters,
    skills: await cachedGamedata(files, extractCacheDir, "excel/skill_table.json"),
    skins,
    handbook: await cachedGamedata(files, extractCacheDir, "excel/enemy_handbook_table.json"),
    enemyDatabase: await cachedGamedata(files, extractCacheDir, "levels/enemydata/enemy_database.json"),
  })
  if (characters === null || skins === null) {
    console.log("[needs] --full: character or skin tables are not extracted yet. Run pnpm extract:media, then pnpm compile:needs --full again.")
  }
  const voice = context.charword ? voiceNeeds(context, full.operatorIds) : []
  return [...gamedataNeeds(FULL_GAMEDATA_TABLES), ...full.needs, ...voice]
}

main().catch((cause: unknown) => {
  if (cause instanceof BuildReadError) console.error(`compile:needs failed: ${cause.path}: ${cause.message}`)
  else console.error("compile:needs failed:", cause instanceof Error ? cause.stack ?? cause.message : cause)
  process.exitCode = 1
})
