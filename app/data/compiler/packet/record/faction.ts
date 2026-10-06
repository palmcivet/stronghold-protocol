import type { SeasonContext } from "#compiler/packet/compile/context.js"
import { templateSlots } from "./enemy.js"
import { naturalCmp } from "#compiler/packet/text/parse.js"

export function buildFactions(ctx: SeasonContext, enemies: Record<string, any>): Record<string, any> {
  const { ac, act } = ctx
  const data = ac.constData
  const slots = templateSlots(ctx)
  const slotKey = Object.fromEntries(Object.entries(slots).map(([key, slot]) => [slot, key]))
  const minCount = data.minReplacedEnemyCount ?? 1
  const maxCount = data.maxReplacedEnemyCount ?? 5
  const inactive = new Map<string, string[]>()
  for (const mode of Object.values(act.modeDataDict)) for (const key of (mode as any).inactiveEnemyKey || []) {
    if (!inactive.has(key)) inactive.set(key, [])
    inactive.get(key)?.push((mode as any).modeId)
  }
  const isFly = (key: string): boolean => {
    const row = ac.randomEnemyAttributeDict?.[key]
    return row ? !!row.isFlyEnemy : enemies[key]?.stats?.motion === "FLY"
  }
  const entries: Record<string, any> = {}
  for (const key of Object.keys(act.specialEnemyInfoDict).sort(naturalCmp)) {
    const entry = act.specialEnemyInfoDict[key]
    const all = [entry.specialEnemyKey, ...(entry.attachedNormalEnemyKeys || []), ...(entry.attachedEliteEnemyKeys || [])]
    const fly = isFly(entry.specialEnemyKey)
    if (all.some((enemyKey: string) => isFly(enemyKey) !== fly)) ctx.notes.warn(`faction entry ${key}: mixed movement classes`)
    entries[key] = {
      key: entry.specialEnemyKey,
      type: entry.type,
      weight: entry.randomWeight,
      firstHalf: !!entry.isInFirstHalf,
      fly,
      N: (entry.attachedNormalEnemyKeys || []).map((enemyKey: string) => ({ key: enemyKey })),
      E: (entry.attachedEliteEnemyKeys || []).map((enemyKey: string) => ({ key: enemyKey })),
      inactiveIn: [...new Set([...(inactive.get(entry.specialEnemyKey) || [])])].sort(naturalCmp),
    }
    for (const enemyKey of all) if (!enemies[enemyKey]) ctx.notes.warn(`faction entry ${key}: enemy ${enemyKey} missing`)
  }
  const types: Record<string, any> = {}
  for (const [type, row] of Object.entries(ac.enemyTypeDatas || {})) {
    const random = act.specialEnemyRandomTypeDict?.[type] || {}
    const info = row as any
    types[type] = {
      type,
      name: info.name,
      desc: info.description,
      icon: info.icon,
      sortId: info.sortId,
      typeIdentifier: info.typeIdentifier,
      involveRandom: !!info.involveRandom,
      count: random.count ?? null,
      weight: random.weight ?? null,
      pool: [...(act.enemyInfoDict?.[type] || [])],
      entries: Object.keys(entries).filter((id) => entries[id].type === type),
    }
  }
  const fillType = Object.values(types).find((row) => row.typeIdentifier === data.enemyTypeIdentifierToFillRandom)?.type || "SPECIAL"
  const maxLevelCnt = data.maxLevelCnt ?? 15
  const placeholders: Record<string, any> = {}
  for (const [cls, flyCode, walkCode] of [["normal", "NF", "N"], ["elite", "EF", "E"], ["special", "SF", "S"]] as const) {
    const walkKey = slotKey[walkCode]
    const flyKey = slotKey[flyCode]
    if (walkKey) placeholders[walkKey] = { slot: walkCode, cls, fly: false }
    if (flyKey) placeholders[flyKey] = { slot: flyCode, cls, fly: true }
  }
  return {
    templateSlots: slotKey,
    types,
    entries,
    generation: {
      source: "official client RandomEnemyGenerater (research 08 §2, decoded from the client; normative)",
      specialEnemyNum: data.specialEnemyNum ?? 3,
      maxLevelCnt,
      fillType,
      alwaysIncludedType: fillType,
      typeSlots: Object.fromEntries(Object.values(types).filter((row) => row.involveRandom).map((row) => [row.type, row.count ?? 3])),
      trainingTypes: act.constData.trSpecialEnemyTypes || [],
      firstHalfMaxRound: Math.floor(maxLevelCnt / 2),
      minReplacedEnemyCount: minCount,
      maxReplacedEnemyCount: maxCount,
      minActionIntervalRatio: 0.05,
      beFactors: { hp: data.enemyMaxHpFactor ?? 1, atk: data.enemyAtkFactor ?? 5, def: data.enemyDefFactor ?? 3, res: data.enemyMagicResistanceFactor ?? 3 },
      placeholders,
      powerFormula: "P(k) = f32(f32(f32(atk*5) + f32(maxHp*1)) + f32(def*3)) + f32(3*res) — enemy_database level stats (enemies.json attrPower)",
      countFormula: "n' = clamp(roundHalfEven(f32(f32(f32(n*P(tpl))/f(tpl)) / f32(P(new)/f(new)))), minReplacedEnemyCount, maxReplacedEnemyCount); f = beFactor",
      timingFormula: "unit i at preDelay + i*max(n*interval/n', minActionIntervalRatio*n*interval)",
      notes: [
        "Match start: shuffle the involveRandom types, keep specialEnemyNum (3); each owns `count` (3) of the maxLevelCnt (15) round slots, fillType (SPECIAL) the rest; the slots are shuffled (slot r = type of round r).",
        "Per round r: half = r <= firstHalfMaxRound; weighted (weight) pick among the entries of that type and half whose SPECIAL key is not in the mode inactiveEnemyKeys; normal/elite = a random attached key (never filtered).",
        "Per SPAWN action whose key is a placeholder: skipped when isFly(new key) != placeholder fly flag (not spawned, not previewed); else the count follows countFormula and the units keep the action window (timingFormula). Literal keys and T/TF tokens are kept.",
        "Leader / hidden rounds use slot 14 / 15 (solo 标准: 9) with the same rule, so only the E or the EF escorts spawn.",
        "enemy_9012_acloon (炎佑) is never an enemy.",
      ],
    },
  }
}
