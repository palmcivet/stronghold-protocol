import type { SeasonContext } from "#compiler/packet/compile/context.js"
import { cleanNum, flattenBB, naturalCmp, richRaw, stripRich } from "#compiler/packet/text/parse.js"

const ENEMY_STAT_FIELDS: Readonly<Record<string, string>> = {
  maxHp: "maxHp",
  atk: "atk",
  def: "def",
  magicResistance: "res",
  moveSpeed: "moveSpeed",
  baseAttackTime: "bat",
  attackSpeed: "aspd",
  blockCnt: "blockCnt",
  massLevel: "massLevel",
  hpRecoveryPerSec: "hpRecoveryPerSec",
  tauntLevel: "tauntLevel",
  epDamageResistance: "elementDmgRes",
  epResistance: "elementRes",
  damageHitratePhysical: "hitRatePhys",
  damageHitrateMagical: "hitRateArts",
  rangeRadius: "rangeRadius",
  lifePointReduce: "lpr",
}
const DMG_MAP: Readonly<Record<string, string>> = { PHYSIC: "phys", MAGIC: "arts", HEAL: "heal", NO_DAMAGE: "none", TRUE: "true", ELEMENT: "element" }

const HIT_AREAS: Readonly<Record<string, { readonly w: number, readonly h: number, readonly dx: number, readonly dy: number }>> = {
  enemy_9013_acstmk: { w: 4.95, h: 2.95, dx: 0, dy: 1 },
  enemy_9021_acduml: { w: 4.95, h: 2.95, dx: 0, dy: 1 },
  enemy_9021_acduml_2: { w: 4.95, h: 2.95, dx: 1, dy: 1 },
  enemy_1521_dslily: { w: 4.95, h: 2.95, dx: 0, dy: 1 },
  enemy_9032_aclionk: { w: 4.95, h: 2.95, dx: 0, dy: 1 },
  enemy_9033_acdeer: { w: 4.95, h: 2.95, dx: 0, dy: 1 },
}

const STATIC_BODIES: ReadonlySet<string> = new Set([
  "enemy_1005_yokai", "enemy_1005_yokai_2", "enemy_1005_yokai_3",
  "enemy_1017_defdrn", "enemy_1040_bombd", "enemy_1041_lazerd", "enemy_1041_lazerd_2", "enemy_1042_frostd",
  "enemy_1112_emppnt", "enemy_1112_emppnt_2",
  "enemy_1269_nhfly", "enemy_1321_wdarft",
  "enemy_1355_mrfly", "enemy_1355_mrfly_2", "enemy_1407_hummbd",
  "enemy_1430_lrrook", "enemy_1521_dslily",
  "enemy_9009_acfort", "enemy_9014_acstma", "enemy_9015_acstmb", "enemy_9016_acstmr",
  "enemy_10028_vtswd", "enemy_10029_vtshld", "enemy_10030_vtwand",
  "enemy_10040_cnvbln",
  "enemy_10083_hlbird", "enemy_10084_hlegle", "enemy_10085_hllevi_2",
])

