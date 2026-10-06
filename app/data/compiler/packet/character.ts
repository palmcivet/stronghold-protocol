import type { SeasonContext } from "./compile/context.js"
import type { BuildNotes } from "./text/notes.js"
import { bestCandidate, cleanNum, flattenBB, textPair } from "./text/parse.js"

const MELEE_RANGED_SUBPROFS: ReadonlySet<string> = new Set(["lord", "fortress", "shotprotector", "agent", "hookmaster"])
const NO_ATTACK_SUBPROFS: ReadonlySet<string> = new Set(["bard", "phalanx", "librator"])

export const MODULE_ATTR_MAP: Readonly<Record<string, string>> = {
  max_hp: "maxHp",
  atk: "atk",
  def: "def",
  magic_resistance: "res",
  attack_speed: "aspd",
  cost: "cost",
  respawn_time: "respawnTime",
  block_cnt: "blockCnt",
  base_attack_time: "bat",
  max_deploy_count: "deployLimit",
  max_deck_stack_cnt: "deckStack",
}

const TRIGGER_RENAME: Readonly<Record<string, string>> = { ALWAYS: "SP_FULL", CUSTOM_RANGE_SEARCH_ENEMY: "CUSTOM_RANGE" }
const ATTACK_RANGE_CHANGE: RegExp = /攻击(?:范围|距离)(?:与溅射范围)?(?:扩大|改变|缩小|缩短|加长|增加|\+)/

/**
 * MANUAL skills that cast on the basic strategy, or on their own 技能范围, instead of the official TAKE_DAMAGE row.
 * Keyed by the normal chess id and the skill id.
 */
export const TRIGGER_DEVIATIONS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  chess_char_1_04_a: { skchr_udflow_2: "DEFAULT" },
  chess_char_1_20_a: { skchr_liskam_2: "DEFAULT" },
  chess_char_2_18_a: { "skcom_atk_up[3]": "DEFAULT", skchr_ashlok_2: "DEFAULT" },
  chess_char_5_08_a: { skchr_horn_2: "DEFAULT", skchr_horn_3: "DEFAULT" },
  chess_char_6_03_a: { skchr_yu_2: "SKILL_RANGE" },
}

const SP_TYPE_NAMES: Readonly<Record<number, string>> = {
  1: "INCREASE_WITH_TIME",
  2: "INCREASE_WHEN_ATTACK",
  4: "INCREASE_WHEN_TAKEN_DAMAGE",
  8: "ON_DEPLOY",
}

export function rangeGrid(ctx: SeasonContext, rangeId: any): any {
  if (!rangeId) return null
  const range = ctx.rangeTable[rangeId]
  if (!range) {
    ctx.notes.warn(`unknown rangeId ${rangeId}`)
    return null
  }
  return (range.grids || []).map((grid: any) => [grid.row, grid.col])
}

export function interpolateAttrs(char: any, phase: number, level: number): any {
  const phaseData = char.phases?.[phase]
  if (!phaseData) return null
  const frames = phaseData.attributesKeyFrames || []
  if (!frames.length) return null
  const target = Math.max(1, Math.min(level, phaseData.maxLevel || level))
  let left = frames[0]
  let right = frames[frames.length - 1]
  for (let index = 0; index < frames.length - 1; index++) {
    const here = frames[index]
    const next = frames[index + 1]
    if (here && next && target >= here.level && target <= next.level) {
      left = here
      right = next
      break
    }
  }
  if (!left || !right) return null
  const span = right.level === left.level ? 0 : (target - left.level) / (right.level - left.level)
  const out: Record<string, any> = {}
  for (const [key, start] of Object.entries(left.data)) {
    const end = right.data[key]
    out[key] = typeof start === "number" && typeof end === "number" ? start + (end - start) * span : start
  }
  return out
}

