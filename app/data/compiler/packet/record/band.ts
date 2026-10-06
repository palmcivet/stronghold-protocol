import type { SeasonContext } from "#compiler/packet/compile/context.js"
import { naturalCmp, textPair } from "#compiler/packet/text/parse.js"

export function buildBands(ctx: SeasonContext, effects: Record<string, any>): Record<string, any> {
  const { act, ac } = ctx
  const out: Record<string, any> = {}
  const ids = Object.keys(act.bandDataListDict)
  ids.sort((left, right) => (act.bandDataListDict[left].sortId ?? 0) - (act.bandDataListDict[right].sortId ?? 0) || naturalCmp(left, right))
  for (const bandId of ids) {
    const band = act.bandDataListDict[bandId]
    const meta = ac.bandDataDict?.[bandId] || {}
    const effect = effects[band.effectId]
    if (!effect) ctx.notes.warn(`band ${bandId}: effect ${band.effectId} missing`)
    const pair = textPair(band.bandDesc, ctx.notes)
    out[bandId] = {
      bandId,
      sortId: band.sortId,
      name: meta.bandName || effect?.name || bandId,
      iconId: meta.bandIconId || `icon_${bandId.replace(/^band_/, "")}`,
      modeTypeList: band.modeTypeList || [],
      totalHp: band.totalHp,
      effectId: band.effectId,
      effectName: effect?.name || null,
      desc: pair.desc,
      descRaw: pair.descRaw,
      buffs: (effect?.buffs || []).map((entry: any) => ({ key: entry.key, bb: entry.bb, bbStr: entry.bbStr })),
      params: effect?.params || {},
      victorCount: band.victorCount,
      rewardModulus: band.bandRewardModulus ?? 1,
      unlockDesc: meta.unlockDesc || null,
    }
  }
  return out
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object"
}

/** 策略围绕的盟约 id，顺序与 bonds 一致。尖括号里的名字按盟约名计，黑板字符串按盟约 id 或已知 bond 的机变池 id 计。 */
export function bandBondIds(band: unknown, source: { readonly bonds?: unknown, readonly pools?: unknown } = {}): string[] {
  const list: readonly (readonly [unknown, unknown])[] = Array.isArray(source.bonds)
    ? source.bonds.filter(isRecord).map((bond) => [bond.bondId, bond])
    : Object.entries(isRecord(source.bonds) ? source.bonds : {})
  const ids = list.map(([id]) => id).filter((id): id is string => typeof id === "string")
  if (!isRecord(band) || ids.length === 0) return []
  const known = new Set(ids)
  const byName = new Map<string, string>()
  for (const [id, bond] of list) {
    if (typeof id === "string" && isRecord(bond) && typeof bond.name === "string") byName.set(bond.name, id)
  }
  const found = new Set<string>()
  for (const match of String(band.desc || "").matchAll(/<([^<>]+)>/g)) {
    const name = match[1]
    if (typeof name !== "string") continue
    const id = byName.get(name.trim())
    if (id) found.add(id)
  }
  const pools = source.pools === undefined ? null : source.pools
  const poolOf = (key: string): Record<string, unknown> | null =>
    isRecord(pools) && Object.hasOwn(pools, key) && isRecord(pools[key]) ? pools[key] : null
  const buffs = Array.isArray(band.buffs) ? band.buffs : []
  for (const buff of buffs) {
    if (!isRecord(buff)) continue
    for (const board of [buff.bb, buff.bbStr]) {
      if (!isRecord(board)) continue
      for (const value of Object.values(board)) {
        if (typeof value !== "string") continue
        for (const part of value.split(",").map((item) => item.trim())) {
          if (known.has(part)) found.add(part)
          const pool = poolOf(part)
          if (pool && typeof pool.bond === "string" && known.has(pool.bond)) found.add(pool.bond)
        }
      }
    }
  }
  return ids.filter((id) => found.has(id))
}
