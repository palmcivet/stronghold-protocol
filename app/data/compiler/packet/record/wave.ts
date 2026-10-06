import type { SeasonContext } from "#compiler/packet/compile/context.js"
import { definedFields, effectiveRangeRadius, enemyOverrideRecord, templateSlots } from "./enemy.js"
import { cleanNum, naturalCmp, pointOf, templateIdOf } from "#compiler/packet/text/parse.js"

function resolveRoute(route: any, notes: SeasonContext["notes"]): any {
  if (!route) return null
  const checkpoints: any[] = []
  const steps: any[] = []
  let special = false
  for (const checkpoint of route.checkpoints || []) {
    switch (checkpoint.type) {
      case "MOVE":
        checkpoints.push(pointOf(checkpoint.position))
        steps.push({ t: "move", p: pointOf(checkpoint.position) })
        break
      case "PATROL_MOVE":
        special = true
        checkpoints.push(pointOf(checkpoint.position))
        steps.push({ t: "patrol", p: pointOf(checkpoint.position) })
        break
      case "WAIT_FOR_SECONDS":
        special = true
        steps.push({ t: "wait", s: checkpoint.time })
        break
      case "DISAPPEAR":
        special = true
        steps.push({ t: "disappear" })
        break
      case "APPEAR_AT_POS":
        special = true
        steps.push({ t: "appear", p: pointOf(checkpoint.position) })
        break
      case "WAIT_CURRENT_FRAGMENT_TIME":
      case "WAIT_CURRENT_WAVE_TIME":
        special = true
        steps.push({ t: "wait", s: checkpoint.time, until: checkpoint.type })
        break
      default:
        special = true
        steps.push({ t: String(checkpoint.type).toLowerCase(), p: pointOf(checkpoint.position), s: checkpoint.time })
        notes.warn(`unknown checkpoint type ${checkpoint.type}`)
    }
  }
  const out: Record<string, any> = { motion: route.motionMode, start: pointOf(route.startPosition), end: pointOf(route.endPosition), checkpoints }
  if (special) out.steps = steps
  const range = route.spawnRandomRange
  if (range && (range.x || range.y)) out.spawnRandom = [cleanNum(range.x), cleanNum(range.y)]
  if (route.allowDiagonalMove === false) out.allowDiagonal = false
  return out
}

function expandActions(groups: readonly any[], slots: Record<string, string>, bossKeys: ReadonlySet<string>, label: string, notes: SeasonContext["notes"]): any[] {
  const spawns: any[] = []
  let cursor = 0
  for (const group of groups) {
    const start = cursor + (group.preDelay || 0)
    let end = start
    for (const action of group.actions || []) {
      const time = cleanNum(start + (action.preDelay || 0))
      const count = action.count ?? 1
      const interval = cleanNum(action.interval || 0)
      const entry: Record<string, any> = { time, key: action.key, count, interval, routeIndex: action.routeIndex ?? 0 }
      if (action.actionType !== "SPAWN") entry.action = action.actionType
      const slot = slots[action.key]
      if (slot) entry.slot = slot
      if (bossKeys.has(action.key)) entry.tag = "boss"
      else if (action.isUnharmfulAndAlwaysCountAsKilled || action.randomSpawnGroupKey) entry.tag = "part"
      if (action.hiddenGroup) {
        entry.hidden = true
        entry.hiddenGroup = action.hiddenGroup
      }
      if (action.randomSpawnGroupKey) {
        entry.group = action.randomSpawnGroupKey
        entry.pack = action.randomSpawnGroupPackKey
        entry.weight = action.weight
      }
      if (action.isUnharmfulAndAlwaysCountAsKilled) entry.unharmful = true
      if (action.randomType && action.randomType !== "ALWAYS") entry.randomType = action.randomType
      spawns.push(entry)
      end = Math.max(end, time + Math.max(0, count - 1) * interval)
    }
    cursor = end
  }
  if (groups.length > 1) notes.warn(`${label}: multi-fragment timing approximated (next fragment after previous one's last spawn)`)
  return spawns
}

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

