import type { SeasonContext } from "#compiler/packet/compile/context.js"
import { naturalCmp, richRaw, stripRich } from "#compiler/packet/text/parse.js"

const HIDDEN_BOUNTY_IDS: ReadonlySet<string> = new Set(["enemyeffect_5", "enemyeffect_6", "enemyeffect_7", "enemyeffect_8"])

function effectId(suffix: string): string {
  return `enemyeffect_${suffix}`
}

function seriesIds(series: number): string[] {
  return [1, 2, 3, 4, 5, 6].map((index) => effectId(`${series}_${index}`))
}

const BOUNTY_INITIAL_SETS: readonly { readonly cards: readonly string[], readonly seen: readonly (number | string)[] }[] = [
  { cards: seriesIds(18), seen: [1, 3, 5, 9, 17] },
  { cards: seriesIds(19), seen: [2, 15, 22] },
  { cards: seriesIds(17), seen: [7, 14] },
  { cards: ["10_5", "11_4", "12_5", "13_6", "15_4", "20_3"].map(effectId), seen: [4, 10, 16] },
  { cards: ["10_4", "11_5", "12_6", "14_4", "15_5", "20_2"].map(effectId), seen: [6, 18] },
  { cards: ["10_4", "11_5", "12_4", "14_6", "15_4", "20_4"].map(effectId), seen: [8] },
  { cards: ["10_4", "11_6", "12_4", "13_4", "14_5", "15_5"].map(effectId), seen: [11, 20] },
  { cards: ["10_4", "11_4", "12_5", "15_6", "20_1", "20_5"].map(effectId), seen: [12] },
  { cards: ["11_4", "12_4", "13_5", "14_4", "15_5", "17_6"].map(effectId), seen: [13, 19, 21] },
]

const BOUNTY_INITIAL_RULE: { readonly series: readonly number[], readonly tiers: readonly number[], readonly perSeries: number, readonly prefer: readonly string[] } = {
  series: [10, 11, 12, 13, 14, 15, 20],
  tiers: [1, 1, 1, 2, 2, 3],
  perSeries: 2,
  prefer: ["10_6", "20_6"].map(effectId),
}

const R9: Readonly<Record<string, string>> = {
  W: "b_10", 碎骨: "b_1", 弑君者: "b_3", 大鲍勃: "b_13", 庞贝: "b_12", 鼠王: "b_11", 源石虫: "5_1", 杰斯顿: "b_9", 自在: "b_14", 陷落雪祀: "b_23",
  喷气人: "b_8", 纠缠藤蔓: "b_24", 澪: "b_19", 邪魔的利刃: "b_22", 复仇者: "b_21", 萨卡兹百夫长: "b_2", 腐败骑士: "b_5", 墓碑: "b_17", 巨大的丑东西: "b_20", 泥岩: "b_4",
}

function r9Group(pairs: readonly (readonly [string, number])[], seen: readonly (number | string)[]): { cards: string[], hits: number[], seen: readonly (number | string)[] } {
  return { cards: pairs.map(([name]) => effectId(R9[name] ?? "undefined")), hits: pairs.map(([, hits]) => hits), seen }
}

