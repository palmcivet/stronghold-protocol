import type { SeasonContext } from "#compiler/packet/compile/context.js"
import { flattenBB, naturalCmp, textPair } from "#compiler/packet/text/parse.js"

export function buildGarrisons(ctx: SeasonContext, chess: Record<string, any>): Record<string, any> {
  const dict = ctx.act.garrisonDataDict
  const wanted = new Set<string>()
  for (const piece of Object.values(chess)) for (const garrisonId of piece.garrisonIds) wanted.add(garrisonId)
  const queue = [...wanted]
  while (queue.length) {
    const id = queue.pop()
    if (id === undefined) continue
    const garrison = dict[id]
    if (!garrison) continue
    for (const entry of garrison.blackboard || []) {
      if (typeof entry.valueStr !== "string") continue
      for (const match of entry.valueStr.matchAll(/garrison_\d+_[ab]/g)) {
        const ref = match[0]
        if (!wanted.has(ref) && dict[ref]) {
          wanted.add(ref)
          queue.push(ref)
        }
      }
    }
  }
  const out: Record<string, any> = {}
  for (const id of [...wanted].sort(naturalCmp)) {
    const garrison = dict[id]
    if (!garrison) {
      ctx.notes.warn(`garrison ${id} referenced but missing from garrisonDataDict`)
      continue
    }
    const { bb, bbStr } = flattenBB(garrison.blackboard, `garrison ${id}`, ctx.notes)
    const pair = textPair(garrison.garrisonDesc || garrison.description, ctx.notes)
    out[id] = {
      garrisonId: id,
      desc: pair.desc,
      descRaw: pair.descRaw,
      eventType: garrison.eventType,
      eventTypeDesc: garrison.eventTypeDesc || null,
      eventTypeIcon: garrison.eventTypeIcon || null,
      effectType: garrison.effectType,
      effectKey: bbStr.key || garrison.effectType,
      battleRuneKey: garrison.battleRuneKey || null,
      charLevel: garrison.charLevel || 0,
      bb,
      bbStr,
      owners: Object.values(chess).filter((piece) => piece.garrisonIds.includes(id)).map((piece) => piece.chessId).sort(naturalCmp),
    }
  }
  return out
}