export function buildWaves(ctx: SeasonContext, enemies: Record<string, any>): Record<string, any> {
  const slots = templateSlots(ctx)
  const usage = templateUsage(ctx)
  const bossEnemy = Object.fromEntries(Object.entries(ctx.ac.bossInfoDict || {}).map(([id, boss]) => [id, (boss as any).enemyId]))
  const escaped = new Set(["escapedBattleTemplateMapSinglePlayer", "escapedBattleTemplateMapMultiPlayer"]
    .map((key) => ctx.act.constData[key]).filter(Boolean).map(templateIdOf))
  const out: Record<string, any> = {}
  for (const id of ctx.templateIds) {
    const level = ctx.levels[id]
    const uses = usage.get(id) || []
    const bossIds = [...new Set(uses.map((use) => use.bossId).filter(Boolean))]
    const bossKeys = new Set(bossIds.map((bossId) => bossEnemy[bossId]).filter(Boolean))
    const groups: any[] = []
    for (const wave of level.waves || []) {
      ;(wave.fragments || []).forEach((fragment: any, index: number) => groups.push({
        preDelay: (index === 0 ? (wave.preDelay || 0) : 0) + (fragment.preDelay || 0),
        actions: fragment.actions,
      }))
    }
    const spawns = expandActions(groups, slots, bossKeys, `template ${id}`, ctx.notes)
    const branches: Record<string, any> = {}
    for (const [name, branch] of Object.entries(level.branches || {})) {
      branches[name] = ((branch as any).phases || []).map((phase: any, index: number) => expandActions([{ preDelay: phase.preDelay, actions: phase.actions }], slots, bossKeys, `template ${id} branch ${name}#${index}`, ctx.notes))
    }
    const overrides: Record<string, any> = {}
    for (const ref of level.enemyDbRefs || []) {
      if (!ref.overwrittenData) continue
      const record = enemyOverrideRecord(definedFields(ref.overwrittenData), `template ${id} ${ref.id}`, ctx.notes)
      const way = record.applyWay || enemies[ref.id]?.applyWay
      if (record.stats && "rangeRadius" in record.stats) {
        record.stats.rawRangeRadius = record.stats.rangeRadius
        record.stats.rangeRadius = effectiveRangeRadius(way, record.stats.rangeRadius)
      } else if (record.applyWay && enemies[ref.id]) {
        const radius = effectiveRangeRadius(record.applyWay, enemies[ref.id].stats.rawRangeRadius)
        if (radius !== enemies[ref.id].stats.rangeRadius) record.stats = { ...(record.stats || {}), rangeRadius: radius }
      }
      if (Object.keys(record).length) overrides[ref.id] = record
    }
    const devices = (level.predefines?.tokenInsts || []).map((token: any) => ({
      key: token.inst?.characterKey,
      alias: token.alias || null,
      pos: pointOf(token.position),
      dir: token.direction,
      hidden: !!token.hidden,
    }))
    const options = level.options || {}
    let kind = "normal"
    if (escaped.has(id)) kind = "escaped"
    else if (/_tr\d+$/.test(id)) kind = "training"
    else if (/_h08_/.test(id)) kind = "hidden"
    else if (bossIds.length) kind = "boss"
    const slotCounts: Record<string, number> = {}
    let total = 0
    for (const spawn of spawns) {
      if (spawn.action) continue
      if (spawn.slot) slotCounts[spawn.slot] = (slotCounts[spawn.slot] || 0) + spawn.count
      if (!spawn.unharmful) total += spawn.count
    }
    out[id] = {
      id,
      kind,
      solo: /_s$/.test(id),
      bossId: bossIds.length === 1 ? bossIds[0] : bossIds.length ? bossIds : null,
      maxPlayTime: options.maxPlayTime ?? null,
      dp: { init: options.initialCost ?? 10, perSec: options.costIncreaseTime ? cleanNum(1 / options.costIncreaseTime) : 1, max: options.maxCost ?? 99 },
      characterLimit: options.characterLimit ?? 8,
      moveMultiplier: options.moveMultiplier ?? 0.5,
      bgm: level.bgmEvent || null,
      routes: (level.routes || []).map((route: any) => resolveRoute(route, ctx.notes)),
      extraRoutes: (level.extraRoutes || []).map((route: any) => resolveRoute(route, ctx.notes)),
      spawns,
      branches,
      overrides,
      devices,
      totalCount: total,
      slotCounts,
      usedBy: uses.sort((left, right) => naturalCmp(left.modeId, right.modeId) || left.round - right.round),
    }
    for (const spawn of spawns) {
      if (spawn.action) continue
      if (!out[id].routes[spawn.routeIndex]) ctx.notes.warn(`template ${id}: spawn ${spawn.key} uses missing route ${spawn.routeIndex}`)
      if (!enemies[spawn.key]) ctx.notes.warn(`template ${id}: spawn key ${spawn.key} not in enemies`)
    }
    for (const [name, phases] of Object.entries(branches)) for (const spawn of (phases as any[]).flat()) {
      if (spawn.action) continue
      if (!enemies[spawn.key]) ctx.notes.warn(`template ${id}: branch ${name} key ${spawn.key} not in enemies`)
      if (!out[id].extraRoutes[spawn.routeIndex]) ctx.notes.warn(`template ${id}: branch ${name} uses missing extraRoute ${spawn.routeIndex}`)
    }
  }
  return out
}
