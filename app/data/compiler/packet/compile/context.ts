import { setTimeout as delay } from "node:timers/promises"
import { join } from "node:path"
import { CatalogReadError, type CatalogFiles, type CatalogHttp } from "arknights-assets-catalog"
import type { BuildNotes } from "#compiler/packet/text/notes.js"
import { levelPath, naturalCmp, templateIdOf, type GameRecord } from "#compiler/packet/text/parse.js"

export const GAMEDATA_URL: string = "https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/"
const DOWNLOAD_TIMEOUT_MS: number = 180_000

export interface SeasonContext {
  readonly seasonId: string
  readonly notes: BuildNotes
  readonly act: GameRecord
  readonly ac: GameRecord
  readonly charTable: GameRecord
  readonly skillTable: GameRecord
  readonly rangeTable: GameRecord
  readonly uniequip: GameRecord
  readonly battleEquip: GameRecord
  readonly handbook: GameRecord
  readonly enemyDb: Map<string, any>
  readonly levels: GameRecord
  readonly templateIds: readonly string[]
  readonly stageIds: readonly string[]
  readonly enemyDataLevelId: string | null
  readonly research: {
    readonly core: any
    readonly bonds: any
    readonly items: any
    readonly enemies: any
    readonly maps: any
    readonly assets: any
  }
  readonly manifest: any
}

export interface LoadInput {
  readonly seasonId: string
  readonly refresh: boolean
  readonly offline: boolean
  readonly noResearch: boolean
  readonly cacheDir: string
  readonly researchDir: string
  readonly assetsManifest: string
  readonly notes: BuildNotes
}

function asObject(value: unknown, path: string): GameRecord {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) return value as GameRecord
  throw new CatalogReadError(path, "expected a JSON object")
}

function parseJson(text: string, path: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch (cause) {
    throw new CatalogReadError(path, cause instanceof Error ? cause.message : String(cause))
  }
}

