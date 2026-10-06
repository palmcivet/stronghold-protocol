import type { SeasonContext } from "#compiler/packet/compile/context.js"

/** Normal item ids the shop never sells. Both qualities are marked `shopExcluded`. */
export const SHOP_EXCLUDED_ITEMS: Readonly<Record<string, string>> = {
  chess_item_2_03_e_a: "维多利亚盟约每25层 / 洛洛的定制品",
  chess_item_3_09_e_a: "维多利亚盟约每25层 / 洛洛的定制品",
  chess_item_3_10_e_a: "维多利亚盟约每25层 / 洛洛的定制品",
  chess_item_4_09_e_a: "维多利亚盟约每25层 / 洛洛的定制品",
  chess_item_5_08_e_a: "策略【不稳定要素】（昆图斯）",
}

const ITEM_RULES: Readonly<Record<string, { readonly note: string, readonly implFormula: string }>> = {
  chess_item_5_08_e_a: {
    note: "生效时原干员销毁，突变细胞与其他装备退回整备区，可再次配发；随后获得一名高一阶的随机初始干员（最高6阶），进入整备区，需要重新部署",
    implFormula: "After the battle: the carrier is destroyed wherever it stands (a board tile is freed); its equipment, the "
      + "cell included, returns to the hand first (overflow temp; the cell is not consumed); then a random NORMAL operator "
      + "one tier higher (max 6; an elite carrier too) is gained like any gained operator: the hand, overflow temp, a "
      + "completed merge as usual (the elite on a consumed deployed copy's tile, never the carrier's). Never merges.",
  },
}

export function buildItems(ctx: SeasonContext, effects: Record<string, any>): Record<string, any> {
  const { act, charTable } = ctx
  const researchItems = new Map<string, any>((ctx.research.items?.items || []).map((item: any) => [item.id, item]))
  const shopByBase = new Map<string, any>()
  for (const shop of Object.values(act.trapShopChessDatas) as any[]) {
    shopByBase.set(shop.itemId, shop)
    if (shop.goldenItemId) shopByBase.set(shop.goldenItemId, shop)
  }
  const out: Record<string, any> = {}
  for (const chessId of Object.keys(act.trapChessDataDict).sort((left, right) => String(left).localeCompare(String(right), "en", { numeric: true }))) {
    const trapChess = act.trapChessDataDict[chessId]
    const shop = shopByBase.get(chessId)
    if (!shop) ctx.notes.warn(`item ${chessId}: no trapShopChessDatas entry`)
    const baseId = shop?.itemId || chessId
    const effect = effects[trapChess.effectId]
    if (!effect) ctx.notes.warn(`item ${chessId}: effect ${trapChess.effectId} missing`)
    const trap = charTable[trapChess.charId]
    if (!trap) ctx.notes.warn(`item ${chessId}: trap ${trapChess.charId} missing from character_table`)
    const research = researchItems.get(baseId)
    const isGolden = !!trapChess.isGolden
    const upgradeNum = trapChess.upgradeNum
    const excluded = Object.hasOwn(SHOP_EXCLUDED_ITEMS, baseId) ? SHOP_EXCLUDED_ITEMS[baseId] : null
    const rule = Object.hasOwn(ITEM_RULES, baseId) ? ITEM_RULES[baseId] : null
    out[chessId] = {
      id: chessId,
      baseId,
      goldenId: shop?.goldenItemId || null,
      isGolden,
      trapId: trapChess.charId,
      iconId: trapChess.charId,
      identifier: trapChess.identifier,
      name: trap?.name || effect?.name || chessId,
      itemType: trapChess.itemType,
      tier: shop?.itemLevel ?? null,
      shopSortId: shop?.shopLevelSortId ?? null,
      price: trapChess.purchasePrice,
      hideInShop: !!shop?.hideInShop,
      shopExcluded: !!excluded,
      shopExcludedBy: excluded,
      mergeable: !isGolden && upgradeNum > 0 && upgradeNum < 100,
      upgradeNum,
      upgradeChessId: trapChess.upgradeChessId || null,
      duration: trapChess.trapDuration,
      giveBondId: trapChess.giveBondId || null,
      givePowerId: trapChess.givePowerId || null,
      canGiveBond: !!trapChess.canGiveBond,
      requiresBondId: research?.requiresBond || null,
      effectId: trapChess.effectId,
      effectName: effect?.name || null,
      desc: effect?.desc || null,
      descRaw: effect?.descRaw || null,
      buffs: (effect?.buffs || []).map((buff: any) => ({ key: buff.key, countType: buff.countType, bb: buff.bb, bbStr: buff.bbStr })),
      params: effect?.params || {},
      category: research?.category || null,
      kind: research?.kind || null,
      family: research?.family || null,
      implFormula: rule?.implFormula || research?.implFormula || null,
      note: rule?.note || null,
      rangeGrid: Array.isArray(research?.rangeGrids) ? research.rangeGrids.map((grid: any) => [grid.row, grid.col]) : null,
      flavor: research?.flavor || null,
    }
    if (!research) ctx.notes.warn(`item ${chessId}: no research 04 entry (category/kind unknown)`)
  }
  return out
}