export function statsFrom(attrs: any, notes: BuildNotes, bonus: Record<string, any> = {}): any {
  if (!attrs) return null
  const round = (value: any): number => Math.round(value)
  const stats: Record<string, any> = {
    maxHp: round(attrs.maxHp),
    atk: round(attrs.atk),
    def: round(attrs.def),
    res: cleanNum(attrs.magicResistance),
    cost: round(attrs.cost),
    blockCnt: round(attrs.blockCnt),
    bat: cleanNum(attrs.baseAttackTime),
    aspd: cleanNum(attrs.attackSpeed),
    respawnTime: round(attrs.respawnTime),
    spRecovery: cleanNum(attrs.spRecoveryPerSec),
    hpRecoveryPerSec: cleanNum(attrs.hpRecoveryPerSec),
    moveSpeed: cleanNum(attrs.moveSpeed),
    tauntLevel: attrs.tauntLevel | 0,
    massLevel: attrs.massLevel | 0,
    deployLimit: attrs.maxDeployCount | 0,
    deckStack: attrs.maxDeckStackCnt | 0,
  }
  for (const [key, value] of Object.entries(bonus)) {
    const field = MODULE_ATTR_MAP[key]
    if (!field) {
      notes.warn(`unmapped module attribute key ${key}`)
      continue
    }
    stats[field] = cleanNum((stats[field] || 0) + value)
  }
  return stats
}

export function immunitiesOf(attrs: any): any {
  return {
    stun: !!attrs?.stunImmune,
    silence: !!attrs?.silenceImmune,
    sleep: !!attrs?.sleepImmune,
    frozen: !!attrs?.frozenImmune,
    levitate: !!attrs?.levitateImmune,
  }
}

export function resolveTrigger(ctx: SeasonContext, char: any, charId: any, skillIdx: number, skill: any, options: { operator?: boolean, chessId?: string | null } = {}): any {
  const rows = Object.values(ctx.ac.skillTriggerDataList || {}) as any[]
  const manual = skill.skillType === "MANUAL"
  const pick: any =
    rows.find((row: any) => row.charId === charId && (row.skillIndex === skillIdx || row.skillIndex === -1)) ||
    (manual && rows.find((row: any) => !row.charId && row.subProfessionId && row.subProfessionId === char.subProfessionId)) ||
    (manual && rows.find((row: any) => !row.charId && !row.subProfessionId && row.profession === char.profession)) ||
    null
  if (!pick && options.operator && manual && skill.rangeGrid && !ATTACK_RANGE_CHANGE.test(skill.desc || "")) {
    return { rule: "SKILL_RANGE", rawRule: "DEFAULT", customRangeGrid: skill.rangeGrid.map((point: any) => point.slice()) }
  }
  const rawRule = pick ? pick.skillTriggerType : "DEFAULT"
  const deviation = options.chessId ? TRIGGER_DEVIATIONS[options.chessId]?.[skill.skillId] : null
  if (deviation === "SKILL_RANGE") {
    if (!skill.rangeGrid) ctx.notes.warn(`trigger deviation ${options.chessId} ${skill.skillId}: SKILL_RANGE without a 技能范围`)
    return { rule: deviation, rawRule, customRangeGrid: skill.rangeGrid ? skill.rangeGrid.map((point: any) => point.slice()) : null }
  }
  if (deviation) return { rule: deviation, rawRule, customRangeGrid: null }
  const rule = TRIGGER_RENAME[rawRule] || rawRule
  let customRangeGrid = null
  if (rawRule === "CUSTOM_RANGE_SEARCH_ENEMY") {
    const rangeId = ctx.ac.skillRangeDict?.[skill.skillId]
    customRangeGrid = rangeGrid(ctx, rangeId)
    if (!customRangeGrid) ctx.notes.warn(`skill ${skill.skillId}: CUSTOM_RANGE trigger without skillRangeDict entry`)
  }
  return { rule, rawRule, customRangeGrid }
}

export function buildSkill(ctx: SeasonContext, skillId: any, level: number, trigger: any, label: string): any {
  if (!skillId) return null
  const skill = ctx.skillTable[skillId]
  if (!skill) {
    ctx.notes.warn(`${label}: skill ${skillId} missing from skill_table`)
    return null
  }
  const levels = Array.isArray(skill.levels) ? skill.levels : []
  const index = Math.max(0, Math.min(level, levels.length) - 1)
  const row = levels[index]
  if (!row) {
    ctx.notes.warn(`${label}: skill ${skillId} has no level ${level}`)
    return null
  }
  const { bb, bbStr } = flattenBB(row.blackboard, `skill ${skillId}`, ctx.notes)
  const placeholderBB = { duration: row.duration, ...bb }
  const { desc, descRaw } = textPair(row.description, ctx.notes, placeholderBB, bbStr, `skill ${skillId}`)
  const sp = row.spData || {}
  if (typeof sp.spType === "number" && !SP_TYPE_NAMES[sp.spType]) ctx.notes.warn(`skill ${skillId}: unknown numeric spType ${sp.spType}`)
  return {
    skillId,
    iconId: skill.iconId || skillId,
    name: row.name,
    level: Math.max(1, Math.min(level, levels.length)),
    desc,
    descRaw,
    skillType: row.skillType,
    durationType: row.durationType,
    duration: cleanNum(row.duration),
    spType: typeof sp.spType === "number" ? SP_TYPE_NAMES[sp.spType] || String(sp.spType) : sp.spType,
    spCost: sp.spCost,
    initSp: sp.initSp,
    maxChargeTime: sp.maxChargeTime,
    increment: cleanNum(sp.increment),
    bb,
    bbStr,
    rangeId: row.rangeId || null,
    rangeGrid: rangeGrid(ctx, row.rangeId),
    prefabId: row.prefabId || skillId,
    trigger: trigger || { rule: "DEFAULT", rawRule: "DEFAULT", customRangeGrid: null },
  }
}

