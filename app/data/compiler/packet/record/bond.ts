import type { SeasonContext } from "#compiler/packet/compile/context.js"
import { naturalCmp, textPair } from "#compiler/packet/text/parse.js"

const BOND_COUNT_KEYS: readonly string[] = ["power_bond_char_cnt", "ex_bond_char_cnt", "power_char_cnt", "ex_char_cnt"]

export function buildBonds(ctx: SeasonContext, chess: Record<string, any>, effects: Record<string, any>): Record<string, any> {
  const { act, ac } = ctx
  const researchBonds = new Map<string, any>((ctx.research.bonds?.bonds || []).map((bond: any) => [bond.bondId, bond]))
  const out: Record<string, any> = {}
  const ids = Object.keys(act.bondInfoDict)
  ids.sort((left, right) => (act.bondInfoDict[left].identifier ?? 0) - (act.bondInfoDict[right].identifier ?? 0) || naturalCmp(left, right))
  for (const bondId of ids) {
    const bond = act.bondInfoDict[bondId]
    const global = ac.bondInfoDict?.[bondId] || {}
    const effect = effects[bond.effectId]
    if (!effect) ctx.notes.warn(`bond ${bondId}: effect ${bond.effectId} missing`)
    const buffs = effect ? effect.buffs : []
    const bb: Record<string, any> = {}
    for (const entry of buffs) for (const [key, value] of Object.entries(entry.bb)) if (!(key in bb)) bb[key] = value
    const bbStr: Record<string, any> = {}
    for (const entry of buffs) for (const [key, value] of Object.entries(entry.bbStr)) if (!(key in bbStr)) bbStr[key] = value
    const counts = new Set<number>()
    const params = (bond.activeParamList || []).map(Number).filter((value: number) => Number.isFinite(value) && value > 0)
    const template = bond.activeConditionTemplate
    let maxCount = null
    if (template === "count_threshold_downward") {
      const first = params[0]
      const second = params[1]
      if (first !== undefined) counts.add(first)
      if (second !== undefined) maxCount = second - 1
    } else {
      for (const value of params) counts.add(value)
      for (const entry of buffs) {
        for (const key of BOND_COUNT_KEYS) if (typeof entry.bb[key] === "number" && entry.bb[key] > 0) counts.add(entry.bb[key])
        if (entry.key === "bond_activated_add_layer" && typeof entry.bb.count === "number" && entry.bb.count > 0) counts.add(entry.bb.count)
      }
      for (const match of String(bond.desc || "").matchAll(/在场<@[^>]*>(\d+)<\/>名/g)) {
        const count = match[1]
        if (count !== undefined) counts.add(Number(count))
      }
      for (const match of String(bond.desc || "").matchAll(/在场(\d+)名/g)) {
        const count = match[1]
        if (count !== undefined) counts.add(Number(count))
      }
    }
    const thresholds = [...counts].sort((left, right) => left - right)
    if (!thresholds.length) ctx.notes.warn(`bond ${bondId}: no thresholds derived`)
    const layerMilestones: any[] = []
    for (const entry of buffs) {
      const board = entry.bb
      if (typeof board.power_bond_stack_cnt === "number" && board.power_bond_stack_cnt > 0) layerMilestones.push({ layer: board.power_bond_stack_cnt, mode: "reach", effect: entry.key })
      if (entry.key === "bond_layer_added_reward_equip" || entry.key === "bond_layer_gain_coin") layerMilestones.push({ layer: board.layer, mode: "every", effect: entry.key })
      if (entry.key === "bond_multi_layer_char_goods_price_bond_discount") {
        layerMilestones.push({ layer: board.layer1, mode: "first", effect: entry.key })
        layerMilestones.push({ layer: board.layer2, mode: "first", effect: entry.key })
      }
      if (entry.key === "bond_layer_char_garrison_bonus" && board.layer > 0) layerMilestones.push({ layer: board.layer, mode: "reach", effect: entry.key })
    }
    const members = (bond.chessIdList || []).filter((id: string) => chess[id] && !chess[id].isGolden).sort(naturalCmp)
    for (const id of bond.chessIdList || []) if (!chess[id]) ctx.notes.warn(`bond ${bondId}: member ${id} missing from chess`)
    const research = researchBonds.get(bondId)
    const pair = textPair(bond.desc, ctx.notes)
    out[bondId] = {
      bondId,
      name: bond.name,
      identifier: bond.identifier,
      isCore: !!global.isPower,
      bondType: global.bondType || null,
      bondOrder: global.bondOrder ?? null,
      powerIdList: global.powerIdList || [],
      iconId: bond.iconId || global.icon || null,
      activeCount: bond.activeCount,
      thresholds,
      maxCount,
      thresholdTemplate: template,
      countMode: bond.activeCondition,
      countsHand: bond.activeCondition === "BOARD_AND_DECK",
      countsGoldenOnly: template === "count_threshold_upward_golden",
      activeType: bond.activeType,
      isActiveInDeck: !!bond.isActiveInDeck,
      noStack: !!bond.noStack,
      weight: bond.weight,
      maxInactiveBondCount: bond.maxInactiveBondCount,
      layerMilestones,
      desc: pair.desc,
      descRaw: pair.descRaw,
      effectId: bond.effectId,
      effectName: effect?.name || null,
      effectDesc: effect?.desc || null,
      effectDescRaw: effect?.descRaw || null,
      effectDescParams: [...String(effect?.descRaw || "").matchAll(/\{(\d+)(?::([^{}]+))?\}/g)].map((match) => {
        const index = Number(match[1])
        return {
          index,
          format: match[2] || null,
          base: (bond.descParamBaseList || [])[index] || null,
          perStack: (bond.descParamPerStackList || [])[index] || null,
        }
      }),
      bb,
      bbStr,
      buffs: buffs.map((entry: any) => ({ key: entry.key, bb: entry.bb, bbStr: entry.bbStr })),
      baseParams: bond.descParamBaseList || [],
      perStackParams: bond.descParamPerStackList || [],
      members,
      visibleMembers: members.filter((id: string) => chess[id].visible),
      spec: research?.spec || null,
    }
  }
  return out
}
