import { levelPath, naturalCmp, templateIdOf, type GameRecord } from "#compiler/packet/text/parse.js"

export interface SeasonLevels {
  /** Level id to the gamedata source it is read from: a template id or a stage id. */
  readonly sources: ReadonlyMap<string, string>
  readonly templateIds: readonly string[]
  readonly stageIds: readonly string[]
  readonly enemyDataLevelId: string | null
}

/** Every level a season's packets read, derived from `activity_table.json` and `autoChessData`. */
export function seasonLevels(act: GameRecord, ac: GameRecord): SeasonLevels {
  const sources = new Map<string, string>()
  for (const rounds of Object.values(act.battleDataDict)) {
    for (const entries of Object.values(rounds as GameRecord)) {
      for (const entry of entries as any[]) sources.set(templateIdOf(entry.levelId), entry.levelId)
    }
  }
  for (const key of ["escapedBattleTemplateMapSinglePlayer", "escapedBattleTemplateMapMultiPlayer"]) {
    if (act.constData[key]) sources.set(templateIdOf(act.constData[key]), act.constData[key])
  }
  const templateIds = [...sources.keys()].sort(naturalCmp)
  const stageIds = Object.keys(act.stageDatasDict).sort(naturalCmp)
  for (const id of stageIds) sources.set(id, id)
  const enemyDataLevelId = ac.constData.enemyDataLevelId ? templateIdOf(ac.constData.enemyDataLevelId) : null
  if (enemyDataLevelId) sources.set(enemyDataLevelId, ac.constData.enemyDataLevelId)
  return { sources, templateIds, stageIds, enemyDataLevelId }
}

/** Gamedata path of each level, relative to `zh_CN/gamedata/`, in natural id order. */
export function levelGamedataPaths(levels: SeasonLevels): string[] {
  return [...new Set([...levels.sources.keys()].sort(naturalCmp).map((id) => levelPath(levels.sources.get(id) as string)))]
}
