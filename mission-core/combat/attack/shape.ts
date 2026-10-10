import type { AttackDamageKind, AttackShape, ProjectileKind } from "#contract/spec.js"
import type { ContentContext } from "#port/content.js"
import type { BattleRegistry } from "#kernel/registry/index.js"
import { bodyDist } from "#field/body/index.js"
import type { BattleState } from "#battle/state.js"
import { maxHpOf } from "#ability/effect/attribute.js"
import { isFlying, type UnitState } from "#unit/record/index.js"
import { hypot } from "#kernel/math/hypot.js"
import { powi } from "#kernel/math/powi.js"

/** 治疗链在主目标周围找下一名友方的半径，格。 */
export const CHAIN_HEAL_RADIUS = 2.5

/** 回旋物飞回投掷者的速度，格/秒。 */
export const BOOMERANG_RETURN_SPEED = 3.75

/** 投射物种类的飞行速度，格/秒。没写种类时仍用 PROJECTILE_SPEED。 */
export const PROJECTILE_KIND_SPEEDS: Readonly<Record<ProjectileKind, number>> = {
  arrow: 14,
  bolt: 11,
  orb: 10,
  bomb: 8,
  boomerang: 15,
}

/** 哪种飞行在目标离场后仍落到最后坐标。splash 只在这次攻击带了溅射时保留。 */
export const PROJECTILE_RETAIN: Readonly<Record<ProjectileKind, "always" | "splash" | "never">> = {
  arrow: "never",
  bolt: "never",
  orb: "never",
  bomb: "splash",
  boomerang: "always",
}

/** 飞回速度。没有这一项的种类不飞回。 */
export const PROJECTILE_RETURN_SPEEDS: Readonly<Partial<Record<ProjectileKind, number>>> = {
  boomerang: BOOMERANG_RETURN_SPEED,
}

export interface AttackImpact {
  readonly sourceId: string
  readonly targetId: string | null
  readonly x: number
  readonly y: number
  readonly amount: number
  readonly hitCount: number
  readonly shape: AttackShape
}

export interface AttackResolver {
  readonly id: string
  resolve(state: BattleState, registry: BattleRegistry, ctx: ContentContext, impact: AttackImpact): void
}

const resolvers: AttackResolver[] = []

/** 同 id 再登记会换掉原来的结算。顺序是登记顺序。 */
export function registerAttackResolver(resolver: AttackResolver): void {
  const index = resolvers.findIndex((item) => item.id === resolver.id)
  if (index >= 0) resolvers[index] = resolver
  else resolvers.push(resolver)
}

export function resolveAttackImpact(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  impact: AttackImpact,
): void {
  for (const resolver of resolvers) resolver.resolve(state, registry, ctx, impact)
}

export function projectileKindSpeed(kind: ProjectileKind): number {
  return PROJECTILE_KIND_SPEEDS[kind]
}

export function returnSpeedOf(kind: ProjectileKind | undefined): number | undefined {
  if (!kind) return undefined
  return PROJECTILE_RETURN_SPEEDS[kind]
}

export function retainOnMiss(shape: AttackShape): boolean {
  const kind = shape.projectile
  if (!kind) return false
  const rule = PROJECTILE_RETAIN[kind]
  if (rule === "always") return true
  if (rule === "splash") return splashRadius(shape) > 0
  return false
}

export function boomerangsOut(unit: { boomerangsOut: number }): number {
  return unit.boomerangsOut
}

// MARK: strike

function resolveStrike(
  state: BattleState,
  _registry: BattleRegistry,
  ctx: ContentContext,
  impact: AttackImpact,
): void {
  const targetId = impact.targetId
  if (!targetId) return
  const target = state.units.get(targetId)
  if (!present(target)) return
  const hits = Math.max(0, Math.floor(impact.hitCount))
  const amount = scaled(impact.amount * primaryFactor(impact.shape))
  const damage = damageOf(impact.shape)
  for (let hit = 0; hit < hits; hit += 1) {
    const current = state.units.get(targetId)
    if (!present(current)) return
    pay(ctx, impact.sourceId, targetId, amount, damage)
  }
}

