import { applyModuleTraitParts, buildSkill, buildTalents, classifyAttack, immunitiesOf, interpolateAttrs, rangeGrid, resolveTrigger, statsFrom } from "#compiler/packet/character.js"
import type { SeasonContext } from "#compiler/packet/compile/context.js"
import { bestCandidate, flattenBB, naturalCmp, phaseIdx, stripRich, textPair } from "#compiler/packet/text/parse.js"

export const TOKEN_ABNORMAL: Readonly<Record<string, readonly string[]>> = {
  token_10015_dusk_drgn: ["healFree"],
  token_10019_nearl2_sword: ["healFree"],
  token_10017_skadi2_dedant: ["healFree"],
  token_10011_beewax_oblisk: ["healFree"],
  token_10030_mlyss_wtrman: ["healFree"],
  token_10028_vigil_wolf: ["healFree"],
  token_10012_rosmon_shield: ["healFree"],
  token_10040_siege2_vlion: ["healFree"],
  token_10058_sbell2_icetgt: ["healFree"],
  token_10039_ulpia_block: ["isolated"],
  enemy_9012_acloon: ["isolated"],
}

function classifyToken(char: any, traitText: any): any {
  const classified = classifyAttack(char, traitText)
  if (char.profession === "TOKEN" || char.profession === "TRAP") {
    const text = traitText || ""
    if (/恢复[^。，]*生命/.test(text) && !/攻击造成/.test(text)) {
      return { ...classified, dmgType: "heal", attackKind: "heal", projectile: "orb", canHitFly: false }
    }
    if (char.position === "ALL" && classified.attackKind === "melee") {
      return { ...classified, attackKind: "ranged", projectile: classified.dmgType === "arts" ? "bolt" : "arrow", canHitFly: true }
    }
  }
  return classified
}

function tokenVariant(ctx: SeasonContext, tokenId: string, char: any, owner: any): any {
  const phase = owner.phase
  const level = owner.level
  const clampedPhase = Math.min(phase, (char.phases?.length || 1) - 1)
  const clampedLevel = Math.min(level, char.phases?.[clampedPhase]?.maxLevel || level)
  const bonus: Record<string, any> = {}
  const tokenBonus = owner.modulePhase?.tokenAttributeBlackboard?.[tokenId]
  for (const entry of Array.isArray(tokenBonus) ? tokenBonus : []) bonus[entry.key] = (bonus[entry.key] || 0) + entry.value
  const attrs = interpolateAttrs(char, clampedPhase, clampedLevel)
  const candidate = bestCandidate(char.trait?.candidates, clampedPhase, clampedLevel)
  const traitBB = flattenBB(candidate?.blackboard, "", ctx.notes)
  const traitMod = applyModuleTraitParts(owner.moduleTokenParts, phase, level, traitBB, candidate?.overrideDescripton || char.description || "", null, owner.label, ctx.notes)
  const pair = textPair(traitMod.template, ctx.notes, traitBB.bb, traitBB.bbStr, `${owner.label} trait`)
  const moduleTrait = traitMod.moduleText ? textPair(traitMod.moduleText, ctx.notes, traitBB.bb, traitBB.bbStr, `${owner.label} module trait`) : null
  const skills = char.skills || []
  const indexed = skills[owner.skillIndex]?.skillId ? owner.skillIndex : skills.findIndex((row: any) => row && row.skillId)
  const skillId = indexed >= 0 ? skills[indexed]?.skillId : null
  const skill = skillId ? buildSkill(ctx, skillId, owner.skillLevel, null, owner.label) : null
  if (skill) {
    skill.trigger = resolveTrigger(ctx, char, tokenId, indexed, skill)
    skill.index = indexed
  }
  return {
    phase: clampedPhase,
    level: clampedLevel,
    stats: statsFrom(attrs, ctx.notes, bonus),
    immunities: immunitiesOf(attrs),
    rangeGrid: rangeGrid(ctx, char.phases?.[clampedPhase]?.rangeId),
    trait: {
      desc: pair.desc,
      descRaw: pair.descRaw,
      bb: traitBB.bb,
      bbStr: traitBB.bbStr,
      ...(moduleTrait ? { moduleDesc: moduleTrait.desc, moduleDescRaw: moduleTrait.descRaw } : {}),
    },
    ...classifyToken(char, pair.desc),
    skill,
    talents: buildTalents(ctx, char, clampedPhase, clampedLevel, owner.moduleTokenParts, owner.label, phase, level),
  }
}