const BOUNTY_BOSS_GROUPS: readonly { cards: string[], hits: number[], seen: readonly (number | string)[] }[] = [
  r9Group([["W", 11], ["碎骨", 12], ["弑君者", 11], ["大鲍勃", 11], ["源石虫", 10], ["鼠王", 4], ["杰斯顿", 12], ["自在", 7], ["陷落雪祀", 6]], [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21]),
  r9Group([["W", 3], ["碎骨", 1], ["弑君者", 1], ["大鲍勃", 3], ["庞贝", 1], ["源石虫", 2], ["喷气人", 3], ["纠缠藤蔓", 3], ["澪", 1]], [1, 5, 22]),
  r9Group([["W", 3], ["碎骨", 2], ["弑君者", 1], ["庞贝", 2], ["源石虫", 1], ["澪", 1], ["邪魔的利刃", 2], ["复仇者", 3], ["萨卡兹百夫长", 3]], [6, 20, "bahamut-12294"]),
  r9Group([["W", 1], ["碎骨", 1], ["弑君者", 0], ["大鲍勃", 0], ["庞贝", 0], ["源石虫", 1], ["腐败骑士", 1], ["墓碑", 1], ["巨大的丑东西", 1]], [3]),
  r9Group([["W", 0], ["碎骨", 0], ["弑君者", 1], ["大鲍勃", 1], ["庞贝", 1], ["源石虫", 1], ["泥岩", 1], ["澪", 1]], [2]),
  r9Group([["W", 1], ["碎骨", 1], ["弑君者", 1], ["大鲍勃", 1], ["庞贝", 1], ["源石虫", 1]], [4]),
]

function hunterGroup(ids: readonly string[], hits: readonly number[], seen: readonly number[], open = 0): Record<string, any> {
  return { cards: ids.map(effectId), hits, seen, ...(open ? { open } : {}) }
}

const BOUNTY_HUNTER_GROUPS: readonly Record<string, any>[] = [
  hunterGroup(["16_4", "16_10", "15_7", "12_7", "13_8", "10_7", "11_7"], [4, 4, 3, 3, 4, 3, 3], [1, 6, 21, 22]),
  hunterGroup(["16_3", "15_7", "13_8", "16_9", "14_7", "11_7", "10_7"], [2, 2, 2, 1, 2, 2, 1], [3, 13]),
  hunterGroup(["16_5", "15_8", "12_7", "14_8", "10_7", "16_11", "11_7"], [3, 3, 3, 2, 3, 3, 1], [10, 12, 16]),
  hunterGroup(["16_7", "16_9", "14_7", "16_11", "11_7", "13_7"], [1, 1, 1, 1, 1, 1], [11], 1),
  hunterGroup(["16_8", "16_10", "14_8", "10_7", "16_12", "13_7"], [2, 2, 2, 2, 2, 2], [14, 19], 1),
  hunterGroup(["16_1", "10_8", "11_8", "15_7", "13_7", "14_7"], [1, 1, 1, 1, 1, 1], [17], 1),
  hunterGroup(["10_8", "12_7", "13_7", "14_7", "11_7", "16_12"], [1, 1, 1, 1, 1, 1], [15], 1),
]

const BOUNTY_HUNTER_RULE: { readonly size: number, readonly onePerSeries: readonly number[], readonly maxSeries16: number } = {
  size: 7,
  onePerSeries: [10, 11, 12, 13, 14, 15],
  maxSeries16: 2,
}

const SHOP_DRAFT: {
  readonly rounds: readonly number[]
  readonly slots: readonly Record<string, number>[]
  readonly coin: string
  readonly seen: Readonly<Record<string, number>>
  readonly matches: readonly number[]
} = {
  rounds: [11],
  slots: [{ 6: 1 }, { 6: 1 }, { 5: 1 }, { coin: 1 }, { 5: 3, 4: 2, 3: 1, coin: 2 }, { 5: 3, 4: 2, 3: 1, coin: 2 }],
  coin: "盟约之币",
  seen: { 变形同构体: 4, 天师古鼎: 1, 人事部文档: 1, 家族徽章: 1, 铳骑之威: 1, 天马之盔: 2, 双模机械臂: 2, 商业包装方案: 2, 博士投影: 1, 护盾无人机: 1, 寻呼模块: 1, 骑士储蓄罐: 1, 盟约之币: 6 },
  matches: [2, 4, 5, 8],
}

