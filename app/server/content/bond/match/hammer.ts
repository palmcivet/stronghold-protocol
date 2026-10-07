import type { EffectContext, EffectHandler, EffectRegistry } from "#server/content/effect.js"
import { bondRecord, buffParams, num } from "#server/content/support/record.js"

const REWARD_KEY = "bond_layer_added_reward_equip"
const COUNTER = "bond:victoria:hammers"
const HOOKS = ["onLayers", "onRoundStart", "onPrepStart", "onPrepEnd", "onBuy", "onGain", "onSold", "onMerge"] as const

/** Pay Victoria hammer milestones that are due while the bond is active. */
export function payHammers(ctx: EffectContext): number {
  if (!ctx.bondActive("victoriaShip")) return 0
  const record = ctx.data.bonds ? bondRecordFrom(ctx) : bondRecord("victoriaShip")
  const params = buffParams(record, REWARD_KEY)
  const step = Math.floor(num(params?.layer, 0))
  if (!params || !(step > 0)) return 0
  const due = Math.floor(ctx.layers("victoriaShip") / step)
  const count = Math.max(0, Math.floor(num(params.count, 1)))
  let granted = 0
  for (let guard = 0; guard < 100; guard += 1) {
    const paid = ctx.counter(COUNTER)
    if (paid >= due) break
    ctx.setCounter(COUNTER, paid + 1)
    const pool = typeof params.pool === "string" ? params.pool : undefined
    for (let index = 0; index < count; index += 1) {
      const id = ctx.rollItem(pool ? { pool } : {})
      if (id && ctx.grantItem(id, { source: "bond:victoriaShip" })) granted += 1
    }
  }
  if (granted > 0) ctx.toast(`【维多利亚】获得${granted}件维式重锤`, "info")
  return granted
}

function bondRecordFrom(ctx: EffectContext): unknown {
  const bonds = ctx.data.bonds
  if (bonds && typeof bonds === "object" && !Array.isArray(bonds) && Object.hasOwn(bonds, "victoriaShip")) {
    return (bonds as Record<string, unknown>).victoriaShip
  }
  return bondRecord("victoriaShip")
}

export function registerHammerMeta(registry: EffectRegistry): void {
  const previous = registry.get("bond:victoriaShip")
  const handler: EffectHandler = { ...(previous ?? {}) }
  for (const hook of HOOKS) {
    const before = previous?.[hook]
    handler[hook] = function hammers(ctx, event) {
      if (before) before.call(previous, ctx, event)
      if (hook === "onLayers" && event.bondId !== "victoriaShip") return
      payHammers(ctx)
    }
  }
  registry.bond("victoriaShip", handler)
}