export function splitModuleParts(modulePhase: any): { op: any[], token: any[] } {
  const op: any[] = []
  const token: any[] = []
  for (const part of modulePhase?.parts || []) (part && part.isToken ? token : op).push(part)
  return { op, token }
}

export function applyModuleTraitParts(parts: any, phase: number, level: number, traitBB: any, template: any, rangeId: any, label: string, notes: SeasonContext["notes"]): { template: any, moduleText: any, rangeId: any } {
  let moduleText = null
  let nextTemplate = template
  let nextRange = rangeId
  for (const part of parts || []) {
    const candidate = bestCandidate(part.overrideTraitDataBundle?.candidates, phase, level)
    if (!candidate) continue
    const flattened = flattenBB(candidate.blackboard, `${label} module trait`, notes)
    Object.assign(traitBB.bb, flattened.bb)
    Object.assign(traitBB.bbStr, flattened.bbStr)
    if (candidate.overrideDescripton) nextTemplate = candidate.overrideDescripton
    if (candidate.additionalDescription) moduleText = candidate.additionalDescription
    if (candidate.rangeId) nextRange = candidate.rangeId
  }
  return { template: nextTemplate, moduleText, rangeId: nextRange }
}

export function classifyAttack(char: any, traitText: any): any {
  const profession = char.profession
  const sub = char.subProfessionId
  const trait = traitText || ""
  let dmgType: string
  if ((profession === "MEDIC" && sub !== "incantationmedic") || sub === "bard") dmgType = "heal"
  else if (/法术伤害/.test(trait) || profession === "CASTER") dmgType = "arts"
  else dmgType = "phys"
  let attackKind: string
  if (NO_ATTACK_SUBPROFS.has(sub)) attackKind = "none"
  else if (dmgType === "heal") attackKind = "heal"
  else if (char.position === "RANGED" || MELEE_RANGED_SUBPROFS.has(sub)) attackKind = "ranged"
  else attackKind = "melee"
  let projectile = "none"
  if (attackKind === "heal") projectile = "orb"
  else if (attackKind === "ranged") projectile = dmgType === "arts" ? "bolt" : "arrow"
  const canHitFly = (attackKind === "ranged" && !/地面敌人/.test(trait) && sub !== "fortress") || sub === "skywalker"
  let targetPriority = null
  if (/优先攻击空中单位/.test(trait)) targetPriority = "fly"
  else if (/防御力最低/.test(trait)) targetPriority = "lowestDef"
  return { dmgType, attackKind, projectile, canHitFly, targetPriority }
}

export function traitRecord(ctx: SeasonContext, char: any, phase: number, level: number, opParts: any, chessId: string): { trait: any, classify: any } {
  const candidate = bestCandidate(char.trait?.candidates, phase, level)
  const traitBB = flattenBB(candidate?.blackboard, `${chessId} trait`, ctx.notes)
  const traitMod = applyModuleTraitParts(opParts, phase, level, traitBB, candidate?.overrideDescripton || char.description || "", candidate?.rangeId || null, chessId, ctx.notes)
  const pair = textPair(traitMod.template, ctx.notes, traitBB.bb, traitBB.bbStr, `${chessId} trait`)
  const trait: Record<string, any> = { desc: pair.desc, descRaw: pair.descRaw, bb: traitBB.bb, bbStr: traitBB.bbStr, rangeGrid: rangeGrid(ctx, traitMod.rangeId) }
  if (traitMod.moduleText) {
    const modulePair = textPair(traitMod.moduleText, ctx.notes, traitBB.bb, traitBB.bbStr, `${chessId} module trait`)
    trait.moduleDesc = modulePair.desc
    trait.moduleDescRaw = modulePair.descRaw
  }
  return { trait, classify: classifyAttack(char, pair.desc) }
}