const MODEL_SCALE_STANDARD: number = 0.27
const MODEL_SCALES: ReadonlyMap<number, readonly string[]> = new Map([
  [0.16, ["1005_yokai_3"]],
  [0.18, ["1042_frostd"]],
  [0.19, ["1112_emppnt", "1112_emppnt_2"]],
  [0.2, ["1005_yokai", "1040_bombd", "1041_lazerd", "1041_lazerd_2"]],
  [0.216, ["1067_snslime"]],
  [0.22, ["1005_yokai_2", "1017_defdrn"]],
  [0.23, ["1158_divman", "1161_tidmag", "1161_tidmag_2"]],
  [0.24, ["1009_lurker", "1019_jshoot", "1019_jshoot_2", "1043_zomsbr", "1071_dftman", "1072_dlancer", "1116_liprr", "1116_liprr_2",
    "1118_lidbox_2", "1160_hvyslr", "1160_hvyslr_2", "1162_magmot", "1165_duhond", "1165_duhond_2", "1168_dumage", "1168_dumage_2",
    "1183_mlasrt", "1195_sfyin", "1195_sfyin_2", "1197_sfshu", "1197_sfshu_2", "1199_sfjin", "1203_sfhu", "1203_sfhu_2", "1207_sfji",
    "1207_sfji_2", "1209_sfden", "1209_sfden_2", "1267_nhpbr", "1267_nhpbr_2", "1269_nhfly", "1270_nhstlk", "1270_nhstlk_2",
    "1272_nhtank", "1272_nhtank_2", "1273_stmgun_2", "1275_dwlock_2", "1500_skulsr", "2002_bearmi", "2003_rockman", "2004_balloon",
    "2005_axetro", "2008_flking", "2034_sythef"]],
  [0.25, ["1166_dusbr", "1166_dusbr_2", "1169_duphlx", "1169_duphlx_2", "1229_darmy", "1229_darmy_2"]],
  [0.26, ["1000_gopro_2", "1023_jmage", "1025_reveng", "1026_aghost", "1046_agent", "1249_lysdb_2", "1251_lysyta", "1251_lysyta_2",
    "1252_lysytb_2", "1254_lypa_2", "1283_sgkill", "1283_sgkill_2", "1516_jakill", "1517_xi", "2001_duckmi"]],
  [0.28, ["1006_shield", "1010_demon", "1010_demon_2", "1061_zomshd", "1062_rager_2", "1069_icebrk_2", "1119_vofsd", "1170_dushld",
    "1170_dushld_2", "1172_dugago", "1172_dugago_2", "1174_duholy", "1174_duholy_2", "1175_dushdo_2", "2025_syufo"]],
  [0.29, ["1081_sotisd", "1513_dekght", "1513_dekght_2"]],
  [0.297, ["2009_csaudc"]],
  [0.3, ["1001_bigbo", "1045_hammer", "1045_hammer_2", "1121_lifbos", "1121_lifbos_2", "1501_demonk", "1535_wlfmster"]],
  [0.31, ["1006_shield_2"]],
  [0.34, ["1006_shield_3"]],
  [0.35, ["1092_mdgint"]],
  [0.4, ["1196_msfyin", "1196_msfyin_2", "1198_msfshu", "1198_msfshu_2", "1202_msfzhi", "1202_msfzhi_2"]],
  [0.5, ["1208_msfji", "1208_msfji_2", "1210_msfden", "1210_msfden_2"]],
  [0.6, ["1200_msfjin", "1200_msfjin_2", "1204_msfhu", "1204_msfhu_2"]],
])
const MODEL_SCALE_BY_PREFAB: Map<string, number> = new Map()
for (const [value, list] of MODEL_SCALES) for (const key of list) MODEL_SCALE_BY_PREFAB.set(`enemy_${key}`, Math.round((value / MODEL_SCALE_STANDARD) * 1e4) / 1e4)

export function templateSlots(ctx: SeasonContext): Record<string, string> {
  const data = ctx.ac.constData
  const slots: Record<string, string> = {
    [data.templateEnemyNormal]: "N",
    [data.templateEnemyElite]: "E",
    [data.templateEnemySpecial]: "S",
    [data.templateEnemyNormalFly]: "NF",
    [data.templateEnemyEliteFly]: "EF",
    [data.templateEnemySpecialFly]: "SF",
    [data.templateEnemyToken]: "T",
    [data.templateEnemyTokenFly]: "TF",
  }
  delete slots["undefined"]
  return slots
}

