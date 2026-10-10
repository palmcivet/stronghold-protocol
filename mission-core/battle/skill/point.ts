import type { ContentContext, TimerState } from "#port/content.js"
import type { BattleRegistry } from "#battle/registry.js"
import { readTimer, requireUnit, type BattleState } from "#battle/state.js"
import { attributeOf } from "#battle/unit/attribute.js"
import { type SkillInstance, type UnitState } from "#battle/unit/index.js"
import { writeFlags } from "#battle/unit/status/flags.js"
import { reached, TICK } from "#kernel/tick/index.js"
import { AUTO_OP_COOLDOWN, isInstantBody, isTickRule, isTimedBody } from "#battle/skill/constants.js"
import { attackWillHit } from "#battle/unit/attack.js"
import { allyTriggerMet, shouldCast } from "#battle/skill/trigger.js"

export function bindSkillSignals(state: BattleState, registry: BattleRegistry, ctx: ContentContext): void {
  ctx.subscribe("attack-hit", (event) => {
    const unitId = event.data.unitId
    if (typeof unitId !== "string") return
    noteAttack(state, registry, ctx, unitId)
  })
  ctx.subscribe("damaged", (event) => {
    const unitId = event.data.targetId
    if (typeof unitId !== "string") return
    noteHurt(state, registry, ctx, unitId)
  })
}

export function armField(state: BattleState, registry: BattleRegistry, ctx: ContentContext, initial: boolean): void {
  for (const unit of state.units.values()) armUnit(state, registry, ctx, unit, initial)
}

/** 再部署回到场上时，结束还开着的技能，再按入场重新加上初始技力。 */
export function resetSkills(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
): void {
  for (const skill of unit.skills) {
    if (skill.active || skill.pending || skill.effectsApplied) finishSkill(registry, ctx, unit, skill, "redeploy")
  }
  for (const skill of unit.skills) openSkill(state, registry, ctx, unit, skill, false)
  const timer = readTimer(unit, "skill-point")
  if (timer) timer.phase = phaseOf(shown(unit))
  sync(unit)
}

export function armUnit(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
  initial: boolean,
): void {
  if (unit.side !== "ally" || !unit.fielded || unit.downed || unit.skills.length === 0) return
  if (unit.timers.has("skill-point")) return
  beginTimer(state, registry, unit.id, "skill-point")
  beginTimer(state, registry, unit.id, "skill-body")
  for (const skill of unit.skills) openSkill(state, registry, ctx, unit, skill, initial)
  const timer = readTimer(unit, "skill-point")
  if (timer) timer.phase = phaseOf(shown(unit))
  sync(unit)
}

export function advanceSkillBody(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  unitId: string,
): void {
  const unit = requireUnit(state, unitId)
  for (const skill of unit.skills) {
    if (!skill.active) continue
    const moment = { unitId, skillId: skill.id, reason: "tick", dt: TICK }
    skill.onTick?.(moment)
    registry.requireSkillBody(skill.body).onTick?.(unitId, skill.id, ctx)
    registry.requireSkillBody(skill.body).advance(skill, ctx)
    if (!skill.active) finishSkill(registry, ctx, unit, skill, skill.body === "ammo" && skill.ammo <= 0 ? "ammo" : "duration")
  }
  sync(unit)
}

export function advanceSkillPoint(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  unitId: string,
  timer: TimerState,
): void {
  const unit = requireUnit(state, unitId)
  const time = state.tick * TICK
  for (const skill of unit.skills) recoverTime(registry, unit, skill)
  if (canAct(unit)) {
    for (const skill of unit.skills) {
      if (skill.pending && skill.triggerAllies && skill.trigger !== "SKILL_RANGE" && !allyTriggerMet(state, registry, unitId, skill.id)) {
        finishSkill(registry, ctx, unit, skill, "withdrawn")
        addCharge(skill, 1)
      }
      consider(state, registry, ctx, unit, skill, time)
    }
  }
  timer.elapsed = numberOf(timer.elapsed) + 1
  timer.phase = phaseOf(shown(unit))
  sync(unit)
}

