import type { ContentContext } from "#port/context.js"
import type { ProjectileImpact, ProjectileLaunch, ProjectileView } from "#port/definition.js"
import { resolveAttackImpact } from "#combat/attack/shape.js"
import type { BattleRegistry } from "#port/definition.js"
import type { BattleWorld } from "#unit/record/index.js"
import { defineResource } from "#kernel/world/resource.js"
import { TICK } from "#kernel/tick/index.js"
import { hypot } from "#kernel/math/hypot.js"
import { boomerangOf } from "#combat/attack/boomerang.js"

/** 缺省飞行速度，格/秒。 */
export const PROJECTILE_SPEED = 12

/** 飞行超过这么多秒仍未到达，视为落到目标当前位置并结算。 */
export const PROJECTILE_MAX_AGE = 10

export interface ProjectileFlight {
  id: string
  sourceId: string
  targetId: string
  amount: number
  speed: number
  x: number
  y: number
  aimX: number
  aimY: number
  age: number
  retain: boolean
  attack: ProjectileImpact | null
  /** 发出时来源的回旋世代。再部署加一后，世代对不上的回程不改计数。 */
  epoch: number
}

/** 仍在飞的投射物，按发出顺序。 */
export const PROJECTILES = defineResource<ProjectileFlight[]>("combat:projectiles", () => [])

function flightsOf(state: BattleWorld): ProjectileFlight[] {
  return state.resources.access(PROJECTILES).ensure()
}

export function launchProjectile(state: BattleWorld, projectile: ProjectileLaunch): void {
  const source = state.units.get(projectile.sourceId)
  const target = state.units.get(projectile.targetId)
  const given = projectile.speed
  const attack = projectile.attack ?? null
  flightsOf(state).push({
    id: projectile.id,
    sourceId: projectile.sourceId,
    targetId: projectile.targetId,
    amount: projectile.amount,
    speed: given !== undefined && given > 0 ? given : PROJECTILE_SPEED,
    x: projectile.x ?? source?.x ?? 0,
    y: projectile.y ?? source?.y ?? 0,
    aimX: target?.x ?? projectile.x ?? 0,
    aimY: target?.y ?? projectile.y ?? 0,
    age: 0,
    retain: projectile.retain === true,
    attack,
    epoch: source?.deployEpoch ?? 0,
  })
  if (attack?.leg === "out") noteBoomerang(state, projectile.sourceId, 1, source?.deployEpoch ?? 0)
}

export function projectileViews(state: BattleWorld): readonly ProjectileView[] {
  return flightsOf(state).map((projectile) => ({
    id: projectile.id,
    sourceId: projectile.sourceId,
    targetId: projectile.targetId,
    amount: projectile.amount,
    speed: projectile.speed,
    x: projectile.x,
    y: projectile.y,
  }))
}

/** 朝仍在场的目标飞一拍。普通一发在目标离场时消掉。retain 的一发落到最后坐标。 */
export function advanceProjectiles(state: BattleWorld, registry: BattleRegistry, ctx: ContentContext): void {
  const keep: ProjectileFlight[] = []
  const arrived: ProjectileFlight[] = []
  const flights = flightsOf(state)
  for (const projectile of flights) {
    projectile.age += TICK
    const target = state.units.get(projectile.targetId)
    const live = target !== undefined && target.fielded && !target.downed && (target.attributes.hp ?? 0) > 0
    if (live && target) {
      projectile.aimX = target.x
      projectile.aimY = target.y
    } else if (!projectile.retain) {
      release(state, projectile, false)
      continue
    }
    const goalX = live && target ? target.x : projectile.aimX
    const goalY = live && target ? target.y : projectile.aimY
    const dx = goalX - projectile.x
    const dy = goalY - projectile.y
    const distance = hypot(dx, dy)
    const step = projectile.speed * TICK
    if (distance <= step + 1e-8 || projectile.age >= PROJECTILE_MAX_AGE) {
      projectile.x = goalX
      projectile.y = goalY
      arrived.push(projectile)
    } else {
      projectile.x += (dx / distance) * step
      projectile.y += (dy / distance) * step
      keep.push(projectile)
    }
  }
  flights.splice(0, flights.length, ...keep)
  for (const projectile of arrived) arrive(state, registry, ctx, projectile)
}

function arrive(state: BattleWorld, registry: BattleRegistry, ctx: ContentContext, projectile: ProjectileFlight): void {
  const attack = projectile.attack
  if (attack?.leg === "back") {
    release(state, projectile, false)
    return
  }
  if (attack) {
    const target = state.units.get(projectile.targetId)
    const live = target !== undefined && target.fielded && !target.downed && (target.attributes.hp ?? 0) > 0
    resolveAttackImpact(state, registry, ctx, {
      sourceId: projectile.sourceId,
      targetId: live ? projectile.targetId : null,
      x: projectile.x,
      y: projectile.y,
      amount: projectile.amount,
      hitCount: attack.hitCount,
      shape: attack.shape,
    })
  } else {
    ctx.dealDamage({
      sourceId: projectile.sourceId,
      targetId: projectile.targetId,
      amount: projectile.amount,
      kind: "physical",
    })
  }
  if (attack?.leg === "out" && attack.returnSpeed !== undefined && attack.returnSpeed > 0 && atHome(state, projectile.sourceId)) {
    flightsOf(state).push({
      id: `${projectile.id}:return`,
      sourceId: projectile.sourceId,
      targetId: projectile.sourceId,
      amount: 0,
      speed: attack.returnSpeed,
      x: projectile.x,
      y: projectile.y,
      aimX: state.units.get(projectile.sourceId)?.x ?? projectile.x,
      aimY: state.units.get(projectile.sourceId)?.y ?? projectile.y,
      age: 0,
      retain: false,
      attack: { shape: attack.shape, hitCount: 0, leg: "back", returnSpeed: attack.returnSpeed },
      epoch: projectile.epoch,
    })
    ctx.emit("projectile", {
      id: `${projectile.id}:return`,
      sourceId: projectile.sourceId,
      targetId: projectile.sourceId,
    })
    release(state, projectile, true)
    return
  }
  release(state, projectile, false)
}

function atHome(state: BattleWorld, unitId: string): boolean {
  const unit = state.units.get(unitId)
  return unit !== undefined && unit.fielded && !unit.downed && (unit.attributes.hp ?? 0) > 0
}

function release(state: BattleWorld, projectile: ProjectileFlight, handedOff: boolean): void {
  if (handedOff || projectile.attack?.leg === undefined) return
  noteBoomerang(state, projectile.sourceId, -1, projectile.epoch)
}

function noteBoomerang(state: BattleWorld, unitId: string, delta: number, epoch: number): void {
  const unit = state.units.get(unitId)
  if (!unit) return
  if (delta < 0 && unit.deployEpoch !== epoch) return
  const record = boomerangOf(state, unitId)
  record.out = Math.max(0, record.out + delta)
  unit.attributes.boomerangsOut = record.out
}