function mergeEnemyData(base: any, over: any): any {
  if (!over) return base
  const out = { ...base }
  for (const [key, value] of Object.entries(over)) {
    if (value && typeof value === "object" && "m_defined" in (value as object)) {
      if ((value as any).m_defined) out[key] = value
      continue
    }
    if (key === "attributes" && value && typeof value === "object") {
      out.attributes = mergeEnemyData(base.attributes || {}, value)
      continue
    }
    if ((key === "talentBlackboard" || key === "skills" || key === "spData") && value != null) out[key] = value
  }
  return out
}

function mv(field: any, fallback: any = null): any {
  if (!field || typeof field !== "object" || !("m_value" in field)) return fallback
  const value = field.m_value
  if (field.m_defined === false && (value == null || value === 0 || value === false || value === "")) return fallback
  return value
}

export function definedFields(over: any): Record<string, any> {
  const out: Record<string, any> = {}
  if (!over) return out
  for (const [key, value] of Object.entries(over)) {
    if (value && typeof value === "object" && "m_defined" in (value as object)) {
      if ((value as any).m_defined) out[key] = (value as any).m_value
    } else if (key === "attributes" && value) Object.assign(out, definedFields(value))
    else if ((key === "talentBlackboard" || key === "skills") && value != null) out[key] = value
  }
  return out
}

export function effectiveRangeRadius(applyWay: any, raw: any): number {
  if (applyWay === "MELEE" || typeof raw !== "number" || !Number.isFinite(raw)) return 0
  return Math.max(0, raw)
}

function enemySkills(list: any, label: string, notes: SeasonContext["notes"]): any[] {
  return (Array.isArray(list) ? list : []).map((skill: any) => {
    const { bb, bbStr } = flattenBB(skill.blackboard, `${label} skill ${skill.prefabKey}`, notes)
    return { prefabKey: skill.prefabKey, priority: skill.priority, cooldown: skill.cooldown, initCooldown: skill.initCooldown, spCost: skill.spCost, bb, bbStr }
  })
}

export function enemyOverrideRecord(over: Record<string, any>, label: string, notes: SeasonContext["notes"]): Record<string, any> {
  const stats: Record<string, any> = {}
  const extra: Record<string, any> = {}
  for (const [key, value] of Object.entries(over)) {
    const field = ENEMY_STAT_FIELDS[key]
    if (field) stats[field] = cleanNum(value)
    else if (key === "talentBlackboard") extra.talents = flattenBB(value, `${label} talents`, notes)
    else if (key === "skills") extra.skills = enemySkills(value, label, notes)
    else if (key === "motion" || key === "applyWay" || key === "levelType" || key === "notCountInTotal" || key === "name") extra[key] = value
    else if (/Immune$/.test(key)) {
      extra.immunities ||= {}
      extra.immunities[key.replace(/Immune$/, "")] = !!value
    }
  }
  return { ...(Object.keys(stats).length ? { stats } : {}), ...extra }
}

interface EnemyKeys {
  readonly keys: readonly string[]
  readonly direct: ReadonlySet<string>
}