export function configureSkill(
  state: BattleState,
  unitId: string,
  skillId: string,
  spec: { body?: string; ammo?: number; duration?: number },
): void {
  const unit = state.units.get(unitId)
  if (!unit) return
  const skill = unit.skills.find((entry) => entry.id === skillId)
  if (!skill) return
  const mutable = skill as { body: string; ammoSpec: number; duration: number }
  if (typeof spec.body === "string" && spec.body.length > 0) mutable.body = spec.body
  if (typeof spec.ammo === "number" && Number.isFinite(spec.ammo)) mutable.ammoSpec = Math.max(0, spec.ammo)
  if (typeof spec.duration === "number" && Number.isFinite(spec.duration)) mutable.duration = Math.max(0, spec.duration)
}

export function readySkill(state: BattleState, unitId: string, skillId: string): void {
  const unit = state.units.get(unitId)
  if (!unit) return
  const skill = unit.skills.find((entry) => entry.id === skillId)
  if (!skill || skill.body === "passive") return
  skill.charges = Math.max(1, skill.maxCharges)
  if (skill.spCost > 0) skill.sp = skill.spCost
}

export function activateSkill(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  unitId: string,
  skillId: string,
  reason: string,
): boolean {
  const unit = requireUnit(state, unitId)
  const skill = requireSkill(unit, skillId)
  if (!canActivate(unit, skill)) return false
  const wasFull = skill.charges >= skill.maxCharges
  skill.charges -= 1
  if (skill.maxCharges === 1 || wasFull) skill.sp = 0
  skill.activations += 1
  if (skill.operation === "MANUAL") skill.opReadyAt = state.tick * TICK + AUTO_OP_COOLDOWN
  const body = registry.requireSkillBody(skill.body)
  body.cast(skill, { duration: skill.duration, ammo: skill.ammoSpec })
  skill.pending = isInstantBody(skill.body) && skill.onHit !== null
  applyEffects(registry, unit, skill)
  const moment = { unitId, skillId, reason, dt: 0 }
  skill.onStart?.(moment)
  body.onCast?.(unitId, skillId, ctx)
  ctx.emit("skill-start", { unitId, skillId, reason })
  if (isInstantBody(skill.body) && !skill.pending) finishSkill(registry, ctx, unit, skill, "instant")
  sync(unit)
  return true
}

export function gainSkillSp(
  state: BattleState,
  unitId: string,
  skillId: string,
  amount: number,
  reason: string,
): number {
  const unit = requireUnit(state, unitId)
  const skill = requireSkill(unit, skillId)
  const gained = gain(unit, skill, amount, reason)
  sync(unit)
  return gained
}

/** 从当前这一层技力里减去。被动技能，以及正在持续的 duration、ammo、toggle，保持原值。 */
export function drainSkillSp(state: BattleState, unitId: string, amount: number): void {
  const unit = state.units.get(unitId)
  if (!unit || !(amount > 0) || !Number.isFinite(amount)) return
  for (const skill of unit.skills) {
    if (skill.body === "passive" || (skill.active && isTimedBody(skill.body))) continue
    if (skill.sp > 0) skill.sp = Math.max(0, skill.sp - amount)
  }
  sync(unit)
}

// MARK: clock

function openSkill(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
  skill: SkillInstance,
  initial: boolean,
): void {
  skill.active = false
  skill.pending = false
  skill.remaining = 0
  skill.ammo = 0
  skill.toggled = false
  skill.sp = 0
  skill.charges = 0
  skill.effectsApplied = false
  skill.opReadyAt =
    initial && skill.operation === "MANUAL" ? state.tick * TICK + AUTO_OP_COOLDOWN : Number.NEGATIVE_INFINITY
  if (skill.body === "passive") {
    const body = registry.requireSkillBody(skill.body)
    body.cast(skill, { duration: skill.duration, ammo: skill.ammoSpec })
    applyEffects(registry, unit, skill)
    skill.onStart?.({ unitId: unit.id, skillId: skill.id, reason: "passive", dt: 0 })
    body.onCast?.(unit.id, skill.id, ctx)
    ctx.emit("skill-start", { unitId: unit.id, skillId: skill.id, reason: "passive" })
    return
  }
  gain(unit, skill, skill.initSp, "init")
  if (skill.spCost <= 0) skill.charges = skill.maxCharges
  if (skill.activateOnDeploy) activateSkill(state, registry, ctx, unit.id, skill.id, "deploy")
}

