import type { ContentContext, TimerState } from "#port/content.js"
import type { BattleRegistry } from "#battle/registry.js"
import { requireUnit, type BattleState } from "#battle/state.js"
import { unitsInRange } from "#battle/target/selector.js"
import { attributeOf } from "#battle/unit/attribute.js"
import { interruptEnemyAttack } from "#battle/unit/status/palsy.js"
import type { UnitState } from "#battle/unit/index.js"
import { TICK } from "#tick/index.js"

/** 攻速下限。 */
export const ASPD_MIN = 20
/** 攻速上限。 */
export const ASPD_MAX = 600
/** 没有攻击片段时，命中之后停住的秒数。 */
export const ATTACK_PAUSE = 0.35

const allyQuery = [
  "enemy",
  "fly",
  "stealth",
  "sleep",
  "untargetable",
  "isolated",
  "range",
  "block",
  "priority",
  "taunt",
  "remaining",
  "distance",
  "spawn",
] as const

const enemyQuery = [
  "ally",
  "sleep",
  "stealth",
  "camouflage",
  "liftoff",
  "untargetable",
  "isolated",
  "range",
  "block",
  "priority",
  "taunt",
  "aggro",
  "distance",
] as const

export function advanceAttack(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  unitId: string,
  timer: TimerState,
): void {
  const unit = requireUnit(state, unitId)
  const timing = attackTiming(unit, registry)
  const stunned = clockStopped(unit)
  const held = attackHeld(state, registry, unit)
  if (text(timer, "phase") === "windup") {
    advanceWindup(state, registry, ctx, unit, timer, timing, stunned, held)
    return
  }
  if (text(timer, "phase") === "recovery") {
    advanceRecovery(state, registry, ctx, unit, timer, timing, stunned, held)
    return
  }
  advanceIdle(state, registry, ctx, unit, timer, timing, stunned, held)
}

/** 这一拍的攻击推进会不会打出命中。技力用它决定要不要在命中前释放。 */
export function attackWillHit(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
): boolean {
  const timer = unit.timers.get("attack")
  if (!timer || clockStopped(unit) || attackHeld(state, registry, unit)) return false
  const timing = attackTiming(unit, registry)
  if (!hasTarget(state, registry, ctx, unit)) return false
  if (text(timer, "phase") === "windup") {
    if (number(timer, "lead") === 1) return number(timer, "elapsed") + TICK >= timing.wind - 1e-9
    return number(timer, "cooldown") - TICK <= 1e-9
  }
  if (text(timer, "phase") !== "idle" && text(timer, "phase") !== "recovery") return false
  if (timing.wind > 1e-9 && number(timer, "cooldown") <= 1e-9) return false
  return number(timer, "cooldown") - TICK <= 1e-9
}

// MARK: clock

function advanceWindup(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
  timer: TimerState,
  timing: AttackTiming,
  stunned: boolean,
  held: boolean,
): void {
  if (stunned || held) return
  if (number(timer, "lead") === 1) {
    timer.elapsed = number(timer, "elapsed") + TICK
    if (number(timer, "elapsed") + 1e-9 < timing.wind) return
    strike(state, registry, ctx, unit, timer, timing)
    return
  }
  timer.cooldown = Math.max(0, number(timer, "cooldown") - TICK)
  if (number(timer, "cooldown") > 1e-9) return
  strike(state, registry, ctx, unit, timer, timing)
}

function advanceRecovery(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
  timer: TimerState,
  timing: AttackTiming,
  stunned: boolean,
  held: boolean,
): void {
  const before = number(timer, "cooldown")
  if (!stunned) timer.cooldown = Math.max(0, before - TICK)
  timer.elapsed = number(timer, "elapsed") + TICK
  if (!stunned && !held && readyToSwing(state, registry, ctx, unit, timer, timing)) {
    openSwing(state, registry, ctx, unit, timer, timing, before)
    return
  }
  if (number(timer, "elapsed") + 1e-9 >= number(timer, "rest")) {
    timer.phase = "idle"
    timer.elapsed = 0
  }
}

function advanceIdle(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
  timer: TimerState,
  timing: AttackTiming,
  stunned: boolean,
  held: boolean,
): void {
  const before = number(timer, "cooldown")
  if (!stunned) timer.cooldown = Math.max(0, before - TICK)
  if (stunned || held || !readyToSwing(state, registry, ctx, unit, timer, timing)) return
  openSwing(state, registry, ctx, unit, timer, timing, before)
}

function readyToSwing(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
  timer: TimerState,
  timing: AttackTiming,
): boolean {
  if (number(timer, "cooldown") > timing.wind + 1e-9) return false
  return hasTarget(state, registry, ctx, unit)
}