function collectEnemyKeys(ctx: SeasonContext): EnemyKeys {
  const keys = new Set<string>()
  const add = (key: unknown): void => {
    if (typeof key === "string" && /^enemy_/.test(key)) keys.add(key)
  }
  const refs: string[] = []
  for (const id of ctx.templateIds) {
    const level = ctx.levels[id]
    for (const wave of level.waves || []) for (const fragment of wave.fragments || []) for (const action of fragment.actions || []) if (action.actionType === "SPAWN") add(action.key)
    for (const branch of Object.values(level.branches || {})) for (const phase of (branch as any).phases || []) for (const action of phase.actions || []) if (action.actionType === "SPAWN") add(action.key)
    for (const ref of level.enemyDbRefs || []) refs.push(ref.id)
  }
  for (const entry of Object.values(ctx.act.specialEnemyInfoDict || {})) {
    add((entry as any).specialEnemyKey)
    ;((entry as any).attachedNormalEnemyKeys || []).forEach(add)
    ;((entry as any).attachedEliteEnemyKeys || []).forEach(add)
  }
  for (const list of Object.values(ctx.act.enemyInfoDict || {})) (list as any[]).forEach(add)
  for (const boss of Object.values(ctx.ac.bossInfoDict || {})) add((boss as any).enemyId)
  for (const key of Object.keys(templateSlots(ctx))) add(key)
  for (const mode of Object.values(ctx.act.modeDataDict)) ((mode as any).inactiveEnemyKey || []).forEach(add)
  for (const buffs of Object.values(ctx.act.effectBuffInfoDataDict || {})) {
    for (const buff of buffs as any[]) for (const entry of buff.blackboard || []) {
      if (typeof entry.valueStr === "string") for (const match of entry.valueStr.matchAll(/enemy_[A-Za-z0-9_]+/g)) if (ctx.enemyDb.has(match[0])) add(match[0])
    }
  }
  const direct = new Set(keys)
  refs.forEach(add)
  const queue = [...keys]
  while (queue.length) {
    const key = queue.pop()
    if (key === undefined) continue
    const extra = ctx.ac.randomEnemyAttributeDict?.[key]?.extraEnemyKeyList || []
    const levels = ctx.enemyDb.get(key) || []
    const found = [...extra]
    for (const level of levels) {
      const data = level.enemyData || {}
      for (const entry of [...(data.talentBlackboard || []), ...(data.skills || []).flatMap((skill: any) => skill.blackboard || [])]) {
        if (typeof entry.valueStr === "string") for (const match of entry.valueStr.matchAll(/enemy_[A-Za-z0-9_]+/g)) found.push(match[0])
      }
    }
    for (const ref of found) if (!keys.has(ref) && ctx.enemyDb.has(ref)) {
      keys.add(ref)
      queue.push(ref)
    }
  }
  return { keys: [...keys].sort(naturalCmp), direct }
}

function enemyAttrPower(ctx: SeasonContext, key: string, level: number): number {
  const data = ctx.ac.constData
  const levels = ctx.enemyDb.get(key) || []
  const base = levels.find((row: any) => row.level === 0)?.enemyData?.attributes || levels[0]?.enemyData?.attributes || {}
  const over = level ? levels.find((row: any) => row.level === level)?.enemyData?.attributes || {} : {}
  const read = (name: string): number => {
    const override = over[name]
    if (override && override.m_defined) return Number(override.m_value) || 0
    return Number(base[name]?.m_value) || 0
  }
  const round = Math.fround
  let power = round(round(round(read("atk") * (data.enemyAtkFactor ?? 5)) + round(read("maxHp") * (data.enemyMaxHpFactor ?? 1))) + round(read("def") * (data.enemyDefFactor ?? 3)))
  power = round(power + round((data.enemyMagicResistanceFactor ?? 3) * read("magicResistance")))
  return power
}

/**
 * Attack animation of every enemy record. `null` means no clip: `mission-core/battle/unit/attack.ts`
 * then rests for `ATTACK_PAUSE` with no windup, which is the timing every enemy has today.
 */
export const DEFAULT_ATTACK_ANIM: null = null

const BAND_SWAP_LPR: number = 1

function bandSwapEnemyKeys(act: any): Set<string> {
  const out = new Set<string>()
  for (const buffs of Object.values(act.effectBuffInfoDataDict || {})) for (const buff of (buffs as any[]) || []) {
    if (buff?.key !== "round_start_all_player_change_enemy_2") continue
    for (const entry of buff.blackboard || []) if (entry.key === "enemylist") for (const key of String(entry.valueStr || "").split(",")) if (key.trim()) out.add(key.trim())
  }
  return out
}

