import type { SeasonContext } from "#compiler/packet/compile/context.js"
import { cleanNum, listOf, phaseIdx, stripRich, templateIdOf } from "#compiler/packet/text/parse.js"

const DEFAULT_ENEMY_MULTIPLIERS: {
  readonly single: Record<string, any>
  readonly multi: Record<string, any>
  readonly abyssMoveSpeedMulFromRound3: number
} = {
  single: {
    FUNNY: { atkBase: 0.7, hpBase: 0.75, k: [0, 0, 0, 0, 0, 0, 0, 0, 0], hidden: null },
    NORMAL: { atkBase: 0.7, hpBase: 0.75, k: [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 4, 5, 5], hidden: 5 },
    HARD: { atkBase: 0.8, hpBase: 0.8, k: [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 3, 3, 4, 4], hidden: 4 },
    ABYSS: { atkBase: 1, hpBase: 1, k: [1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 5, 5, 6, 7], hidden: 7 },
  },
  multi: {
    FUNNY: { atkBase: 0.8, hpBase: 0.8, k: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1], hidden: null },
    NORMAL: { atkBase: 0.8, hpBase: 0.8, k: [0, 1, 1, 2, 2, 2, 2, 3, 4, 4, 5, 6, 7, 7], hidden: 7 },
    HARD: { atkBase: 1, hpBase: 1, k: [1, 2, 2, 3, 3, 3, 3, 3, 4, 5, 6, 6, 7, 8], hidden: 8 },
    ABYSS: {
      atkBase: 1,
      hpBase: 1,
      kAtk: [1, 2, 2, 3, 3, 4, 5, 5, 5, 5, 6, 6, 7, 8],
      hiddenAtk: 8,
      kHp: [1, 2, 2, 3, 4, 4, 7, 8, 8, 8, 9, 10, 10, 10],
      hiddenHp: 10,
      hpExtra: [1, 1, 1, 1, 1, 1.08, 1, 1, 1, 1, 1, 1, 1.08, 1.08],
      hiddenHpExtra: 1.08,
    },
  },
  abyssMoveSpeedMulFromRound3: 1.15,
}

function enemyScaleFor(table: any, type: string, difficulty: string, round: number, isHidden: boolean): any {
  const row = table?.[type === "SINGLE" ? "single" : "multi"]?.[difficulty]
  if (!row) return { atk: 1, hp: 1, speed: 1, assumed: true }
  const index = round - 1
  const pick = (values: any, hidden: any): any => (isHidden ? (hidden ?? values?.[values.length - 1] ?? 0) : (values?.[Math.min(index, (values?.length || 1) - 1)] ?? 0))
  const kAtk = row.kAtk ? pick(row.kAtk, row.hiddenAtk) : pick(row.k, row.hidden)
  const kHp = row.kHp ? pick(row.kHp, row.hiddenHp) : pick(row.k, row.hidden)
  const extra = row.hpExtra ? (isHidden ? row.hiddenHpExtra ?? 1 : row.hpExtra[Math.min(index, row.hpExtra.length - 1)] ?? 1) : 1
  const speed = difficulty === "ABYSS" && round >= 3 ? (table.abyssMoveSpeedMulFromRound3 ?? 1.15) : 1
  return { atk: cleanNum(row.atkBase * 1.1 ** kAtk), hp: cleanNum(row.hpBase * 1.2 ** kHp * extra), speed, kAtk, kHp }
}

const TITLE_RULES: Readonly<Record<string, Record<string, any>>> = {
  comment_1: { stat: "bossDamage", rule: "max", onlyOnWin: true, text: "对敌方领袖造成伤害最高（仅胜利时）" },
  comment_2: { stat: "activatedLayers", rule: "max", text: "激活的盟约层数总和最高" },
  comment_3: { stat: "lpRemaining", rule: "max", text: "目标生命值损失最少" },
  comment_4: { stat: "merges", rule: "max", text: "晋升精锐次数最多" },
  comment_5: { stat: "itemsEquipped", rule: "max", text: "装备配发数量最多" },
  comment_6: { stat: "fundsSpent", rule: "max", text: "消耗资金最多" },
}

