import type { SeasonContext } from "#compiler/packet/compile/context.js"
import { naturalCmp, templateIdOf } from "#compiler/packet/text/parse.js"

function templateUsage(ctx: SeasonContext): Map<string, any[]> {
  const usage = new Map<string, any[]>()
  for (const [modeId, rounds] of Object.entries(ctx.act.battleDataDict)) {
    for (const [round, entries] of Object.entries(rounds as Record<string, any>)) {
      for (const entry of entries as any[]) {
        const id = templateIdOf(entry.levelId)
        if (!usage.has(id)) usage.set(id, [])
        usage.get(id)?.push({ modeId, round: Number(round), bossId: entry.bossId || null })
      }
    }
  }
  return usage
}

export function buildBosses(ctx: SeasonContext, enemies: Record<string, any>, waves: Record<string, any>): Record<string, any> {
  const { ac, act } = ctx
  const out: Record<string, any> = {}
  const usage = templateUsage(ctx)
  for (const bossId of Object.keys(act.bossInfoDict).sort(naturalCmp)) {
    const boss = act.bossInfoDict[bossId]
    const global = ac.bossInfoDict?.[bossId] || {}
    const enemyKey = global.enemyId
    const enemy = enemies[enemyKey]
    if (!enemy) ctx.notes.warn(`boss ${bossId}: enemy ${enemyKey} missing`)
    const templates: Record<string, any> = {}
    for (const [templateId, uses] of usage) for (const use of uses) if (use.bossId === bossId) {
      templates[use.modeId] = { round: use.round, template: templateId }
    }
    const escortsByTemplate: Record<string, any> = {}
    const parts = new Set<string>()
    for (const templateId of new Set(Object.values(templates).map((row) => row.template))) {
      const wave = waves[templateId]
      if (!wave) continue
      const list: Record<string, number> = {}
      for (const spawn of wave.spawns) {
        if (spawn.action || spawn.tag === "boss") continue
        if (spawn.tag === "part") {
          parts.add(spawn.key)
          continue
        }
        const key = spawn.slot ? `${spawn.slot}:${spawn.key}` : spawn.key
        list[key] = (list[key] || 0) + spawn.count
      }
      escortsByTemplate[templateId] = Object.entries(list).map(([key, count]) => {
        const split = key.includes(":") ? key.split(":") : [null, key]
        return { key: split[1], slot: split[0], count }
      })
    }
    out[bossId] = {
      bossId,
      enemyKey,
      handbookId: global.handbookEnemyId || enemyKey,
      name: enemy?.name || enemyKey,
      sortId: boss.sortId,
      weight: boss.weight,
      hidden: !!boss.isHidingBoss,
      bloodPoint: { FUNNY: boss.bloodPoint, NORMAL: boss.bloodPointNormal, HARD: boss.bloodPointHard, ABYSS: boss.bloodPointAbyss },
      lpr: enemy?.stats?.lpr ?? null,
      templates,
      escortsByTemplate,
      parts: [...parts].sort(naturalCmp),
      abilities: enemy?.abilities?.map((ability: any) => ability.text) || [],
    }
  }
  return out
}