function consider(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
  skill: SkillInstance,
  time: number,
): void {
  if (!canAsk(unit, skill, time)) return
  if (isTickRule(skill.trigger)) {
    if (shouldCast(state, registry, ctx, unit.id, skill.id)) activateSkill(state, registry, ctx, unit.id, skill.id, skill.trigger)
    return
  }
  if (skill.trigger === "TAKE_DAMAGE" || skill.trigger === "NEVER") return
  const readyRange = shouldCast(state, registry, ctx, unit.id, skill.id)
  if (unit.tags.includes("noAttack")) {
    if (readyRange) activateSkill(state, registry, ctx, unit.id, skill.id, "DEFAULT")
    return
  }
  if (!attackWillHit(state, registry, ctx, unit) || !readyRange) return
  if (skill.triggerAllies && !allyTriggerMet(state, registry, unit.id, skill.id)) return
  activateSkill(state, registry, ctx, unit.id, skill.id, "DEFAULT")
}

function recoverTime(registry: BattleRegistry, unit: UnitState, skill: SkillInstance): void {
  if (skill.spType !== "time" || skill.body === "passive") return
  if (skill.active && isTimedBody(skill.body)) return
  if (unit.flags.has("noSp") || unit.routeHidden || !unit.fielded || unit.downed) return
  if ((unit.attributes.hp ?? 0) <= 0) return
  const rate = attributeOf(unit, registry, "spRecovery")
  if (rate > 0) gain(unit, skill, rate * TICK, "time")
}

function noteAttack(state: BattleState, registry: BattleRegistry, ctx: ContentContext, unitId: string): void {
  const unit = state.units.get(unitId)
  if (!unit) return
  for (const skill of unit.skills) {
    const timed = skill.active && isTimedBody(skill.body)
    const pendingHit = skill.active && skill.pending && isInstantBody(skill.body)
    if (timed && skill.body === "ammo") {
      skill.ammo -= 1
      ctx.emit("ammo-used", { unitId, skillId: skill.id, left: skill.ammo })
      if (skill.ammo <= 0) {
        skill.active = false
        finishSkill(registry, ctx, unit, skill, "ammo")
      }
    } else if (pendingHit) {
      skill.onHit?.({ unitId, skillId: skill.id, reason: "hit", dt: 0 })
      registry.requireSkillBody(skill.body).onHit?.(unitId, skill.id, ctx)
      skill.pending = false
      skill.active = false
      finishSkill(registry, ctx, unit, skill, "instant")
    }
    if (skill.spType === "attack" && !timed && !pendingHit && !(skill.active && isTimedBody(skill.body))) {
      gain(unit, skill, 1, "attack")
    }
  }
  sync(unit)
}

function noteHurt(state: BattleState, registry: BattleRegistry, ctx: ContentContext, unitId: string): void {
  const unit = state.units.get(unitId)
  if (!unit) return
  const time = state.tick * TICK
  for (const skill of unit.skills) {
    if (skill.spType === "hurt" && !(skill.active && isTimedBody(skill.body))) gain(unit, skill, 1, "hurt")
    if (skill.trigger !== "TAKE_DAMAGE" || !canAsk(unit, skill, time)) continue
    skill.hurtPending = true
    const fire = shouldCast(state, registry, ctx, unitId, skill.id)
    skill.hurtPending = false
    if (fire) activateSkill(state, registry, ctx, unitId, skill.id, "TAKE_DAMAGE")
  }
  sync(unit)
}

function finishSkill(
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
  skill: SkillInstance,
  reason: string,
): void {
  if (skill.body === "passive" && reason !== "death") return
  const mark = skill.activations
  skill.active = false
  skill.pending = false
  skill.onEnd?.({ unitId: unit.id, skillId: skill.id, reason, dt: 0 })
  registry.requireSkillBody(skill.body).onEnd?.(unit.id, skill.id, ctx)
  ctx.emit("skill-end", { unitId: unit.id, skillId: skill.id, reason })
  if (!skill.active && skill.activations === mark) {
    skill.effectsApplied = false
    skill.toggled = false
    skill.remaining = 0
    writeFlags(registry, unit)
  }
}