const DIFF_KEYS: Readonly<Record<string, string>> = { FUNNY: "bloodPoint", NORMAL: "bloodPointNormal", HARD: "bloodPointHard", ABYSS: "bloodPointAbyss" }

export function buildConfig(ctx: SeasonContext, waves: Record<string, any>, stages: Record<string, any>, bands: Record<string, any>): Record<string, any> {
  const { act, ac } = ctx
  const addendum = ctx.research.core?._criticAddendum || {}
  const multipliers = addendum.enemyStatMultipliers || DEFAULT_ENEMY_MULTIPLIERS
  if (!addendum.enemyStatMultipliers) ctx.notes.warn("config: using built-in enemy multiplier table (research 01 _criticAddendum missing)")
  const incomeCap = addendum.incomePerRound?.CAP ?? 12
  const modes: Record<string, any> = {}
  for (const modeId of Object.keys(act.modeDataDict)) {
    const mode = act.modeDataDict[modeId]
    const battle = act.battleDataDict[modeId] || {}
    const turns = ac.turnInfoDataDict?.[modeId] || {}
    const roundNums = Object.keys(battle).map(Number).sort((left, right) => left - right)
    const type = mode.modeType
    const rounds: Record<string, any> = {}
    const enemyScale: Record<string, any> = {}
    const combatTimeLimit: Record<string, any> = {}
    let lastRound = 0
    let bossRound = null
    let hiddenRound = null
    for (const round of roundNums) {
      const entries = battle[String(round)]
      const turn = turns[String(round)] || {}
      const isBoss = entries.some((entry: any) => entry.bossId) || !!turn.isBossTurn
      const bossTemplates: Record<string, string> = {}
      for (const entry of entries) if (entry.bossId) bossTemplates[entry.bossId] = templateIdOf(entry.levelId)
      const isHidden = isBoss && Object.keys(bossTemplates).some((bossId) => act.bossInfoDict[bossId]?.isHidingBoss)
      const template: string | null = isBoss ? null : templateIdOf(entries[0].levelId)
      if (!isBoss && entries.length > 1) ctx.notes.warn(`mode ${modeId} round ${round}: ${entries.length} templates for a non-boss round`)
      const bossTemplate = Object.values(bossTemplates)[0]
      const templateId = template ?? bossTemplate
      const multi = type === "MULTI"
      rounds[round] = {
        template,
        bossTemplates: isBoss ? bossTemplates : null,
        combatTimeLimit: template == null ? null : (waves[template]?.maxPlayTime ?? null),
        levelMaxPlayTime: typeof templateId === "string" ? waves[templateId]?.maxPlayTime ?? null : null,
        prepTime: multi || type === "LOCAL" ? turn.normalPhaseTime ?? null : null,
        prepTimeData: turn.normalPhaseTime ?? null,
        isSpPrepare: entries.some((entry: any) => entry.isSpPrepare),
        isBoss,
        isHidden,
        bossOvertimeAfter: isBoss ? turn.bossTurnHpReduceTime || 150 : null,
      }
      enemyScale[round] = enemyScaleFor(multipliers, type, mode.modeDifficulty, round, isHidden)
      combatTimeLimit[round] = rounds[round].combatTimeLimit
      if (isHidden) hiddenRound = round
      else {
        lastRound = round
        if (isBoss) bossRound = round
      }
    }
    const shopLevel = act.shopLevelDataDict[modeId] || {}
    const levels = Object.keys(shopLevel).map(Number).sort((left, right) => left - right)
    const lastLevel = levels.length ? levels[levels.length - 1] : undefined
    modes[modeId] = {
      modeId,
      name: mode.name,
      code: mode.code,
      sortId: mode.sortId,
      type,
      difficulty: mode.modeDifficulty,
      inScope: type === "SINGLE" || type === "MULTI",
      color: `#${String(mode.modeColor || "").replace(/^#/, "")}`,
      iconId: mode.modeIconId,
      backgroundId: mode.backgroundId || null,
      desc: mode.desc,
      effectDescList: mode.effectDescList || [],
      unlockText: mode.unlockText || null,
      specialPhaseTime: mode.specialPhaseTime,
      activeBondIds: mode.activeBondIdList || [],
      inactiveBondIds: mode.inactiveBondIdList || [],
      inactiveEnemyKeys: mode.inactiveEnemyKey || [],
      lastRound,
      bossRound,
      hiddenRound,
      rounds,
      spRounds: roundNums.filter((round) => rounds[round].isSpPrepare),
      combatTimeLimit,
      enemyScale,
      bossHpScale: type === "SINGLE"
        ? { bloodPointKey: DIFF_KEYS[mode.modeDifficulty] || null, solo: 0.25, soloAssumed: true, unaffectedByEnemyScale: true }
        : { bloodPointKey: DIFF_KEYS[mode.modeDifficulty] || null, coop: 1, aliveScaling: false, aliveFull: 4, aliveAssumed: true, unaffectedByEnemyScale: true },
      upgradePrices: levels.slice(0, -1).map((level) => shopLevel[level].initialUpgradePrice),
      maxShopLevel: levels.length ? lastLevel : 6,
      shopSlots: Object.fromEntries(levels.map((level) => [level, { chess: shopLevel[level].charChessCount, item: shopLevel[level].itemCount }])),
      levelTagColors: Object.fromEntries(levels.map((level) => [level, shopLevel[level].levelTagBgColor])),
      stages: Object.values(stages).filter((stage) => stage.active && stage.modes.includes(modeId)).map((stage) => stage.id),
      bossWeights: Object.fromEntries(Object.values(rounds).filter((round) => round.isBoss && !round.isHidden).flatMap((round) => Object.keys(round.bossTemplates)).map((bossId) => [bossId, act.bossInfoDict[bossId].weight])),
      hiddenBossWeights: Object.fromEntries(Object.values(rounds).filter((round) => round.isHidden).flatMap((round) => Object.keys(round.bossTemplates)).map((bossId) => [bossId, act.bossInfoDict[bossId].weight])),
    }
  }
  const priceTable = act.shopCharChessInfoData || {}
  const chessPrice: Record<string, any> = {}
  const chessSell: Record<string, any> = {}
  const chessStatus: Record<string, any> = {}
  for (const [tier, rows] of Object.entries(priceTable)) {
    const list = rows as any[]
    const normal = list.find((row) => !row.isGolden) || {}
    const golden = list.find((row) => row.isGolden) || {}
    chessPrice[tier] = { normal: normal.purchasePrice, golden: golden.purchasePrice }
    chessSell[tier] = { normal: normal.chessSoldPrice, golden: golden.chessSoldPrice }
    chessStatus[tier] = {
      normal: { phase: phaseIdx(normal.evolvePhase), level: normal.charLevel, skillLevel: normal.skillLevel, equipLevel: normal.equipLevel, eliteIconId: normal.eliteIconId },
      golden: { phase: phaseIdx(golden.evolvePhase), level: golden.charLevel, skillLevel: golden.skillLevel, equipLevel: golden.equipLevel, eliteIconId: golden.eliteIconId },
    }
  }
  const trophies = ctx.research.core?.trophiesPerClear
  const steps = listOf(ac.enterStepList)
  const step = (kind: string): any => steps.find((row) => row.stepType === kind)
  return {
    season: ctx.seasonId,
    seasonName: "卫戍协议：盟约",
    modes,
    economy: {
      income: Array.from({ length: 16 }, (_, round) => (round === 0 ? 0 : Math.min(3 + round, incomeCap))),
      incomeFormula: `min(3 + round, ${incomeCap})`,
      incomeCap,
      incomeCapAlternative: 10,
      incomeAssumedAfterRound: 3,
      leftoverFundsLost: true,
      leftoverFundsKeptByBands: ac.constData?.noMoneyTipsBand || ["band_cannot"],
      chessPrice,
      chessSell,
      chessStatus,
      refreshPrice: act.constData.shopRefreshPrice,
      freeze: { scope: "allUnsoldSlots", price: 0, consumedAtRoundStart: true, refreshWhileFrozenRerollsAll: true, rewardOfferFreezable: false },
      shopClearedAtCombatStart: "unfrozenSlots",
      itemSellable: false,
      itemDestroyRefund: 0,
      benchSize: act.constData.maxDeckChessCnt,
      tempSize: 5,
      deployCap: act.constData.maxBattleChessCnt,
      storeCntMax: act.constData.storeCntMax,
      equipPerChess: 2,
      maxArtsPerRound: 2,
      poolCopies: { 1: 12, 2: 14, 3: 18, 4: 16, 5: 8, 6: 5 },
      poolCopiesOverrides: { chess_char_6_11_a: 4 },
      goldenCopies: 3,
      mergeCount: 3,
      mergeCountOverrides: Object.fromEntries(Object.entries(act.charChessDataDict).filter(([, piece]) => !(piece as any).isGolden && (piece as any).upgradeNum && (piece as any).upgradeNum !== 3).map(([id, piece]) => [id, (piece as any).upgradeNum])),
      itemMergeCount: 2,
      rewardOffer: { count: 3, tierOffset: 1, maxTier: 6, price: 0, refreshable: false, freezable: false, expiresAtRoundEnd: true },
      handFillOrder: "rightToLeft",
      shopOdds: { model: "copyWeighted", note: "each slot draws 1 copy uniformly from remaining pool copies of unbanned visible chess with tier <= shop level; items: same tier shares, then uniform within tier [ASSUMED]" },
      borrowCount: act.constData.borrowCount,
      fallbackBondId: act.constData.fallbackBondId,
      defaultBandId: "band_bldsk",
      defaultStartLp: bands.band_bldsk?.totalHp ?? 28,
    },
    lpCapPerRound: act.constData.costPlayerHpLimit ?? 10,
    bossOvertimeAfter: 150,
    bossOvertimeDrainPerSec: 1,
    bossHpScale: {
      formula: "co-op: bloodPoint[difficulty] — one pool for every field (\"所有人将一起对敌方领袖造成伤害\"; the mirrored copies of a pair field share it, \"两侧的敌方领袖共享生命值（敌方领袖的总生命值不变）\"); aliveScaling true would scale it × alive players at the Final Assault / aliveFull (巴哈姆特 12294 \"聯機隊友(撤退/死掉)變少，最後boss血條也會變少\", one community note, no proportion: off until confirmed, the alive / 4 proportion [ASSUMED]); solo: bloodPoint[difficulty] × solo (0.25 = one player of four) [ASSUMED]",
      coop: 1,
      solo: 0.25,
      soloAssumed: true,
      aliveScaling: false,
      aliveFull: 4,
      aliveAssumed: true,
      unaffectedByEnemyScale: true,
    },
    hiddenCore: { single: 350, multi: 1200, minTeamLpExclusive: 1, difficulties: ["NORMAL", "HARD", "ABYSS"], checkedAfterRound: 14 },
    dp: { init: 10, perSec: 1, max: 99 },
    unite: {
      maxHelpers: 2,
      helperOrder: "unitsOnField>activeBond>undownedUnits; pair: unitsOnField>activeBond>activeLayers>undownedUnits, first = right field (PRTS 帮助)",
      layerGainsEnabled: false,
      keepsHpSpPositions: true,
      leakedEnemyFullHp: true,
      templates: { 1: templateIdOf(act.constData.escapedBattleTemplateMapSinglePlayer), 2: templateIdOf(act.constData.escapedBattleTemplateMapMultiPlayer) },
    },
    finalAssault: { pairing: "seatOrderPairs", oddPlayerAlone: true, movableBossPerAlivePlayerSide: true, layerGainsEnabled: false },
    timers: {
      infoCheck: step("INFO_CHECK")?.time ?? 25,
      infoCheckHint: step("INFO_CHECK")?.hintTime ?? 5,
      bandDraft: step("BAND_CHECK")?.time ?? 50,
      bandDraftHint: step("BAND_CHECK")?.hintTime ?? 15,
      bandTurn: 30,
      battleCheck: step("BATTLE_CHECK")?.time ?? 3,
      spFirst: 30,
      spTurn: act.modeDataDict.mode_multi_normal?.specialPhaseTime ?? 16,
      soloPrepTimeData: 300,
      soloSpTimeData: act.modeDataDict.mode_single_normal?.specialPhaseTime ?? 150,
      chatCd: ac.constData?.chatCD ?? 1,
      chatBubble: ac.constData?.chatTime ?? 3,
      broadcastDelay: ac.constData?.broadcastBeginDelay ?? 1,
      enterSteps: listOf(ac.enterStepList).map((row) => ({ step: row.stepType, time: row.time, hint: row.hintTime, title: row.title })),
    },
    bans: {
      FUNNY: { core: 0, addon: 1 },
      NORMAL: { core: 3, addon: 4 },
      HARD: { core: 3, addon: 4 },
      ABYSS: { core: 3, addon: 4 },
      TRAINING: { core: 0, addon: 0 },
      rule: "banned iff every bond of a visible non-DIY chess is in (drawn set D ∪ mode.inactiveBondIds); core = isCore bonds, addon = other bonds with weight > 0; uniform draw",
    },
    bandDraft: { skipsPerPlayer: 1, order: "random", duplicatesAllowed: true, timeoutBandId: "band_bldsk" },
    titles: Object.values(act.playerTitleDataDict || {}).map((title: any) => ({ id: title.id, picId: title.picId, name: title.txt, ...(TITLE_RULES[title.id] || {}) })),
    titleRule: "each player gets at most one title; each title is used at most once per match; assign by the category where the player ranks best relative to teammates [ASSUMED]",
    tips: listOf(ac.gameTipsList).map((tip) => ({ tip: String(tip.tip).trim(), weight: tip.weight })),
    broadcasts: listOf(ac.broadcastList).map((row) => ({
      id: row.id,
      type: row.type,
      priority: row.priority,
      text: stripRich(row.desc),
      textRaw: row.desc,
      params: row.paramList || [],
    })),
    trophies: {
      byRoundsPassed: [
        { maxRound: 4, FUNNY: 0, NORMAL: 0, HARD: 0, ABYSS: 0 },
        { maxRound: 8, FUNNY: 1, NORMAL: 1, HARD: 1, ABYSS: 1 },
        { maxRound: 11, FUNNY: 2, NORMAL: 2, HARD: 2, ABYSS: 2 },
        { maxRound: 13, FUNNY: 2, NORMAL: 3, HARD: 3, ABYSS: 3 },
        { maxRound: 14, FUNNY: 3, NORMAL: 4, HARD: 5, ABYSS: 6 },
      ],
      hiddenCore: { FUNNY: null, NORMAL: 5, HARD: 7, ABYSS: 8 },
      multiOnly: true,
      source: trophies ? "research 01-core-data trophiesPerClear" : "built-in",
      medals: listOf(ac.medalDataList).map((medal) => ({ count: medal.medalCount, iconId: medal.medalIconId })),
    },
    roundScores: listOf(ac.roundScoreDataList).map((row) => ({ round: row.round, score: row.score })),
    rewards: {
      itemId: listOf(act.baseRewardDataList)[0]?.item?.id || null,
      baseByRoundsPassed: listOf(act.baseRewardDataList).map((row) => ({ round: row.round, count: row.item?.count ?? 0, dailyPoint: row.dailyMissionPoint ?? 0 })),
      formula: "baseByRoundsPassed[roundsPassed].count * difficultyFactor[difficulty] * modeFactor[type]",
      difficultyFactor: act.difficultyFactorInfo,
      modeFactor: act.modeFactorInfo,
    },
    constants: {
      maxLevelCnt: ac.constData?.maxLevelCnt ?? 15,
      bossTrailerStartRound: ac.constData?.bossTrailerStartRound ?? 3,
      singleReconnectTime: ac.constData?.singleReconnectTime ?? 86400,
      trainingModeId: act.constData.trainingModeId || null,
      discountColor: ac.constData?.discountColor || "#59f4ca",
      premiumColor: ac.constData?.premiumColor || "#ff5454",
      normalColor: ac.constData?.normalColor || "#ffc600",
      pingConds: (ac.constData?.pingConds || []).map((row: any) => ({ minMs: row.cond, textRaw: row.txt })),
    },
  }
}