function openSwing(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
  timer: TimerState,
  timing: AttackTiming,
  before: number,
): void {
  if (number(timer, "cooldown") <= 1e-9 && before > 1e-9) {
    strike(state, registry, ctx, unit, timer, timing)
    return
  }
  if (number(timer, "cooldown") > 1e-9) {
    timer.phase = "windup"
    timer.lead = 0
    timer.elapsed = 0
    return
  }
  if (timing.wind > 1e-9) {
    timer.phase = "windup"
    timer.lead = 1
    timer.elapsed = 0
    return
  }
  strike(state, registry, ctx, unit, timer, timing)
}

function strike(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
  timer: TimerState,
  timing: AttackTiming,
): void {
  const targets = pickTargets(state, registry, ctx, unit)
  if (targets.length === 0) {
    timer.phase = "idle"
    timer.elapsed = 0
    timer.lead = 0
    timer.cooldown = 0
    return
  }
  if (interruptEnemyAttack(state, registry, unit.id)) {
    timer.phase = "recovery"
    timer.elapsed = 0
    timer.lead = 0
    timer.cooldown = timing.interval
    timer.rest = ATTACK_PAUSE
    return
  }
  const amount = Math.max(0, attributeOf(unit, registry, "atk"))
  for (const targetId of targets) deliverHit(state, ctx, unit, targetId, amount)
  ctx.emit("attack-hit", { unitId: unit.id })
  timer.phase = "recovery"
  timer.elapsed = 0
  timer.lead = 0
  timer.cooldown = timing.interval
  timer.rest = timing.rest
}

// MARK: timing

interface AttackTiming {
  readonly interval: number
  readonly wind: number
  readonly rest: number
}

function attackTiming(unit: UnitState, registry: BattleRegistry): AttackTiming {
  const interval = attackInterval(unit, registry)
  const clip = unit.attackClip
  if (!clip || !(clip.duration > 0)) return { interval, wind: 0, rest: ATTACK_PAUSE }
  const speed = interval > 0 && interval < clip.duration ? clip.duration / interval : 1
  const hit = Number.isFinite(clip.hit) ? Math.min(clip.duration, Math.max(0, clip.hit)) : clip.duration / 2
  return { interval, wind: hit / speed, rest: Math.max(0, (clip.duration - hit) / speed) }
}

function attackInterval(unit: UnitState, registry: BattleRegistry): number {
  const aspd = clamp(aspdOf(unit, registry), ASPD_MIN, ASPD_MAX)
  const batBase = unit.base.bat
  const bat = (batBase !== undefined && batBase > 0 ? batBase : 1) * Math.max(0.1, 1 + attributeOf(unit, registry, "batPct"))
  return (bat * 100) / aspd
}

function aspdOf(unit: UnitState, registry: BattleRegistry): number {
  const assumed = unit.base.aspd === undefined
  if (assumed) unit.base.aspd = 100
  const value = attributeOf(unit, registry, "aspd")
  if (assumed) delete unit.base.aspd
  return Number.isFinite(value) ? value : 100
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

// MARK: target

function hasTarget(state: BattleState, registry: BattleRegistry, ctx: ContentContext, unit: UnitState): boolean {
  return pickTargets(state, registry, ctx, unit).length > 0
}

function pickTargets(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
): readonly string[] {
  const query = unit.side === "enemy" ? enemyQuery : allyQuery
  return unitsInRange(state, registry, ctx, unit.id, query).slice(0, 1)
}

function attackHeld(state: BattleState, registry: BattleRegistry, unit: UnitState): boolean {
  for (const status of unit.statuses) {
    if (status.dropped) continue
    if (registry.requireStatus(status.id).cancels.includes("attack")) return true
  }
  return false
}

function clockStopped(unit: UnitState): boolean {
  if (!unit.fielded || unit.downed || unit.routeHidden || (unit.attributes.hp ?? 0) <= 0) return true
  return unit.flags.has("stun") || unit.flags.has("sleep")
}

/** 有弹道时改为生成投射物。这一阶段远程仍在命中时直接结算。 */
function deliverHit(state: BattleState, ctx: ContentContext, attacker: UnitState, targetId: string, amount: number): void {
  if (launchInstead(attacker)) {
    spawnAttackProjectile(ctx, attacker, targetId, amount, state.tick)
    return
  }
  ctx.dealDamage({ sourceId: attacker.id, targetId, amount, kind: "physical" })
}

function launchInstead(_attacker: UnitState): boolean {
  return false
}

function spawnAttackProjectile(
  ctx: ContentContext,
  attacker: UnitState,
  targetId: string,
  amount: number,
  tick: number,
): void {
  ctx.launchProjectile({
    id: `${attacker.id}:${targetId}:${tick}`,
    sourceId: attacker.id,
    targetId,
    amount,
  })
}

function number(timer: TimerState, key: string): number {
  const value = timer[key]
  return typeof value === "number" ? value : 0
}

function text(timer: TimerState, key: string): string {
  const value = timer[key]
  return typeof value === "string" ? value : "idle"
}