function applyEffects(registry: BattleRegistry, unit: UnitState, skill: SkillInstance): void {
  skill.effectsApplied = true
  writeFlags(registry, unit)
}

// MARK: sp

function gain(unit: UnitState, skill: SkillInstance, amount: number, reason: string): number {
  if (skill.body === "passive" || !(amount > 0) || !Number.isFinite(amount)) return 0
  if (skill.active && isTimedBody(skill.body) && reason !== "init") return 0
  if (reason !== "init" && unit.flags.has("noSp")) return 0
  const cost = skill.spCost
  if (cost <= 0) return 0
  if (skill.charges >= skill.maxCharges && reached(skill.sp, cost)) return 0
  skill.sp += amount
  while (reached(skill.sp, cost) && skill.charges < skill.maxCharges) {
    skill.charges += 1
    if (skill.charges < skill.maxCharges) skill.sp = Math.max(0, skill.sp - cost)
    else skill.sp = cost
  }
  if (skill.charges >= skill.maxCharges) skill.sp = cost
  return amount
}

function addCharge(skill: SkillInstance, count: number): void {
  if (!Number.isFinite(count)) return
  skill.charges = Math.max(0, Math.min(skill.maxCharges, skill.charges + count))
  if (skill.charges >= skill.maxCharges) skill.sp = skill.spCost
}

function canActivate(unit: UnitState, skill: SkillInstance): boolean {
  if (skill.body === "passive" || skill.charges < 1) return false
  if (skill.active && isTimedBody(skill.body)) return false
  if (!unit.fielded || unit.downed) return false
  return (unit.attributes.hp ?? 0) > 0
}

function canAsk(unit: UnitState, skill: SkillInstance, time: number): boolean {
  if (!canAct(unit) || !canActivate(unit, skill)) return false
  if (unit.flags.has("silence")) return false
  if (skill.pending || cooling(skill, time)) return false
  return true
}

function canAct(unit: UnitState): boolean {
  if (!unit.fielded || unit.downed || (unit.attributes.hp ?? 0) <= 0) return false
  return !unit.flags.has("stun") && !unit.flags.has("sleep")
}

function cooling(skill: SkillInstance, time: number): boolean {
  return skill.operation === "MANUAL" && !reached(time, skill.opReadyAt)
}

function shown(unit: UnitState): SkillInstance | undefined {
  return unit.skills.find((skill) => skill.body !== "passive") ?? unit.skills[0]
}

function phaseOf(skill: SkillInstance | undefined): string {
  if (!skill) return "idle"
  if (skill.body === "passive") return "passive"
  if (skill.active && isTimedBody(skill.body)) return "active"
  if (skill.charges >= skill.maxCharges && skill.sp >= skill.spCost) return "full"
  if (skill.charges >= 1) return "ready"
  return "recover"
}

function sync(unit: UnitState): void {
  const timer = unit.timers.get("skill-point")
  if (!timer) return
  const skill = shown(unit)
  timer.sp = skill?.sp ?? 0
  timer.charges = skill?.charges ?? 0
  timer.active = skill?.active ? 1 : 0
  timer.activations = skill?.activations ?? 0
}

function requireSkill(unit: UnitState, skillId: string): SkillInstance {
  const skill = unit.skills.find((item) => item.id === skillId)
  if (!skill) throw new Error(`技能不存在: ${skillId}`)
  return skill
}

function beginTimer(state: BattleState, registry: BattleRegistry, unitId: string, timerId: string): void {
  const definition = registry.requireTimer(timerId)
  const unit = requireUnit(state, unitId)
  if (unit.timers.has(timerId)) return
  unit.timers.set(timerId, definition.create())
}

function numberOf(value: string | number | boolean | undefined): number {
  return typeof value === "number" ? value : 0
}