export async function loadContext(files: CatalogFiles, http: CatalogHttp, input: LoadInput): Promise<SeasonContext> {
  const notes = input.notes
  const jsonCache = new Map<string, GameRecord>()

  const ensureGamedata = async (rel: string): Promise<string> => {
    const abs = join(input.cacheDir, rel)
    if (!input.refresh && (await files.exists(abs))) return abs
    if (input.offline) {
      if (await files.exists(abs)) return abs
      throw new CatalogReadError(abs, `missing cached file ${rel} (offline mode)`)
    }
    const url = GAMEDATA_URL + rel
    let lastMessage = "unknown error"
    for (let attempt = 1; attempt <= 4; attempt++) {
      notes.log(`  download ${rel}${attempt > 1 ? ` (attempt ${attempt})` : ""}`)
      try {
        const text = await http.getText(url, DOWNLOAD_TIMEOUT_MS)
        parseJson(text, url)
        await files.writeTextAtomic(abs, text)
        return abs
      } catch (cause) {
        lastMessage = cause instanceof Error ? cause.message : String(cause)
      }
      if (attempt < 4) await delay(500 * attempt)
    }
    if (await files.exists(abs)) {
      notes.warn(`download failed for ${rel}, using stale cache: ${lastMessage}`)
      return abs
    }
    throw new CatalogReadError(rel, `cannot obtain ${rel}: ${lastMessage}`)
  }

  const loadGamedata = async (rel: string): Promise<GameRecord> => {
    const cached = jsonCache.get(rel)
    if (cached) return cached
    const abs = await ensureGamedata(rel)
    const text = await files.readText(abs)
    const parsed = parseJson(text, abs)
    const obj = asObject(parsed, abs)
    jsonCache.set(rel, obj)
    return obj
  }

  const loadResearch = async (name: string): Promise<any> => {
    if (input.noResearch) return null
    const abs = join(input.researchDir, name)
    if (!(await files.exists(abs))) {
      notes.warn(`research file ${name} not found; research-derived fields use defaults`)
      return null
    }
    let text: string
    try {
      text = await files.readText(abs)
    } catch (cause) {
      notes.warn(`research file ${name} unreadable: ${cause instanceof Error ? cause.message : String(cause)}`)
      return null
    }
    try {
      return JSON.parse(text)
    } catch (cause) {
      notes.warn(`research file ${name} unreadable: ${cause instanceof Error ? cause.message : String(cause)}`)
      return null
    }
  }

  const loadManifest = async (): Promise<any> => {
    const abs = input.assetsManifest
    if (!(await files.exists(abs))) {
      notes.warn(`${abs} not found; enemies get no attackAnim`)
      return null
    }
    let text: string
    try {
      text = await files.readText(abs)
    } catch (cause) {
      notes.warn(`${abs} unreadable: ${cause instanceof Error ? cause.message : String(cause)}`)
      return null
    }
    try {
      return JSON.parse(text)
    } catch (cause) {
      notes.warn(`${abs} unreadable: ${cause instanceof Error ? cause.message : String(cause)}`)
      return null
    }
  }

  notes.log("loading official data…")
  const [activity, charTable, skillTable, rangeTable, uniequip, battleEquip, handbook, enemyDbRaw] = await Promise.all([
    loadGamedata("excel/activity_table.json"),
    loadGamedata("excel/character_table.json"),
    loadGamedata("excel/skill_table.json"),
    loadGamedata("excel/range_table.json"),
    loadGamedata("excel/uniequip_table.json"),
    loadGamedata("excel/battle_equip_table.json"),
    loadGamedata("excel/enemy_handbook_table.json"),
    loadGamedata("levels/enemydata/enemy_database.json"),
  ])

  const act = activity.activity?.AUTOCHESS_SEASON?.[input.seasonId]
  const ac = activity.autoChessData
  if (!act || !ac) {
    throw new CatalogReadError("excel/activity_table.json", `activity_table has no ${input.seasonId} / autoChessData section`)
  }

  const enemyDb = new Map<string, any>()
  for (const enemy of enemyDbRaw.enemies || []) enemyDb.set(enemy.Key, enemy.Value)

  const levelSrc = new Map<string, string>()
  for (const rounds of Object.values(act.battleDataDict)) {
    for (const entries of Object.values(rounds as GameRecord)) {
      for (const entry of entries as any[]) levelSrc.set(templateIdOf(entry.levelId), entry.levelId)
    }
  }
  for (const key of ["escapedBattleTemplateMapSinglePlayer", "escapedBattleTemplateMapMultiPlayer"]) {
    if (act.constData[key]) levelSrc.set(templateIdOf(act.constData[key]), act.constData[key])
  }
  const templateIds = [...levelSrc.keys()].sort(naturalCmp)
  const stageIds = Object.keys(act.stageDatasDict).sort(naturalCmp)
  for (const id of stageIds) levelSrc.set(id, id)
  const enemyDataLevelId = ac.constData.enemyDataLevelId ? templateIdOf(ac.constData.enemyDataLevelId) : null
  if (enemyDataLevelId) levelSrc.set(enemyDataLevelId, ac.constData.enemyDataLevelId)
  const levels: GameRecord = {}
  for (const id of [...levelSrc.keys()].sort(naturalCmp)) {
    const source = levelSrc.get(id)
    if (source === undefined) continue
    levels[id] = await loadGamedata(levelPath(source))
  }

  const research = {
    core: await loadResearch("01-core-data.json"),
    bonds: await loadResearch("02-bonds.json"),
    items: await loadResearch("04-items.json"),
    enemies: await loadResearch("05-enemies.json"),
    maps: await loadResearch("05-maps.json"),
    assets: await loadResearch("07-assets.json"),
  }

  return {
    seasonId: input.seasonId,
    notes,
    act,
    ac,
    charTable,
    skillTable,
    rangeTable,
    uniequip,
    battleEquip,
    handbook,
    enemyDb,
    levels,
    templateIds,
    stageIds,
    enemyDataLevelId,
    research,
    manifest: await loadManifest(),
  }
}