const TACTIC_DRAFT: {
  readonly rounds: readonly number[]
  readonly kinds: readonly string[]
  readonly seen: Readonly<Record<string, number>>
  readonly matches: readonly number[]
} = {
  rounds: [11],
  kinds: ["ally"],
  seen: { 补给: 3, 列装: 3, 升华: 3, 莫斯提马的盟誓: 2, 银灰的盟誓: 2, 阿戈尔驰援: 2, 财富: 2, 谢拉格驰援: 1, 锐利: 1, 整备: 1, 玛恩纳的盟誓: 1, 斯卡蒂的盟誓: 1, 萨尔贡驰援: 1, 叙拉古驰援: 1 },
  matches: [7, 9, 18, 20],
}

function bountyDraftOf(round: number): "initial" | "boss" | "hunter" {
  return round < 8 ? "initial" : round < 11 ? "boss" : "hunter"
}

function bountyDraftExclusion(effect: any, main: any): string | null {
  if (main.payout !== "kill") return "perfect"
  if (HIDDEN_BOUNTY_IDS.has(effect.effectId)) return "hidden"
  return null
}

function bountyDraftPool(effect: any, main: any, draftExcluded: string | null): string | null {
  if (draftExcluded) return null
  if (main.rounds === 2) return "initial"
  if (main.rounds !== 1) return null
  if (/^enemyeffect_b_\d+$/.test(effect.effectId) || effect.effectId === "enemyeffect_5_1") return "boss"
  if (/^enemyeffect_1[0-5]_[78]$/.test(effect.effectId) || /^enemyeffect_16_\d+$/.test(effect.effectId)) return "hunter"
  return null
}

function choiceFamily(event: any): string {
  if (event.choiceType === "BOUNTY_HUNT" || event.choiceType === "PERSONAL_CHOOSE") return "bounty"
  if (event.choiceType === "EQUIP_FREE") return /^artifact_paid/.test(event.choiceEventId) ? "shop" : "supply"
  if (event.choiceType === "BUFF_SELECT") return "tactic"
  return "other"
}

function romanTier(token: string | undefined): number | null {
  if (token === "I") return 1
  if (token === "II") return 2
  if (token === "III") return 3
  return null
}

function withWeights(group: any): any {
  const { hits, ...rest } = group
  return { ...rest, weights: hits.map((hit: number) => hit + 1) }
}

