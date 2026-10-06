import type { SeasonContext } from "#compiler/packet/compile/context.js"
import { flattenBB, naturalCmp, richRaw, stripRich } from "#compiler/packet/text/parse.js"

export function effectBuffs(ctx: SeasonContext, effectId: string): any[] {
  return (ctx.act.effectBuffInfoDataDict?.[effectId] || []).map((buff: any, index: number) => {
    const { bb, bbStr } = flattenBB(buff.blackboard, `effect ${effectId} buff ${index}`, ctx.notes)
    return { key: buff.key, countType: buff.countType || "NONE", bb, bbStr }
  })
}

export function effectParams(buffs: readonly any[]): Record<string, any> {
  const params: Record<string, any> = {}
  for (const buff of buffs) {
    for (const [key, value] of Object.entries({ ...buff.bb, ...buff.bbStr })) if (!(key in params)) params[key] = value
  }
  return params
}

export function buildEffects(ctx: SeasonContext): Record<string, any> {
  const out: Record<string, any> = {}
  for (const effectId of Object.keys(ctx.act.effectInfoDataDict).sort(naturalCmp)) {
    const effect = ctx.act.effectInfoDataDict[effectId]
    const buffs = effectBuffs(ctx, effectId)
    out[effectId] = {
      effectId,
      effectType: effect.effectType,
      name: effect.effectName || null,
      desc: stripRich(effect.effectDesc),
      descRaw: richRaw(effect.effectDesc),
      counterType: effect.effectCounterType || "NONE",
      continuedRound: effect.continuedRound ?? -1,
      decoIconId: effect.effectDecoIconId || null,
      enemyPrice: effect.enemyPrice || 0,
      buffs,
      params: effectParams(buffs),
    }
  }
  for (const id of Object.keys(ctx.act.effectBuffInfoDataDict)) {
    if (!out[id]) ctx.notes.warn(`effectBuffInfoDataDict has ${id} without effectInfoDataDict entry`)
  }
  return out
}
