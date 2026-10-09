import { join } from "node:path"
import { BuildReadError, type BuildFiles } from "arknights-assets-extractor"
import { gamedataPath } from "#compiler/gamedata.js"
import type { BuildNotes } from "#compiler/packet/text/notes.js"
import { seasonLevels } from "#compiler/packet/compile/levels.js"
import { levelPath, naturalCmp, type GameRecord } from "#compiler/packet/text/parse.js"

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
  }
}

export interface LoadInput {
  readonly seasonId: string
  readonly noResearch: boolean
  /** Root of the extractor cache that holds the gamedata tables. */
  readonly extractCacheDir: string
  readonly researchDir: string
  readonly notes: BuildNotes
}

function asObject(value: unknown, path: string): GameRecord {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) return value as GameRecord
  throw new BuildReadError(path, "expected a JSON object")
}

function parseJson(text: string, path: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch (cause) {
    throw new BuildReadError(path, cause instanceof Error ? cause.message : String(cause))
  }
}

export async function loadContext(files: BuildFiles, input: LoadInput): Promise<SeasonContext> {
  const notes = input.notes
  const jsonCache = new Map<string, GameRecord>()

  const loadGamedata = async (rel: string): Promise<GameRecord> => {
    const cached = jsonCache.get(rel)
    if (cached) return cached
    const abs = gamedataPath(input.extractCacheDir, rel)
    if (!(await files.exists(abs))) {
      throw new BuildReadError(abs, `gamedata ${rel} is not in the extractor cache; run pnpm extract:media first`)
    }
    const parsed = parseJson(await files.readText(abs), abs)
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
    throw new BuildReadError("excel/activity_table.json", `activity_table has no ${input.seasonId} / autoChessData section`)
  }

  const enemyDb = new Map<string, any>()
  for (const enemy of enemyDbRaw.enemies || []) enemyDb.set(enemy.Key, enemy.Value)

  const seasonLevelSet = seasonLevels(act, ac)
  const levels: GameRecord = {}
  for (const id of [...seasonLevelSet.sources.keys()].sort(naturalCmp)) {
    levels[id] = await loadGamedata(levelPath(seasonLevelSet.sources.get(id) as string))
  }
  const { templateIds, stageIds, enemyDataLevelId } = seasonLevelSet

  const research = {
    core: await loadResearch("01-core-data.json"),
    bonds: await loadResearch("02-bonds.json"),
    items: await loadResearch("04-items.json"),
    enemies: await loadResearch("05-enemies.json"),
    maps: await loadResearch("05-maps.json"),
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
  }
}
