import type { Registration } from "arknights-mission-core"
import tier1 from "./tier-1.js"
import tier2 from "./tier-2.js"
import tier3 from "./tier-3.js"
import tier4 from "./tier-4.js"
import tier5 from "./tier-5.js"
import tier6 from "./tier-6.js"
import { genericKit } from "./generic.js"
import { battleFacade } from "#server/content/support/battle-facade.js"
import { noteBlocked } from "#server/content/support/blocked.js"

export { genericKit }

export const KITS: any = Object.freeze(Object.assign({}, tier1, tier2, tier3, tier4, tier5, tier6))

function selectedSkillId(def: any): string | null {
  return def?.skill?.id ?? def?.raw?.skill?.skillId ?? null
}

function skillIsDefault(def: any): boolean {
  return !def?.loadout || def.loadout.skillIsDefault !== false
}

export function selectSkillSpec(kit: any, bb: any, raw: any, def: any): any {
  const id = selectedSkillId(def)
  const map = kit && kit.skills && typeof kit.skills === "object" ? kit.skills : null
  if (id && map && Object.prototype.hasOwnProperty.call(map, id)) return { ...kit, skill: map[id] ?? null, skillSource: "skills" }
  if (skillIsDefault(def)) return kit
  const generic = genericKit(bb, raw, def)
  const own = typeof kit.install === "function" ? kit.install : null
  const generated = typeof generic.install === "function" ? generic.install : null
  const out: any = { ...kit, skill: generic.skill ?? null, skillSource: "generic" }
  if (own && generated) out.install = (battle: any, unit: any) => { own(battle, unit); generated(battle, unit) }
  else if (generated) out.install = generated
  return out
}

export function skillSpecSource(def: any, kits: any = KITS): string {
  const bare = String(def?.baseId ?? def?.id ?? "").replace(/_[ab]$/, "")
  const kitFn = kits?.[def?.baseId] ?? kits?.[def?.id] ?? kits?.[bare]
  if (typeof kitFn !== "function") return "none"
  let kit = null
  try { kit = kitFn(def?.skill?.bb ?? {}, def?.raw ?? def, def) } catch { return "generic" }
  if (!kit || kit.generic) return "generic"
  const id = selectedSkillId(def)
  if (id && kit.skills && Object.prototype.hasOwnProperty.call(kit.skills, id)) return "skills"
  return skillIsDefault(def) && kit.skill !== undefined ? "kit" : "generic"
}

export function install(ctx: Registration): void {
  const seen = new Set<string>()
  const arm = (live: any, id: string): void => {
    if (!id || seen.has(id)) return
    seen.add(id)
    const battle = battleFacade(live)
    const unit = battle.unitById(id)
    if (!unit) return
    const def = unit.def ?? {}
    const bare = String(def.baseId ?? def.id ?? id).replace(/_[ab]$/, "")
    const bb = def.skill?.bb ?? {}
    const raw = def.raw ?? def
    try {
      const kitFn = unit.kind === "token" ? null : (KITS[def.baseId] ?? KITS[def.id] ?? KITS[bare])
      let kit = null
      if (typeof kitFn === "function") kit = selectSkillSpec(kitFn(bb, raw, def), bb, raw, def)
      else if (def.skill) kit = genericKit(bb, raw, def)
      if (!kit) return
      unit.kit = kit
      const skillDef = kit.skill
      if (skillDef && typeof skillDef === "object") {
        const shown = unit.skill
        if (shown && typeof shown === "object") {
          if (skillDef.kind) shown.kind = skillDef.kind
          if (skillDef.ammo != null) shown.ammo = skillDef.ammo
        }
        if (skillDef.mods) {
          battle.on("skillStart", (event: { unit?: { id?: string } }) => {
            if (event.unit?.id !== id) return
            battle.addBuff(unit, { key: `kit-skill:${id}`, mods: skillDef.mods })
            const priority = skillDef.targeting?.priority
            if (typeof priority === "string" && priority.length > 0) live.setAim?.(id, priority)
          }, { owner: unit })
          battle.on("skillEnd", (event: { unit?: { id?: string } }) => {
            if (event.unit?.id !== id) return
            battle.removeBuff(unit, `kit-skill:${id}`)
            if (skillDef.targeting?.priority) live.setAim?.(id, "")
          }, { owner: unit })
        }
        const body = skillDef.kind === "ammo" || skillDef.kind === "duration" || skillDef.kind === "toggle" || skillDef.kind === "instant"
          ? skillDef.kind
          : null
        if (body) {
          live.configureSkill?.(id, String(shown?.id ?? "skill"), {
            body,
            ...(skillDef.ammo != null ? { ammo: Number(skillDef.ammo) } : {}),
          })
        }
      }
      for (const talent of kit.talents ?? []) {
        if (talent && typeof talent.install === "function") talent.install(battle, unit)
      }
      if (kit.trait && typeof kit.trait.install === "function") kit.trait.install(battle, unit)
      if (typeof kit.install === "function") kit.install(battle, unit)
    } catch (cause) {
      noteBlocked(`kit:${bare}:${cause instanceof Error ? cause.message : "failed"}`)
    }
  }
  ctx.subscribe("deploy", (event, live) => {
    const id = event.data.unitId
    if (typeof id === "string") arm(live, id)
  })
  const battle = battleFacade(ctx as never)
  for (const unit of battle.allyUnits ?? []) arm(ctx, String(unit.id ?? ""))
}