export function moduleAttr(ctx: SeasonContext, modulePhase: any): any {
  const sum: Record<string, number> = {}
  for (const entry of modulePhase?.attributeBlackboard || []) sum[entry.key] = (sum[entry.key] || 0) + entry.value
  const out: Record<string, any> = {}
  for (const [key, value] of Object.entries(sum)) {
    const field = MODULE_ATTR_MAP[key]
    if (!field) {
      ctx.notes.warn(`unmapped module attribute key ${key}`)
      continue
    }
    out[field] = cleanNum(value)
  }
  return out
}

export function baseTalentList(ctx: SeasonContext, char: any, phase: number, level: number, label: string): any[] {
  const talents: any[] = []
  ;(char.talents || []).forEach((talent: any, index: number) => {
    const candidate = bestCandidate(talent.candidates, phase, level)
    if (!candidate) return
    const { bb, bbStr } = flattenBB(candidate.blackboard, `${label} talent ${index}`, ctx.notes)
    const pair = textPair(candidate.description, ctx.notes, bb, bbStr)
    talents.push({
      index,
      name: candidate.name || null,
      desc: pair.desc,
      descRaw: pair.descRaw,
      bb,
      bbStr,
      rangeGrid: rangeGrid(ctx, candidate.rangeId),
      tokenKey: candidate.tokenKey || null,
      hidden: !!candidate.isHideTalent,
      fromModule: false,
    })
  })
  return talents
}

export function moduleTalentChanges(ctx: SeasonContext, moduleParts: any, modPhase: number, modLevel: number, label: string): any[] {
  const out: any[] = []
  for (const part of moduleParts || []) {
    const candidates = part.addOrOverrideTalentDataBundle?.candidates
    if (!candidates) continue
    const candidate = bestCandidate(candidates, modPhase, modLevel)
    if (!candidate) continue
    const { bb, bbStr } = flattenBB(candidate.blackboard, `${label} module talent`, ctx.notes)
    const text = candidate.upgradeDescription || candidate.description
    const pair = textPair(text, ctx.notes, bb, bbStr)
    out.push({
      talentIndex: candidate.talentIndex,
      name: candidate.name || null,
      desc: pair.desc,
      descRaw: pair.descRaw,
      bb,
      bbStr,
      rangeGrid: rangeGrid(ctx, candidate.rangeId),
      tokenKey: candidate.tokenKey || null,
      hidden: !!candidate.isHideTalent,
    })
  }
  return out
}

export function mergeTalentChanges(base: any[], changes: any): any[] {
  const talents = base.map((talent) => ({ ...talent }))
  for (const change of changes || []) {
    const { talentIndex, ...rest } = change
    const record = { index: talentIndex, ...rest, fromModule: true }
    const at = talentIndex >= 0 ? talents.findIndex((talent) => talent.index === talentIndex) : -1
    if (at >= 0) {
      const old = talents[at]
      talents[at] = {
        ...record,
        name: record.name || old.name,
        desc: record.desc ?? old.desc,
        descRaw: record.descRaw ?? old.descRaw,
        bb: { ...old.bb, ...record.bb },
        bbStr: { ...old.bbStr, ...record.bbStr },
        rangeGrid: record.rangeGrid || old.rangeGrid,
        tokenKey: record.tokenKey || old.tokenKey,
        hidden: old.hidden && record.hidden,
      }
    } else {
      talents.push(record)
    }
  }
  return talents.filter((talent) => talent.name || talent.desc || Object.keys(talent.bb).length || talent.tokenKey)
}

export function buildTalents(ctx: SeasonContext, char: any, phase: number, level: number, moduleParts: any, label: string, modPhase: number = phase, modLevel: number = level): any[] {
  return mergeTalentChanges(baseTalentList(ctx, char, phase, level, label), moduleTalentChanges(ctx, moduleParts, modPhase, modLevel, label))
}

export function bonusOf(modulePhase: any): Record<string, any> {
  const bonus: Record<string, any> = {}
  for (const entry of modulePhase?.attributeBlackboard || []) bonus[entry.key] = (bonus[entry.key] || 0) + entry.value
  return bonus
}