function enemyAsTokenStats(enemy: any): any {
  return {
    maxHp: enemy.stats.maxHp,
    atk: enemy.stats.atk,
    def: enemy.stats.def,
    res: enemy.stats.res,
    cost: 0,
    blockCnt: 0,
    bat: enemy.stats.bat,
    aspd: enemy.stats.aspd,
    respawnTime: 0,
    spRecovery: 0,
    hpRecoveryPerSec: enemy.stats.hpRecoveryPerSec,
    moveSpeed: enemy.stats.moveSpeed,
    tauntLevel: enemy.stats.tauntLevel,
    massLevel: enemy.stats.massLevel,
    deployLimit: 2,
    deckStack: 0,
    rangeRadius: enemy.stats.rangeRadius,
  }
}

function makesToken(list: readonly string[] | undefined): boolean {
  return (list || []).some((source) => source === "talent" || source === "skill")
}

export function buildTokens(ctx: SeasonContext, tokenOwners: Map<string, any[]>, enemies: Record<string, any>): Record<string, any> {
  const { charTable, ac } = ctx
  const out: Record<string, any> = {}
  const displayType = (id: string): any => ac.shopStateTokenDict?.[id]?.tokenDisplayType || null
  for (const tokenId of [...tokenOwners.keys()].sort(naturalCmp)) {
    const char = charTable[tokenId]
    const owners = tokenOwners.get(tokenId) || []
    const variants: Record<string, any> = {}
    for (const owner of owners) {
      const label = `token ${tokenId}@${owner.chessId}`
      const variant = variants[owner.chessId] = {
        ...tokenVariant(ctx, tokenId, char, { ...owner, label }),
        count: owner.count,
        sources: owner.sources,
      }
      if (owner.skillAlts?.length) {
        variant.bySkill = {}
        for (const alt of owner.skillAlts) {
          const rebuilt = tokenVariant(ctx, tokenId, char, { ...owner, skillIndex: alt.index, label })
          variant.bySkill[alt.index] = { skill: rebuilt.skill, count: alt.count, sources: alt.sources }
        }
      }
      if (owner.moduleAlts?.length) {
        variant.byModule = {}
        for (const alt of owner.moduleAlts) {
          const rebuilt = tokenVariant(ctx, tokenId, char, { ...owner, modulePhase: alt.modulePhase, moduleTokenParts: alt.moduleTokenParts, label })
          variant.byModule[alt.id] = { stats: rebuilt.stats, immunities: rebuilt.immunities, trait: rebuilt.trait, talents: rebuilt.talents }
        }
      }
    }
    const firstOwner = owners[0]
    const first = firstOwner ? variants[firstOwner.chessId] : null
    if (!first || !firstOwner) continue
    const produced = owners.some((owner) => makesToken(owner.sources) || (owner.skillAlts || []).some((alt: any) => makesToken(alt.sources)))
    const ownerRange = /只能部署在\S*攻击范围内/.test(stripRich(first.trait.desc) || "")
    const abnormal = TOKEN_ABNORMAL[tokenId]
    out[tokenId] = {
      tokenId,
      kind: "summon",
      name: char.name,
      appellation: char.appellation || null,
      desc: stripRich(first.trait.desc),
      descRaw: first.trait.descRaw,
      profession: char.profession,
      subProfessionId: char.subProfessionId,
      position: char.position,
      displayType: displayType(tokenId),
      placeable: displayType(tokenId) !== "HIDDEN" && produced,
      ownerRange,
      owners: owners.map((owner) => owner.chessId),
      stats: first.stats,
      rangeGrid: first.rangeGrid,
      dmgType: first.dmgType,
      attackKind: first.attackKind,
      projectile: first.projectile,
      canHitFly: first.canHitFly,
      skill: first.skill ? { skillId: first.skill.skillId, bb: first.skill.bb } : null,
      deployLimit: first.stats?.deployLimit ?? 1,
      count: first.count,
      abnormal: abnormal ? [...abnormal] : [],
      variants,
    }
  }
  const loon = enemies["enemy_9012_acloon"]
  if (loon) {
    const loonAbnormal = TOKEN_ABNORMAL.enemy_9012_acloon ?? []
    out["enemy_9012_acloon"] = {
      tokenId: "enemy_9012_acloon",
      kind: "bondSummon",
      bondId: "yanShip",
      name: loon.name,
      appellation: null,
      desc: "【炎】6名成员激活时召唤的友方单位；开战时攻击力/生命值增加【炎】干员攻击力/生命值总和的30%（见 bonds.json yanShip）",
      descRaw: null,
      profession: "TOKEN",
      subProfessionId: null,
      position: "NONE",
      motion: loon.stats.motion,
      displayType: null,
      placeable: false,
      ownerRange: false,
      owners: [],
      stats: enemyAsTokenStats(loon),
      rangeGrid: null,
      dmgType: loon.stats.dmgType,
      attackKind: "ranged",
      projectile: "bolt",
      canHitFly: true,
      skill: loon.skills?.[0] ? { skillId: loon.skills[0].prefabKey, bb: loon.skills[0].bb } : null,
      skills: loon.skills,
      talents: loon.talents,
      deployLimit: 2,
      count: 1,
      abnormal: [...loonAbnormal],
      variants: {},
    }
  } else ctx.notes.warn("炎佑 enemy_9012_acloon missing from enemies")
  const mapChars = new Map<string, { inst: any, positions: any[] }>()
  for (const stageId of ctx.stageIds) {
    for (const inst of ctx.levels[stageId]?.predefines?.characterInsts || []) {
      const key = inst.inst?.characterKey
      if (!key) continue
      if (!mapChars.has(key)) mapChars.set(key, { inst, positions: [] })
      const entry = mapChars.get(key)
      if (!entry) continue
      if (!entry.positions.some((position) => position.alias === inst.alias)) {
        entry.positions.push({
          alias: inst.alias,
          pos: [inst.position.row, inst.position.col],
          dir: inst.direction,
          multiOnly: /multi_only/.test(inst.alias || ""),
        })
      }
    }
  }
  for (const [charId, { inst, positions }] of [...mapChars].sort((left, right) => naturalCmp(left[0], right[0]))) {
    const char = charTable[charId]
    if (!char) {
      ctx.notes.warn(`map character ${charId} missing from character_table`)
      continue
    }
    const variant = tokenVariant(ctx, charId, char, {
      phase: phaseIdx(inst.inst.phase),
      level: inst.inst.level || 1,
      skillIndex: inst.skillIndex ?? 0,
      skillLevel: inst.mainSkillLvl || 1,
      modulePhase: null,
      label: `mapChar ${charId}`,
    })
    out[charId] = {
      tokenId: charId,
      kind: "mapChar",
      name: char.name,
      appellation: char.appellation || null,
      desc: variant.trait.desc,
      descRaw: variant.trait.descRaw,
      profession: char.profession,
      subProfessionId: char.subProfessionId,
      position: char.position,
      displayType: null,
      placeable: false,
      ownerRange: false,
      owners: [],
      stats: variant.stats,
      rangeGrid: variant.rangeGrid,
      dmgType: variant.dmgType,
      attackKind: variant.attackKind,
      projectile: variant.projectile,
      canHitFly: variant.canHitFly,
      skill: variant.skill,
      talents: variant.talents,
      trait: variant.trait,
      phase: variant.phase,
      level: variant.level,
      deployLimit: 1,
      count: 1,
      abnormal: [],
      positions: positions.sort((left, right) => naturalCmp(left.alias, right.alias)),
      variants: {},
      source: "band_amedic (aceffect_band_61 auto_chess_change_map)",
    }
  }
  return out
}