export function buildEnemies(ctx: SeasonContext): Record<string, any> {
  const { ac, act, handbook } = ctx
  const swapKeys = bandSwapEnemyKeys(act)
  const data = ac.constData
  const hpFactor = data.enemyMaxHpFactor ?? 1
  const atkFactor = data.enemyAtkFactor ?? 5
  const defFactor = data.enemyDefFactor ?? 3
  const resFactor = data.enemyMagicResistanceFactor ?? 3
  const globalOverrides = new Map<string, any>()
  const overrideLevel = ctx.enemyDataLevelId ? ctx.levels[ctx.enemyDataLevelId] : undefined
  for (const ref of overrideLevel?.enemyDbRefs || []) if (ref.overwrittenData) globalOverrides.set(ref.id, ref.overwrittenData)
  const slots = templateSlots(ctx)
  const typeOf = new Map<string, string[]>()
  for (const [type, list] of Object.entries(act.enemyInfoDict || {})) for (const key of list as any[]) {
    if (!typeOf.has(key)) typeOf.set(key, [])
    typeOf.get(key)?.push(type)
  }
  const specialType = new Map(Object.values(act.specialEnemyInfoDict || {}).map((entry: any) => [entry.specialEnemyKey, entry.type]))
  const inactiveIn = new Map<string, string[]>()
  for (const mode of Object.values(act.modeDataDict)) for (const key of (mode as any).inactiveEnemyKey || []) {
    if (!inactiveIn.has(key)) inactiveIn.set(key, [])
    inactiveIn.get(key)?.push((mode as any).modeId)
  }
  const out: Record<string, any> = {}
  const allKeys = collectEnemyKeys(ctx)
  for (const key of allKeys.keys) {
    const levels = ctx.enemyDb.get(key)
    if (!levels || !levels.length) {
      ctx.notes.warn(`enemy ${key} missing from enemy_database`)
      continue
    }
    const random = ac.randomEnemyAttributeDict?.[key] || null
    const wantLevel = random?.level ?? 0
    const base = levels.find((row: any) => row.level === 0)?.enemyData || levels[0].enemyData
    let merged = base
    if (wantLevel > 0) {
      const level = levels.find((row: any) => row.level === wantLevel)
      if (level) merged = mergeEnemyData(base, level.enemyData)
      else ctx.notes.warn(`enemy ${key}: level ${wantLevel} missing, using 0`)
    }
    const override = globalOverrides.get(key) || null
    if (override) merged = mergeEnemyData(merged, override)
    const attributes = merged.attributes || {}
    const book = handbook.enemyData?.[key] || null
    const dmgTypes = (book?.damageType || []).map((kind: string) => DMG_MAP[kind] || String(kind).toLowerCase())
    const applyWay = mv(merged.applyWay, "NONE")
    let dmgType = dmgTypes[0] || (applyWay === "NONE" ? "none" : "phys")
    if (applyWay === "NONE" && !dmgTypes.length) dmgType = "none"
    const rawRangeRadius = cleanNum(mv(merged.rangeRadius, 0))
    const stats: Record<string, any> = {
      maxHp: mv(attributes.maxHp, 0),
      atk: mv(attributes.atk, 0),
      def: mv(attributes.def, 0),
      res: cleanNum(mv(attributes.magicResistance, 0)),
      moveSpeed: cleanNum(mv(attributes.moveSpeed, 1)),
      bat: cleanNum(mv(attributes.baseAttackTime, 1)),
      aspd: cleanNum(mv(attributes.attackSpeed, 100)),
      rangeRadius: effectiveRangeRadius(applyWay, rawRangeRadius),
      rawRangeRadius,
      blockCnt: attributes.blockCnt?.m_defined ? attributes.blockCnt.m_value : 1,
      massLevel: mv(attributes.massLevel, 0),
      lpr: mv(merged.lifePointReduce, 1),
      hpRecoveryPerSec: cleanNum(mv(attributes.hpRecoveryPerSec, 0)),
      elementRes: cleanNum(mv(attributes.epResistance, 0)),
      elementDmgRes: cleanNum(mv(attributes.epDamageResistance, 0)),
      hitRatePhys: cleanNum(mv(attributes.damageHitratePhysical, 0)),
      hitRateArts: cleanNum(mv(attributes.damageHitrateMagical, 0)),
      dmgType,
      dmgTypes,
      motion: mv(merged.motion, "WALK"),
      immunities: {
        stun: !!mv(attributes.stunImmune, false),
        silence: !!mv(attributes.silenceImmune, false),
        sleep: !!mv(attributes.sleepImmune, false),
        frozen: !!mv(attributes.frozenImmune, false),
        levitate: !!mv(attributes.levitateImmune, false),
      },
      otherImmunities: ["disarmedCombat", "feared", "palsy", "attract", "teleport", "groundBound"].filter((name) => !!mv(attributes[`${name}Immune`], false)),
      tauntLevel: mv(attributes.tauntLevel, 0),
    }
    if (swapKeys.has(key)) stats.lpr = BAND_SWAP_LPR
    const beFactor = random?.enemyBattleEffectivenessFactor ?? 1
    const be = beFactor > 0 ? Math.round((stats.maxHp * hpFactor + stats.atk * atkFactor + stats.def * defFactor + stats.res * resFactor) / beFactor) : null
    const talents = flattenBB(merged.talentBlackboard, `enemy ${key} talents`, ctx.notes)
    const abilities = (book?.abilityList || []).map((ability: any) => ({ text: stripRich(ability.text), textRaw: richRaw(ability.text), format: ability.textFormat || "NORMAL" }))
    const name = mv(merged.name) || book?.name || key
    const descRaw = mv(merged.description)
    const prefab = mv(merged.prefabKey) || key
    const hitArea = HIT_AREAS[prefab] || null
    const modelScale = MODEL_SCALE_BY_PREFAB.get(prefab) ?? null
    out[key] = {
      key,
      name,
      level: wantLevel,
      rank: mv(merged.levelType, "NORMAL"),
      handbookIndex: book?.enemyIndex || null,
      desc: stripRich(descRaw),
      descRaw: richRaw(descRaw),
      applyWay,
      stats,
      abilities,
      talents: { bb: talents.bb, bbStr: talents.bbStr },
      skills: enemySkills(merged.skills, `enemy ${key}`, ctx.notes),
      ...(merged.spData ? { sp: { type: merged.spData.spType ?? null, maxSp: merged.spData.maxSp ?? 0, initSp: merged.spData.initSp ?? 0, increment: merged.spData.increment ?? 0 } } : {}),
      notCountInTotal: !!mv(merged.notCountInTotal, false),
      tags: mv(merged.enemyTags) || [],
      be,
      beFactor,
      attrPower: enemyAttrPower(ctx, key, wantLevel),
      isFlyEnemy: random ? !!random.isFlyEnemy : stats.motion === "FLY",
      tokenOnly: !allKeys.direct.has(key),
      acTypes: typeOf.get(key) || [],
      acType: specialType.get(key) || (typeOf.get(key) || [])[0] || null,
      templateSlot: slots[key] || null,
      summons: random?.extraEnemyKeyList || [],
      inactiveIn: inactiveIn.get(key) || [],
      seasonOverride: override ? Object.keys(definedFields(override)) : null,
      iconId: key,
      spine: prefab,
      ...(hitArea ? { hitArea: { ...hitArea } } : {}),
      ...(STATIC_BODIES.has(key) ? { staticBody: true } : {}),
      ...(modelScale != null && modelScale !== 1 ? { modelScale } : {}),
      attackAnim: DEFAULT_ATTACK_ANIM,
      ...(abilities.some((ability: any) => ability.text.includes("不停止移动")) ? { attackMoves: true } : {}),
    }
  }
  for (const key of STATIC_BODIES) if (!out[key]) ctx.notes.warn(`STATIC_BODIES: ${key} is not an enemy of the mode`)
  return out
}
