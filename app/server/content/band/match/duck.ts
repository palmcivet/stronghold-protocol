import type { EffectContext, EffectRoute, EffectSpawn } from "#server/content/effect.js"
import { asRecord, bandRecord, buffsOf, num } from "#server/content/support/record.js"

export const DUCK_BAND: string = "band_ducklord"
export const DUCK_COINS: number = 1

const DUCK_KINDS = new Set(["normal", "boss", "hidden"])
/** Boss-field columns run from 0 through 20. Routes ending past the midpoint belong to the right half. */
const BOSS_MID_COL = 10

function int(value: unknown, fallback = 0): number {
  return Math.trunc(num(value, fallback))
}

function list(value: unknown): string[] {
  return String(value ?? "").split(",").map((part) => part.trim()).filter((part) => part.length > 0)
}

export function duckParams(): Record<string, unknown> | null {
  for (const buff of buffsOf(bandRecord(DUCK_BAND))) {
    if (buff.key === "round_start_all_player_change_enemy_2") return buff.params
  }
  return null
}

interface FlatSpawn {
  readonly index: number
  readonly copy: number
  readonly time: number
}

/**
 * Rewrite `spawns` in place. `side` limits the swap to routes that end on that half of a pair field.
 * Returns the replacement rows.
 */
export function duckReplace(
  ctx: EffectContext,
  spawns: EffectSpawn[],
  params: Record<string, unknown>,
  ownerPlayerId: string,
  options: { readonly routes?: readonly EffectRoute[] | null; readonly side?: string | null } = {},
): EffectSpawn[] {
  const ducks = list(params.enemylist).filter((key) => ctx.gd.enemy(key))
  if (!ducks.length) return []
  const low = Math.max(0, int(params.min, 0))
  const high = Math.max(low, int(params.max, low))
  const want = low + ctx.rng.int(high - low + 1)
  if (want <= 0) return []
  const side = options.side
  const half = side === "L" || side === "R"
  const onHalf = (spawn: EffectSpawn): boolean => {
    if (!half) return true
    const route = options.routes && spawn.routeIndex !== undefined ? options.routes[spawn.routeIndex] : null
    const end = route && Array.isArray(route.end) ? Number(route.end[1]) : Number.NaN
    return side === "R" ? end > BOSS_MID_COL : end < BOSS_MID_COL
  }
  const flat: FlatSpawn[] = []
  spawns.forEach((spawn, index) => {
    if (!onHalf(spawn)) return
    const count = Math.max(1, int(spawn.count, 1))
    for (let copy = 0; copy < count; copy += 1) {
      flat.push({ index, copy, time: num(spawn.time, 0) + copy * num(spawn.interval, 0) })
    }
  })
  flat.sort((left, right) => left.time - right.time || left.index - right.index || left.copy - right.copy)
  const width = num(params.minweight, 0)
  const highWeight = num(params.maxweight, 1)
  const total = flat.length
  const eligible = flat.filter((entry, order) => {
    const spawn = spawns[entry.index]
    if (!spawn || spawn.tag || spawn.countInTotal === false) return false
    const enemyKey = spawn.enemyKey
    const enemy = enemyKey ? asRecord(ctx.gd.enemy(enemyKey)) : null
    const stats = enemy ? asRecord(enemy.stats) : null
    const fraction = total > 1 ? order / (total - 1) : 0
    return !!enemy
      && enemy.rank !== "BOSS"
      && enemy.notCountInTotal !== true
      && stats?.motion !== "FLY"
      && fraction >= width - 1e-9
      && fraction <= highWeight + 1e-9
  })
  const picked = ctx.rng.shuffle(eligible).slice(0, want)
  if (!picked.length) return []
  const byIndex = new Map<number, Set<number>>()
  for (const entry of picked) {
    const copies = byIndex.get(entry.index) ?? new Set<number>()
    copies.add(entry.copy)
    byIndex.set(entry.index, copies)
  }
  const added: EffectSpawn[] = []
  const replaced: EffectSpawn[] = []
  for (const [index, copies] of byIndex) {
    const spawn = spawns[index]
    if (!spawn) continue
    const count = Math.max(1, int(spawn.count, 1))
    for (const copy of copies) {
      const row: EffectSpawn = {
        ...spawn,
        mods: spawn.mods ? { ...spawn.mods } : null,
        count: 1,
        interval: 0,
        time: num(spawn.time, 0) + copy * num(spawn.interval, 0),
        enemyKey: ctx.rng.pick(ducks),
        tag: "duck",
        bounty: { coins: DUCK_COINS, ownerPlayerId },
      }
      if (row.mods && Object.hasOwn(row.mods, "slot")) delete row.mods.slot
      added.push(row)
      replaced.push(row)
    }
    if (copies.size < count) {
      for (let copy = 0; copy < count; copy += 1) {
        if (copies.has(copy)) continue
        added.push({
          ...spawn,
          mods: spawn.mods ? { ...spawn.mods } : null,
          count: 1,
          interval: 0,
          time: num(spawn.time, 0) + copy * num(spawn.interval, 0),
        })
      }
    }
  }
  const kept = spawns.filter((_spawn, index) => !byIndex.has(index))
  spawns.length = 0
  spawns.push(...kept, ...added)
  return replaced
}

export function duckOnBattleStart(ctx: EffectContext, event: { kind?: string; spawns?: EffectSpawn[]; routes?: readonly EffectRoute[] | null; side?: string }): void {
  if (!event.spawns || !event.kind || !DUCK_KINDS.has(event.kind)) return
  const params = duckParams()
  if (!params || ctx.round < int(params.round, 1)) return
  const held = ctx.bandId() === DUCK_BAND || ctx.teammates().some((mate) => mate.bandId() === DUCK_BAND)
  if (!held) return
  const options: { routes?: readonly EffectRoute[] | null; side?: string | null } = {}
  if (event.routes != null) options.routes = event.routes
  if (event.side != null) options.side = event.side
  duckReplace(ctx, event.spawns, params, ctx.playerId, options)
}