// MARK: splash

function resolveSplash(
  state: BattleState,
  _registry: BattleRegistry,
  ctx: ContentContext,
  impact: AttackImpact,
): void {
  const radius = splashRadius(impact.shape)
  if (!(radius > 0)) return
  const splash = impact.shape.splash
  const scale = finite(splash?.scale, 1)
  const attacker = state.units.get(impact.sourceId)
  if (!attacker) return
  const damage = damageOf(impact.shape)
  const amount = scaled(impact.amount * scale)
  for (const unit of around(state, attacker, impact.x, impact.y, radius, "centre")) {
    if (unit.id === impact.targetId) continue
    if (splash?.groundOnly === true && isFlying(unit)) continue
    if (!hitsFlying(attacker) && isFlying(unit)) continue
    pay(ctx, impact.sourceId, unit.id, amount, damage)
  }
}

// MARK: bounce

function resolveBounce(
  state: BattleState,
  _registry: BattleRegistry,
  ctx: ContentContext,
  impact: AttackImpact,
): void {
  const bounce = impact.shape.bounce
  const targetId = impact.targetId
  if (!bounce || !targetId) return
  const start = state.units.get(targetId)
  const attacker = state.units.get(impact.sourceId)
  if (!start || !attacker) return
  const count = Math.max(1, Math.floor(finite(bounce.count, 1)))
  const falloff = finite(bounce.falloff, 0)
  const radius = finite(bounce.radius, 0)
  const pause = finite(bounce.pause, 0)
  const damage = damageOf(impact.shape)
  const seen = new Set<string>([start.id])
  if (pause > 0 && present(start)) ctx.applyStatus(start.id, "sluggish", { duration: pause })
  let prev = start
  for (let jump = 1; jump < count; jump += 1) {
    const next = nearest(state, attacker, prev, radius, seen)
    if (!next) return
    seen.add(next.id)
    pay(ctx, impact.sourceId, next.id, scaled(impact.amount * powi(1 - falloff, jump)), damage)
    if (pause > 0 && present(state.units.get(next.id))) ctx.applyStatus(next.id, "sluggish", { duration: pause })
    prev = next
  }
}

// MARK: chain

function resolveChain(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  impact: AttackImpact,
): void {
  const chain = impact.shape.chain
  const targetId = impact.targetId
  if (!chain || !targetId) return
  const start = state.units.get(targetId)
  const attacker = state.units.get(impact.sourceId)
  if (!start || !attacker) return
  const count = Math.max(1, Math.floor(finite(chain.count, 1)))
  const falloff = finite(chain.falloff, 0)
  const radius = chain.radius !== undefined && chain.radius > 0 ? chain.radius : CHAIN_HEAL_RADIUS
  const seen = new Set<string>([start.id])
  let prev = start
  for (let jump = 1; jump < count; jump += 1) {
    const next = lowestAlly(state, registry, attacker, prev, radius, seen)
    if (!next) return
    seen.add(next.id)
    pay(ctx, impact.sourceId, next.id, scaled(impact.amount * powi(1 - falloff, jump)), "heal")
    prev = next
  }
}

// MARK: pay

function pay(ctx: ContentContext, sourceId: string, targetId: string, amount: number, damage: AttackDamageKind): void {
  if (!(amount > 0)) return
  if (damage === "heal") {
    ctx.heal(targetId, amount, { sourceId })
    return
  }
  ctx.dealDamage({ sourceId, targetId, amount, kind: damage, attack: true })
}

function damageOf(shape: AttackShape): AttackDamageKind {
  return shape.damage ?? "physical"
}

function primaryFactor(shape: AttackShape): number {
  if (!(splashRadius(shape) > 0)) return 1
  if (shape.splash?.othersOnly === true) return 1
  return finite(shape.splash?.scale, 1)
}

