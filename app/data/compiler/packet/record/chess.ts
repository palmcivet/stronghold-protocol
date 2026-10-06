import {
  baseTalentList,
  bonusOf,
  buildSkill,
  immunitiesOf,
  interpolateAttrs,
  mergeTalentChanges,
  moduleAttr,
  moduleTalentChanges,
  rangeGrid,
  resolveTrigger,
  splitModuleParts,
  statsFrom,
  traitRecord,
} from "#compiler/packet/character.js"
import type { SeasonContext } from "#compiler/packet/compile/context.js"
import { bestCandidate, naturalCmp, phaseIdx, unlocked } from "#compiler/packet/text/parse.js"

function hasE2Art(ctx: SeasonContext, charId: string, kind: string): boolean {
  const art = ctx.research.assets?.operators?.[charId]?.[kind]
  if (art) return !!art.e2
  return (ctx.charTable[charId]?.phases?.length || 0) >= 3
}

export function buildChess(ctx: SeasonContext): { chess: Record<string, any>, tokenOwners: Map<string, any[]> } {
  const { act, charTable, uniequip, battleEquip } = ctx
  const out: Record<string, any> = {}
  const tokenOwners = new Map<string, any[]>()
  const diyIds = new Set(Object.keys(act.diyChessDict || {}))
  const priceTable = act.shopCharChessInfoData
  for (const chessId of Object.keys(act.charChessDataDict).sort(naturalCmp)) {
    const data = act.charChessDataDict[chessId]
    const baseId = act.chessNormalIdLookupDict[chessId] || chessId
    const shop = act.charShopChessDatas[baseId]
    if (!shop) {
      ctx.notes.warn(`chess ${chessId}: no charShopChessDatas entry for ${baseId}`)
      continue
    }
    const isGolden = !!data.isGolden
    const tier = shop.chessLevel
    const status = data.status || {}
    const phase = phaseIdx(status.evolvePhase)
    const level = status.charLevel || 1
    const priceRow = (priceTable[String(tier)] || []).find((row: any) => !!row.isGolden === isGolden) || {}
    const isDiy = shop.chessType === "DIY" || diyIds.has(baseId)
    const rec: Record<string, any> = {
      chessId,
      baseId,
      goldenId: shop.goldenChessId,
      isGolden,
      tier,
      identifier: data.identifier,
      isHidden: !!shop.isHidden,
      isDiy,
      visible: !shop.isHidden && !isDiy,
      chessType: shop.chessType,
      shopSortId: shop.shopLevelSortId,
      charId: shop.charId || null,
      name: null,
      appellation: null,
      rarity: null,
      profession: null,
      subProfessionId: null,
      subProfessionName: null,
      position: null,
      nationId: null,
      bonds: [...(data.bondIds || [])],
      garrisonIds: [...(data.garrisonIds || [])],
      price: priceRow.purchasePrice ?? null,
      sellPrice: priceRow.chessSoldPrice ?? null,
      upgradeNum: data.upgradeNum,
      upgradeChessId: data.upgradeChessId || null,
      status: { phase, level, skillLevel: status.skillLevel, equipLevel: status.equipLevel || 0 },
      stats: null,
      immunities: null,
      rangeId: null,
      rangeGrid: null,
      dmgType: null,
      attackKind: null,
      projectile: null,
      canHitFly: false,
      targetPriority: null,
      trait: null,
      skill: null,
      talents: [],
      tokens: [],
      module: null,
      assets: null,
    }
    if (isDiy) {
      rec.name = "甄选干员"
      rec.diyRequirement = act.diyChessDict?.[baseId] || null
      out[chessId] = rec
      continue
    }
    const char = charTable[shop.charId]
    if (!char) {
      ctx.notes.warn(`chess ${chessId}: char ${shop.charId} missing from character_table`)
      out[chessId] = rec
      continue
    }
    rec.name = char.name
    rec.appellation = char.appellation
    rec.rarity = Number(String(char.rarity).replace("TIER_", "")) || null
    rec.profession = char.profession
    rec.subProfessionId = char.subProfessionId
    rec.subProfessionName = uniequip.subProfDict?.[char.subProfessionId]?.subProfessionName || null
    rec.position = char.position
    rec.nationId = char.nationId || null
    const modId = shop.defaultUniEquipId || null
    const equipLevel = status.equipLevel || 0
    let modulePhase = null
    if (modId) {
      const meta = uniequip.equipDict?.[modId]
      const equip = battleEquip[modId]
      if (equipLevel > 0) {
        modulePhase = equip?.phases?.find((row: any) => row.equipLevel === equipLevel) || null
        if (!modulePhase) ctx.notes.warn(`chess ${chessId}: module ${modId} has no level ${equipLevel}`)
      }
      rec.module = {
        id: modId,
        name: meta?.uniEquipName || null,
        type: meta ? `${meta.typeName1 || ""}${meta.typeName2 ? "-" + meta.typeName2 : ""}` : null,
        level: equipLevel,
        active: equipLevel > 0 && !!modulePhase,
      }
    } else if (equipLevel > 0) {
      rec.module = { id: null, name: null, type: null, level: equipLevel, active: false }
    }
    const moduleParts = splitModuleParts(modulePhase)
    const attrs = interpolateAttrs(char, phase, level)
    if (!attrs) ctx.notes.warn(`chess ${chessId}: cannot interpolate attributes`)
    rec.stats = statsFrom(attrs, ctx.notes, bonusOf(modulePhase))
    if (rec.stats) rec.immunities = immunitiesOf(attrs)
    const rangeId = char.phases?.[phase]?.rangeId || null
    const traitDefault = traitRecord(ctx, char, phase, level, moduleParts.op, chessId)
    rec.trait = traitDefault.trait
    rec.rangeId = rangeId
    rec.rangeGrid = rangeGrid(ctx, rangeId)
    Object.assign(rec, traitDefault.classify)
    const skillIndex = shop.defaultSkillIndex ?? 0
    const skillEntry = char.skills?.[skillIndex]
    const skillLevel = status.skillLevel || 1
    const skillRecs: any[] = []
    ;(char.skills || []).forEach((entry: any, index: number) => {
      if (!entry?.skillId || (index !== skillIndex && !unlocked(entry.unlockCond, phase, level))) return
      const skill = buildSkill(ctx, entry.skillId, skillLevel, null, `chess ${chessId}`)
      if (!skill) return
      skill.trigger = resolveTrigger(ctx, char, shop.charId, index, skill, { operator: true, chessId: baseId })
      skill.index = index
      skill.overrideTokenKey = entry.overrideTokenKey || null
      skillRecs.push(skill)
    })
    if (!skillEntry?.skillId) ctx.notes.warn(`chess ${chessId}: default skill index ${skillIndex} not found`)
    else {
      const chosen = skillRecs.find((skill) => skill.index === skillIndex)
      rec.skill = chosen ? { ...chosen } : null
    }
    rec.skills = skillRecs.map((skill) => ({ ...skill, isDefault: skill.index === skillIndex }))
    const talentList = baseTalentList(ctx, char, phase, level, `chess ${chessId}`)
    rec.talents = mergeTalentChanges(talentList, moduleTalentChanges(ctx, moduleParts.op, phase, level, `chess ${chessId}`))
    const moduleAlts: any[] = []
    if (isGolden && equipLevel > 0) {
      rec.statsBase = statsFrom(attrs, ctx.notes, {})
      rec.traitBase = traitRecord(ctx, char, phase, level, [], chessId).trait
      rec.talentsBase = mergeTalentChanges(talentList, [])
      rec.modules = []
      for (const id of uniequip.charEquip?.[shop.charId] || []) {
        const meta = uniequip.equipDict?.[id]
        if (!meta || meta.type === "INITIAL") continue
        const phaseRow = battleEquip[id]?.phases?.find((row: any) => row.equipLevel === equipLevel) || null
        if (!phaseRow) {
          ctx.notes.warn(`chess ${chessId}: module ${id} has no level ${equipLevel} (not selectable)`)
          continue
        }
        const parts = splitModuleParts(phaseRow)
        const hasTraitPart = parts.op.some((part: any) => bestCandidate(part.overrideTraitDataBundle?.candidates, phase, level))
        const trait = hasTraitPart ? traitRecord(ctx, char, phase, level, parts.op, chessId) : null
        if (trait && JSON.stringify(trait.classify) !== JSON.stringify(traitDefault.classify)) {
          ctx.notes.warn(`chess ${chessId}: module ${id} changes the combat classification (not applied by loadouts)`)
        }
        rec.modules.push({
          uniEquipId: id,
          name: meta.uniEquipName || null,
          typeName: `${meta.typeName1 || ""}${meta.typeName2 ? "-" + meta.typeName2 : ""}`,
          typeIcon: meta.typeIcon || null,
          icon: meta.uniEquipIcon || id,
          isDefault: id === modId,
          level: equipLevel,
          attr: moduleAttr(ctx, phaseRow),
          traitOverride: trait ? trait.trait : null,
          talentChanges: moduleTalentChanges(ctx, parts.op, phase, level, `chess ${chessId}`),
        })
        if (id !== modId) moduleAlts.push({ id, modulePhase: phaseRow, moduleTokenParts: parts.token })
      }
      if (modId) moduleAlts.push({ id: "none", modulePhase: null, moduleTokenParts: [] })
    }
    const skillToken = skillEntry?.overrideTokenKey || null
    for (const talent of [...rec.talents, ...(rec.talentsBase || [])]) {
      if (talent.tokenKey && !charTable[talent.tokenKey] && skillToken && charTable[skillToken]) {
        talent.containerTokenKey = talent.tokenKey
        talent.tokenKey = skillToken
      }
    }
    const tokenUse = (skillRec: any): { use: Map<string, Set<string>>, count: (id: string) => any } => {
      const ownedToken = skillRec?.overrideTokenKey || null
      const use = new Map<string, Set<string>>()
      const add = (id: string, source: string): void => {
        if (!use.has(id)) use.set(id, new Set())
        use.get(id)?.add(source)
      }
      for (const id of Object.keys(char.displayTokenDict || {})) add(id, "display")
      if (ownedToken) add(ownedToken, "skill")
      for (const talent of rec.talents) {
        const key = talent.containerTokenKey ? (ownedToken && charTable[ownedToken] ? ownedToken : talent.tokenKey) : talent.tokenKey
        if (key) add(key, "talent")
      }
      const count = (id: string): any => {
        const talent = rec.talents.find((row: any) => (row.containerTokenKey ? (ownedToken && charTable[ownedToken] ? ownedToken : row.tokenKey) : row.tokenKey) === id && typeof row.bb.cnt === "number")
        const skillCnt = ownedToken === id ? skillRec?.bb?.cnt : undefined
        return talent ? talent.bb.cnt : typeof skillCnt === "number" ? skillCnt : null
      }
      return { use, count }
    }
    const defaultUse = tokenUse(rec.skill)
    const sources = defaultUse.use
    const resolvable = [...sources.keys()].filter((id) => {
      if (charTable[id]) return true
      if (!rec.talents.some((talent: any) => talent.containerTokenKey === id)) ctx.notes.warn(`chess ${chessId}: token ${id} not in character_table (skipped)`)
      return false
    }).sort(naturalCmp)
    rec.tokens = resolvable
    const altSkills = rec.skills.filter((skill: any) => skill.index !== skillIndex)
    for (const skill of altSkills) {
      for (const id of tokenUse(skill).use.keys()) {
        if (charTable[id] && !resolvable.includes(id)) ctx.notes.warn(`chess ${chessId}: token ${id} of skill ${skill.skillId} is not listed by the character (loadouts cannot summon it)`)
      }
    }
    for (const tokenId of resolvable) {
      const source = sources.get(tokenId)
      const skillAlts = altSkills.map((skill: any) => {
        const used = tokenUse(skill)
        return {
          index: skill.index,
          count: used.count(tokenId),
          sources: ["talent", "skill", "display"].filter((name) => used.use.get(tokenId)?.has(name)),
        }
      })
      if (!tokenOwners.has(tokenId)) tokenOwners.set(tokenId, [])
      tokenOwners.get(tokenId)?.push({
        chessId,
        charId: shop.charId,
        phase,
        level,
        skillIndex,
        skillLevel,
        count: defaultUse.count(tokenId),
        golden: isGolden,
        modulePhase,
        moduleTokenParts: moduleParts.token,
        sources: ["talent", "skill", "display"].filter((name) => source?.has(name)),
        skillAlts,
        moduleAlts,
      })
    }
    const e2Avatar = isGolden && hasE2Art(ctx, shop.charId, "avatar")
    const e2Portrait = isGolden && hasE2Art(ctx, shop.charId, "portrait")
    rec.assets = {
      avatar: e2Avatar ? `${shop.charId}_2` : shop.charId,
      portrait: `${shop.charId}_${e2Portrait ? 2 : 1}`,
      spine: shop.charId,
      skillIcon: rec.skill?.iconId || null,
      subProfIcon: `sub_${char.subProfessionId}_icon`,
    }
    out[chessId] = rec
  }
  for (const rec of Object.values(out)) {
    if (!out[rec.baseId]) ctx.notes.warn(`chess ${rec.chessId}: baseId ${rec.baseId} missing`)
    if (rec.goldenId && !out[rec.goldenId]) ctx.notes.warn(`chess ${rec.chessId}: goldenId ${rec.goldenId} missing`)
  }
  return { chess: out, tokenOwners }
}