export function buildChoices(ctx: SeasonContext, effects: Record<string, any>, items: Record<string, any>, chess: Record<string, any>): Record<string, any> {
  const { act } = ctx
  const events: Record<string, any> = {}
  for (const id of Object.keys(act.effectChoiceInfoDict).sort(naturalCmp)) {
    const event = act.effectChoiceInfoDict[id]
    events[id] = {
      id,
      choiceType: event.choiceType,
      effectType: event.effectType,
      name: event.name,
      desc: stripRich(event.desc),
      descRaw: richRaw(event.desc),
      color: event.typeTxtColor || null,
      family: choiceFamily(event),
      solo: /_s$/.test(id),
      training: /_tr$/.test(id),
    }
  }
  for (const effect of Object.values(effects)) for (const buff of effect.buffs) {
    const choiceEvent = buff.bbStr.choice_event
    if (!choiceEvent) continue
    if (!events[choiceEvent]) {
      ctx.notes.warn(`effect ${effect.effectId} references unknown choice event ${choiceEvent}`)
      continue
    }
    const users = Object.values(items).filter((item) => item.effectId === effect.effectId).map((item) => item.id)
    events[choiceEvent].usedBy ||= []
    events[choiceEvent].usedBy.push(...(users.length ? users : [effect.effectId]))
  }
  const eventsOf = (family: string, pred: (event: any) => boolean = () => true): string[] =>
    Object.values(events).filter((event) => event.family === family && pred(event)).map((event) => event.id)
  const bounty: any[] = []
  for (const effect of Object.values(effects)) {
    if (effect.effectType !== "ENEMY_GAIN") continue
    const adds = effect.buffs.filter((buff: any) => /add_enemy/.test(buff.key)).map((buff: any) => ({
      enemyKey: buff.bbStr.enemy_id || null,
      count: buff.bb.count ?? 1,
      coin: buff.bb.coin ?? 0,
      rounds: buff.bb.round ?? 1,
      payout: /kill_gain_coin/.test(buff.key) ? "kill" : "perfect",
      buffKey: buff.key,
    }))
    if (!adds.length) {
      ctx.notes.warn(`bounty effect ${effect.effectId} has no add_enemy buff`)
      continue
    }
    const main = adds.find((add: any) => add.buffKey !== "next_battle_add_enemy_win_gain_coin") || adds[0]
    const roman = /([I]{1,3})$/.exec(effect.name || "")
    const fromName = romanTier(roman?.[1])
    let tier = fromName ?? Math.min(3, Math.max(1, effect.enemyPrice || main.coin || 1))
    const multiRound = main.rounds >= 99
    if (multiRound) tier = 2
    for (const add of adds) if (add.enemyKey && !ctx.enemyDb.has(add.enemyKey)) ctx.notes.warn(`bounty ${effect.effectId}: unknown enemy ${add.enemyKey}`)
    const coin = effect.enemyPrice || main.coin
    let draftExcluded = bountyDraftExclusion(effect, main)
    if (draftExcluded === "hidden" && !/鸭爵|高普尼克|流泪小子|圆仔/.test(effect.name || "")) ctx.notes.warn(`bounty ${effect.effectId} "${effect.name}": expected one of the 鸭爵 set`)
    let draftPool = bountyDraftPool(effect, main, draftExcluded)
    if (draftPool === "boss" && !BOUNTY_BOSS_GROUPS.some((group) => group.cards.includes(effect.effectId))) draftPool = null
    if (!draftExcluded && !draftPool) draftExcluded = "unseen"
    const seriesMatch = /^enemyeffect_(\d+)_\d+$/.exec(effect.effectId)
    const seriesText = seriesMatch?.[1]
    bounty.push({
      effectId: effect.effectId,
      name: effect.name,
      desc: effect.desc,
      tier,
      coin,
      payout: main.payout,
      rounds: main.rounds,
      multiRound,
      enemyKey: main.enemyKey,
      count: main.count,
      adds,
      draft: !draftExcluded,
      draftExcluded,
      draftPool,
      series: seriesText !== undefined ? Number(seriesText) : null,
    })
  }
  bounty.sort((left, right) => naturalCmp(left.effectId, right.effectId))
  const bountyById = new Map(bounty.map((card) => [card.effectId, card]))
  const checkKind = (ids: readonly string[], kind: string, what: string): void => {
    for (const id of ids) if (bountyById.get(id)?.draftPool !== kind) ctx.notes.warn(`bounty draft ${what}: ${id} is not a "${kind}" card`)
  }
  for (const set of BOUNTY_INITIAL_SETS) checkKind(set.cards, "initial", "R3 set")
  for (const group of BOUNTY_BOSS_GROUPS) checkKind(group.cards, "boss", "R9 group")
  for (const group of BOUNTY_HUNTER_GROUPS) checkKind(group.cards, "hunter", "R11 group")
  for (const group of [...BOUNTY_INITIAL_SETS, ...BOUNTY_BOSS_GROUPS, ...BOUNTY_HUNTER_GROUPS] as readonly { readonly cards: readonly string[], readonly hits?: readonly number[] }[]) {
    if (new Set(group.cards).size !== group.cards.length) ctx.notes.warn(`bounty draft group ${group.cards.join(" ")}: a card twice`)
    if (group.hits && group.hits.length !== group.cards.length) ctx.notes.warn(`bounty draft group ${group.cards.join(" ")}: hits do not match the cards`)
  }
  for (const set of BOUNTY_INITIAL_SETS) if (set.cards.map((id) => bountyById.get(id)?.tier).sort().join("") !== "111223") ctx.notes.warn(`bounty draft R3 set ${set.cards.join(" ")}: not I I I II II III`)
  for (const group of BOUNTY_HUNTER_GROUPS) {
    const giants = group.cards.filter((id: string) => bountyById.get(id)?.tier === 3).length
    if (giants > 1 || group.cards.length + (group.open || 0) !== BOUNTY_HUNTER_RULE.size) ctx.notes.warn(`bounty draft R11 group ${group.cards.join(" ")}: not ${BOUNTY_HUNTER_RULE.size} cards with at most one giant`)
  }
  const hunterTier = (tier: number): string[] => bounty.filter((card) => card.draftPool === "hunter" && card.tier === tier).map((card) => card.effectId)
  if (hunterTier(1).length + hunterTier(2).length + hunterTier(3).length !== bounty.filter((card) => card.draftPool === "hunter").length) ctx.notes.warn("bounty: an R11 card of no tier I–III")
  const tactic: any[] = []
  for (const effect of Object.values(effects)) {
    if (effect.effectType !== "BUFF_GAIN") continue
    let kind = "ally"
    let stageId = null
    if (/^enemydebuff_select/.test(effect.effectId)) kind = "enemyDebuff"
    else if (/^map_m0\d/.test(effect.effectId)) {
      kind = "terrain"
      const terrain = /^map_m0(\d)/.exec(effect.effectId)
      stageId = `act1autochess_m0${terrain?.[1] ?? ""}`
    }
    const team = /若存在其他队友则他们也获得/.test(effect.desc || "")
    tactic.push({ effectId: effect.effectId, name: effect.name, desc: effect.desc, kind, stageId, team })
  }
  tactic.sort((left, right) => naturalCmp(left.effectId, right.effectId))
  const tacticByName = (name: string): string | null => {
    const hits = tactic.filter((card) => card.name === name)
    if (hits.length !== 1) ctx.notes.warn(`tactic draft card "${name}": ${hits.length} cards of that name`)
    const hit = hits[0]
    if (hit && !TACTIC_DRAFT.kinds.includes(hit.kind)) ctx.notes.warn(`tactic draft card "${name}" is a ${hit.kind} card`)
    return hit?.effectId ?? null
  }
  const equipNormal = Object.values(items).filter((item) => item.itemType === "EQUIP" && !item.isGolden)
  const itemByName = (name: string): string | null => equipNormal.find((item) => item.name === name)?.id || (ctx.notes.warn(`pool item "${name}" not found`), null)
  const chessByName = (name: string): string | null => Object.values(chess).find((piece) => !piece.isGolden && piece.visible && piece.name === name)?.chessId
    || Object.values(chess).find((piece) => !piece.isGolden && piece.name === name)?.chessId
    || (ctx.notes.warn(`pool chess "${name}" not found`), null)
  const schedule: Record<string, any> = {}
  const supplyWindow: Readonly<Record<number, readonly [number, number]>> = { 3: [1, 4], 6: [2, 5], 9: [3, 6], 11: [4, 6] }
  const bountyEventRe: Readonly<Record<"initial" | "boss" | "hunter", RegExp>> = { initial: /^enemy_initial_/, boss: /^bossInitial_/, hunter: /^bounty_hunter_/ }
  for (const [modeId, rounds] of Object.entries(act.battleDataDict)) {
    const mode = act.modeDataDict[modeId]
    const solo = mode.modeType === "SINGLE"
    const difficulty = mode.modeDifficulty
    const sp = Object.entries(rounds as Record<string, any>).filter(([, entries]) => (entries as any[]).some((entry) => entry.isSpPrepare)).map(([round]) => Number(round)).sort((left, right) => left - right)
    const byRound: Record<string, any> = {}
    for (const round of sp) {
      let families: any[]
      if (difficulty === "TRAINING") families = [{ family: "supply", weight: 100 }]
      else if (difficulty === "HARD" || difficulty === "ABYSS") {
        families = round === 11
          ? [{ family: "bounty", weight: 14 }, { family: "shop", weight: 4 }, { family: "tactic", weight: 4 }]
          : [{ family: "bounty", weight: 100 }]
      } else if (difficulty === "NORMAL") {
        families = solo
          ? [{ family: round === 9 ? "tactic" : "supply", weight: 100 }]
          : [{ family: "bounty", weight: 50 }, { family: "supply", weight: 25 }, { family: "shop", weight: 10 }, { family: "tactic", weight: 15 }]
      } else families = [{ family: "supply", weight: 45 }, { family: "tactic", weight: 35 }, { family: "shop", weight: 20 }]
      const bountyDraft = bountyDraftOf(round)
      byRound[round] = {
        families,
        cards: solo ? 3 : 6,
        supplyTiers: supplyWindow[round] || [1, 6],
        bountyDraft,
        events: {
          bounty: eventsOf("bounty", (event) => bountyEventRe[bountyDraft].test(event.id) && event.solo === solo),
          supply: difficulty === "TRAINING" ? eventsOf("supply", (event) => event.training) : eventsOf("supply", (event) => !event.training && event.solo === solo),
          shop: eventsOf("shop", (event) => event.solo === solo),
          tactic: eventsOf("tactic", (event) => event.solo === solo && (/^hardbuff/.test(event.id) ? difficulty === "HARD" || difficulty === "ABYSS" : true)),
        },
        assumed: !(difficulty === "HARD" || difficulty === "ABYSS") || round === 11,
      }
    }
    schedule[modeId] = { spRounds: sp, rounds: byRound }
  }
  const initialEvents = eventsOf("bounty", (event) => bountyEventRe.initial.test(event.id) && !event.solo)
  return {
    events,
    families: {
      bounty: { name: "悬赏决策", desc: "选定悬赏目标，获取额外奖励。", cards: "bountyDrafts[schedule[*].bountyDraft] — one official card list of the round (initial: an R3 set of 6; boss: an R9 group of up to 9; hunter: one of the 7 seen R11 lists of 7), six different cards of it drawn by weight, over cards.bounty entries with draft: true and that draftPool" },
      supply: { name: "道具补给", desc: "无需消耗资金，获得装备补给。", cards: "random normal EQUIP items in schedule[*].supplyTiers (duplicates allowed)" },
      shop: { name: "机密商店", desc: "无需消耗资金，获得装备补给。", cards: "at shopDraft.rounds (R11): six slots drawn with replacement (VI, VI, V, 盟约之币, 2 × V / IV / III / 盟约之币); other rounds: random normal EQUIP shop items of tiers I–VI (duplicates allowed) — the same item can come twice" },
      tactic: { name: "战术决策", desc: "进行协同调整，做好迎战准备。", cards: "cards.tactic, each card drawn on its own (with replacement) — the same card can come twice; at tacticDraft.rounds (R11) the ally cards by tacticDraft.weights, other rounds every card uniform (terrain cards only for the match stage)" },
    },
    format: {
      multi: { cards: 6, pickOrder: "random", firstPickSec: 30, otherPickSec: 16, onTimeout: "autoPickRandom", eachPlayerPicks: 1 },
      solo: { cards: 3, timer: null },
      opensAfterIncome: true,
    },
    cards: { bounty, tactic },
    bountyDrafts: {
      initial: {
        events: initialEvents,
        slots: initialEvents.length,
        pick: "slot",
        groups: BOUNTY_INITIAL_SETS,
        rule: BOUNTY_INITIAL_RULE,
        count: 6,
        assumed: ["a uniform pick among the 10 events", "the unseen 10th set built by `rule`", "险境 R6 drafts like R3"],
      },
      boss: {
        events: eventsOf("bounty", (event) => bountyEventRe.boss.test(event.id) && !event.solo),
        slots: BOUNTY_BOSS_GROUPS.length,
        pick: "seen",
        groups: BOUNTY_BOSS_GROUPS.map(withWeights),
        count: 6,
        assumed: ["a group picked by the matches it came in (the per-match cause is open)", "card weights 1 + hits", "the single-draft groups completed with their base cards", "boss bounties of no seen group are not offered"],
      },
      hunter: {
        events: eventsOf("bounty", (event) => bountyEventRe.hunter.test(event.id) && !event.solo),
        slots: BOUNTY_HUNTER_GROUPS.length,
        pick: "slot",
        groups: BOUNTY_HUNTER_GROUPS.map(withWeights),
        rule: { ...BOUNTY_HUNTER_RULE, giants: hunterTier(3), cards: [...hunterTier(2), ...hunterTier(1)] },
        count: 6,
        assumed: ["one of the 7 seen lists, picked uniformly (which of the 15 events R11 fires is open)", "card weights 1 + hits", "the `open` cards built by `rule`"],
      },
    },
    shopDraft: {
      rounds: SHOP_DRAFT.rounds,
      slots: SHOP_DRAFT.slots,
      coin: itemByName(SHOP_DRAFT.coin),
      itemWeights: Object.fromEntries(Object.entries(SHOP_DRAFT.seen).filter(([name]) => name !== SHOP_DRAFT.coin).map(([name, hits]) => [itemByName(name), 1 + hits]).sort((left, right) => naturalCmp(left[0], right[0]))),
      seen: SHOP_DRAFT.matches,
      count: 6,
      assumed: ["the slot split", "item weights 1 + seen", "solo shows 3 of the 6", "other rounds (标准 / 险境) keep the previous draw: tiers I–VI with replacement"],
    },
    tacticDraft: {
      rounds: TACTIC_DRAFT.rounds,
      kinds: TACTIC_DRAFT.kinds,
      weights: Object.fromEntries(Object.entries(TACTIC_DRAFT.seen).map(([name, hits]) => [tacticByName(name), 1 + hits]).filter(([id]) => id).sort((left, right) => naturalCmp(left[0], right[0]))),
      seen: TACTIC_DRAFT.matches,
      count: 6,
      assumed: ["card weights 1 + seen", "independent draws (no slot structure)", "no terrain card at R11", "solo shows 3", "other rounds (标准 / 险境) keep every card, uniform, with replacement"],
    },
    schedule,
    pools: {
      pool_equip_normal: { kind: "equip", rule: "shopEligible", maxTier: "shopLevel", assumed: true },
      pool_equip_shop_1: { kind: "equip", rule: "shopEligible", tiers: [1], assumed: true },
      pool_equip_kathe: { kind: "equip", rule: "shopEligible", maxTier: "shopLevel", assumed: true },
      pool_equip_narant: { kind: "equip", rule: "shopEligible", maxTier: "shopLevel", assumed: true },
      pool_equip_vict: { kind: "equip", items: ["灼燃维式重锤", "坚固维式重锤", "加速维式重锤", "战栗维式重锤"].map(itemByName), assumed: true },
      pool_equip_pepe: { kind: "equip", weighted: ([["盟约之币", 45], ["萨尔贡浓茶", 45], ["黄沙罗盘", 10]] as const).map(([name, weight]) => [itemByName(name), weight]), goldenWeights: [40, 40, 20], assumed: true },
      pool_equip_rockr: { kind: "equip", items: ["灼燃维式重锤", "坚固维式重锤", "加速维式重锤", "战栗维式重锤"].map(itemByName), assumed: true },
      pool_chess_glady: { kind: "chess", items: ["斯卡蒂", "幽灵鲨", "深巡"].map(chessByName), assumed: true },
      pool_char_pinus: { kind: "chess", weighted: ([["野鬃", 45], ["灰毫", 45], ["远牙", 10]] as const).map(([name, weight]) => [chessByName(name), weight]), assumed: true },
      pool_char_later: { kind: "chess", bond: "lateranoShip", minTier: 4, golden: true, rule: "shopEligible", assumed: true },
      ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((tier) => [`pool_chess_shop_${tier}_reward`, { kind: "chess", tier, rule: "shopEligible", assumed: true }])),
    },
  }
}