function splashRadius(shape: AttackShape): number {
  const radius = shape.splash?.radius
  return radius !== undefined && radius > 0 ? radius : 0
}

function scaled(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) return 0
  return amount
}

function finite(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback
}

function present(unit: UnitState | undefined): unit is UnitState {
  return unit !== undefined && unit.fielded && !unit.downed && !unit.routeHidden && (unit.attributes.hp ?? 0) > 0
}

function hitsFlying(unit: UnitState): boolean {
  return unit.tags.includes("canHitFly") || (unit.attributes.canHitFly ?? 0) > 0
}

function opposing(side: UnitState["side"]): UnitState["side"] {
  return side === "ally" ? "enemy" : "ally"
}

function selectable(unit: UnitState, attacker: UnitState): boolean {
  if (!present(unit) || unit.id === attacker.id) return false
  if (unit.flags.has("untargetable")) return false
  if (unit.flags.has("stealth") && !unit.flags.has("reveal") && !unit.flags.has("stealthOff")) return false
  return unit.side === opposing(attacker.side)
}

function around(
  state: BattleState,
  attacker: UnitState,
  x: number,
  y: number,
  radius: number,
  measure: "centre" | "body",
): UnitState[] {
  const found: UnitState[] = []
  for (const unit of state.units.values()) {
    if (!selectable(unit, attacker)) continue
    const distance = measure === "centre" ? hypot(unit.x - x, unit.y - y) : bodyDist(unit, x, y)
    if (distance <= radius + 1e-9) found.push(unit)
  }
  found.sort((left, right) => left.spawnSeq - right.spawnSeq)
  return found
}

function nearest(
  state: BattleState,
  attacker: UnitState,
  prev: UnitState,
  radius: number,
  seen: ReadonlySet<string>,
): UnitState | null {
  let best: UnitState | null = null
  let bestDist = Infinity
  for (const unit of state.units.values()) {
    if (seen.has(unit.id) || !selectable(unit, attacker)) continue
    if (!hitsFlying(attacker) && isFlying(unit)) continue
    const distance = bodyDist(unit, prev.x, prev.y)
    if (distance > radius + 1e-9) continue
    if (best === null || distance < bestDist - 1e-9 || (Math.abs(distance - bestDist) <= 1e-9 && unit.spawnSeq < best.spawnSeq)) {
      best = unit
      bestDist = distance
    }
  }
  return best
}

function lowestAlly(
  state: BattleState,
  registry: BattleRegistry,
  attacker: UnitState,
  prev: UnitState,
  radius: number,
  seen: ReadonlySet<string>,
): UnitState | null {
  let best: UnitState | null = null
  let bestRatio = Infinity
  for (const unit of state.units.values()) {
    if (seen.has(unit.id) || unit.side !== attacker.side) continue
    if (!present(unit) || unit.flags.has("noHeal")) continue
    if (!injured(unit, registry)) continue
    const distance = hypot(unit.x - prev.x, unit.y - prev.y)
    if (distance > radius + 1e-9) continue
    const ratio = hpRatio(unit, registry)
    if (best === null || ratio < bestRatio - 1e-9 || (Math.abs(ratio - bestRatio) <= 1e-9 && unit.spawnSeq < best.spawnSeq)) {
      best = unit
      bestRatio = ratio
    }
  }
  return best
}

function injured(unit: UnitState, registry: BattleRegistry): boolean {
  return (unit.attributes.hp ?? 0) + 1e-6 < maxHpOf(unit, registry)
}

function hpRatio(unit: UnitState, registry: BattleRegistry): number {
  const max = maxHpOf(unit, registry)
  if (!(max > 0)) return 0
  return (unit.attributes.hp ?? 0) / max
}

registerAttackResolver({ id: "strike", resolve: resolveStrike })
registerAttackResolver({ id: "splash", resolve: resolveSplash })
registerAttackResolver({ id: "bounce", resolve: resolveBounce })
registerAttackResolver({ id: "chain", resolve: resolveChain })
