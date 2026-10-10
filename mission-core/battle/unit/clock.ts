import type { ContentContext, TimerDefinition, TimerState } from "#port/content.js"
import type { BattleRegistry } from "#battle/registry.js"
import { requireUnit, type BattleState } from "#battle/state.js"
import { attackHasTarget } from "#battle/unit/aim.js"
import { attributeOf } from "#battle/unit/attribute.js"
import type { UnitState } from "#battle/unit/index.js"
import { reached, READY_EPSILON, TICK } from "#kernel/tick/index.js"

/** 充能计时器 id。 */
export const CHARGE_TIMER = "charge"
/** 弹药计时器 id。 */
export const AMMO_TIMER = "ammo"
/** 回旋持有计时器 id。 */
export const BOOMERANG_TIMER = "boomerang"

/** 充能层数上限。属性 `times` 缺省时用它。 */
export const CHARGE_CAP = 3
/** 弹药上限。属性 `ammoMax` 缺省时用它。 */
export const AMMO_CAP = 8
/** 弹药伤害倍率。属性 `atk_scale` 缺省时用它。 */
export const AMMO_SCALE = 1.2
/** 独立计时的速度。属性 `timerRate` 缺省时用它。 */
export const TIMER_RATE = 1

/** 充能上限属性。 */
export const CHARGE_CAP_ATTRIBUTE = "times"
/** 弹药上限属性。 */
export const AMMO_CAP_ATTRIBUTE = "ammoMax"
/** 弹药伤害倍率属性。 */
export const AMMO_SCALE_ATTRIBUTE = "atk_scale"
/** 独立计时速度属性。状态修饰这个键即可加快或放慢，不用写进某一种计时。 */
export const TIMER_RATE_ATTRIBUTE = "timerRate"
/** 仍在飞行的回旋数量。攻击形状写入，持有计时读取。 */
export const BOOMERANGS_OUT_ATTRIBUTE = "boomerangsOut"

const ASPD_MIN = 20
const ASPD_MAX = 600
const RELOAD_GAP = 1

export interface AttackTiming {
  canAttack: boolean
  hitCount: number
  damageScale: number
}

type Opener = (state: BattleState, registry: BattleRegistry, unit: UnitState, timer: TimerState) => void

const openers = new Map<string, Opener>()
const targetMarks = new WeakMap<UnitState, boolean>()

export function registerIndependentTimers(registry: BattleRegistry, state: BattleState): void {
  registry.registerTimer(chargeTimer(state, registry))
  registry.registerTimer(ammoTimer(state, registry))
  registry.registerTimer(boomerangTimer(state, registry))
}

export function openIndependentTimer(
  state: BattleState,
  registry: BattleRegistry,
  unit: UnitState,
  timerId: string,
  timer: TimerState,
): void {
  openers.get(timerId)?.(state, registry, unit, timer)
}

export function bindIndependentTimers(state: BattleState, registry: BattleRegistry, ctx: ContentContext): void {
  ctx.subscribe("deploy", (event) => {
    const unitId = event.data.unitId
    if (typeof unitId !== "string") return
    const unit = state.units.get(unitId)
    if (!unit) return
    refillAmmo(registry, unit)
    resetBoomerang(unit)
  })
}

/** 这一拍攻击有没有目标。显式写入优先于范围查询，攻击前摇和充能读的是同一份。 */
export function setAttackTargetThisTick(unit: UnitState, present: boolean): void {
  targetMarks.set(unit, present)
}

export function peekAttackTargetThisTick(unit: UnitState): boolean | undefined {
  if (!targetMarks.has(unit)) return undefined
  return targetMarks.get(unit)
}

export function clearAttackTargetThisTick(unit: UnitState): void {
  targetMarks.delete(unit)
}

/** 读攻击要用的持有状态。不消耗充能和弹药。传入 registry 时 atk_scale 走属性汇总。 */
export function readAttackTiming(unit: UnitState, registry?: BattleRegistry): AttackTiming {
  const ammo = unit.timers.get(AMMO_TIMER)
  const ammoLeft = ammo ? number(ammo, "ammo") : null
  const out = boomerangsOut(unit)
  const canAttack = !(ammoLeft !== null && ammoLeft <= READY_EPSILON) && !(out > READY_EPSILON)
  const charge = unit.timers.get(CHARGE_TIMER)
  const stored = charge ? number(charge, "stored") : 0
  const spending = ammoLeft !== null && ammoLeft > READY_EPSILON
  return {
    canAttack,
    hitCount: charge ? 1 + Math.max(0, Math.floor(stored)) : 1,
    damageScale: spending ? ammoScale(unit, registry) : 1,
  }
}

/** 一次出手之后清掉充能，并消耗一发弹药。 */
export function consumeAttackTiming(unit: UnitState): void {
  const charge = unit.timers.get(CHARGE_TIMER)
  if (charge) charge.stored = 0
  const ammo = unit.timers.get(AMMO_TIMER)
  if (!ammo) return
  ammo.ammo = Math.max(0, number(ammo, "ammo") - 1)
  ammo.spent = 1
}

/** 本拍要推进的游戏秒数。`timerRate` 缺省为 1，状态可以修饰它。 */
export function independentDt(unit: UnitState, registry: BattleRegistry): number {
  return TICK * timerRate(unit, registry)
}

// MARK: charge

function chargeTimer(state: BattleState, registry: BattleRegistry): TimerDefinition {
  return {
    id: CHARGE_TIMER,
    slot: "ally",
    sides: ["ally"],
    create: () => ({ stored: 0, elapsed: 0 }),
    advance(timer, unitId, ctx) {
      advanceCharge(state, registry, ctx, requireUnit(state, unitId), timer)
    },
    cancel(timer) {
      timer.stored = 0
      timer.elapsed = 0
    },
    view(timer) {
      return { stored: number(timer, "stored"), elapsed: number(timer, "elapsed") }
    },
  }
}

function advanceCharge(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
  timer: TimerState,
): void {
  const marked = takeTargetMark(unit)
  if (!canAct(unit) || attackCooling(unit)) return
  const hasTarget = marked !== undefined ? marked : attackHasTarget(state, registry, ctx, unit)
  if (hasTarget) return
  const cap = chargeCap(unit, registry)
  let stored = number(timer, "stored")
  if (stored >= cap) return
  let elapsed = number(timer, "elapsed") + independentDt(unit, registry)
  const interval = attackInterval(unit, registry)
  if (interval > 0) {
    while (stored < cap && reached(elapsed, interval)) {
      elapsed -= interval
      stored += 1
    }
  }
  timer.stored = stored
  timer.elapsed = elapsed
}

// MARK: ammo

function ammoTimer(state: BattleState, registry: BattleRegistry): TimerDefinition {
  openers.set(AMMO_TIMER, (_state, openRegistry, unit, timer) => {
    timer.ammo = ammoCap(unit, openRegistry)
    timer.elapsed = 0
    timer.attackAt = 0
    timer.spent = 0
  })
  return {
    id: AMMO_TIMER,
    slot: "ally",
    sides: ["ally"],
    create: () => ({ ammo: AMMO_CAP, elapsed: 0, attackAt: 0, spent: 0 }),
    advance(timer, unitId) {
      advanceAmmo(state, registry, requireUnit(state, unitId), timer)
    },
    cancel(timer) {
      timer.elapsed = 0
      timer.spent = 0
    },
    view(timer) {
      return { ammo: number(timer, "ammo"), elapsed: number(timer, "elapsed") }
    },
  }
}

function advanceAmmo(state: BattleState, registry: BattleRegistry, unit: UnitState, timer: TimerState): void {
  const now = state.tick * TICK
  if (number(timer, "spent") === 1) {
    timer.attackAt = now
    timer.spent = 0
    timer.elapsed = 0
  }
  const cap = ammoCap(unit, registry)
  let ammo = Math.min(cap, number(timer, "ammo"))
  const sinceAttack = now - number(timer, "attackAt")
  const reloading = onField(unit) && reached(sinceAttack, RELOAD_GAP) && ammo < cap
  if (!reloading) {
    timer.ammo = ammo
    timer.elapsed = 0
    return
  }
  let elapsed = number(timer, "elapsed") + independentDt(unit, registry)
  while (ammo < cap && reached(elapsed, RELOAD_GAP)) {
    elapsed -= RELOAD_GAP
    ammo += 1
  }
  timer.ammo = ammo
  timer.elapsed = elapsed
}

function refillAmmo(registry: BattleRegistry, unit: UnitState): void {
  const timer = unit.timers.get(AMMO_TIMER)
  if (!timer) return
  timer.ammo = ammoCap(unit, registry)
  timer.elapsed = 0
}

// MARK: boomerang

function boomerangTimer(state: BattleState, registry: BattleRegistry): TimerDefinition {
  return {
    id: BOOMERANG_TIMER,
    slot: "ally",
    sides: ["ally"],
    create: () => ({ out: 0, elapsed: 0 }),
    advance(timer, unitId) {
      const unit = requireUnit(state, unitId)
      timer.elapsed = number(timer, "elapsed") + independentDt(unit, registry)
      timer.out = boomerangsOut(unit)
    },
    cancel(timer) {
      timer.elapsed = 0
    },
    view(timer) {
      return { out: number(timer, "out"), elapsed: number(timer, "elapsed") }
    },
  }
}

function resetBoomerang(unit: UnitState): void {
  if (!unit.timers.has(BOOMERANG_TIMER)) return
  unit.boomerangEpoch += 1
  unit.boomerangsOut = 0
  unit.attributes[BOOMERANGS_OUT_ATTRIBUTE] = 0
  if (unit.base[BOOMERANGS_OUT_ATTRIBUTE] !== undefined) unit.base[BOOMERANGS_OUT_ATTRIBUTE] = 0
  const timer = unit.timers.get(BOOMERANG_TIMER)
  if (timer) timer.out = 0
}

function boomerangsOut(unit: UnitState): number {
  const field = typeof unit.boomerangsOut === "number" && Number.isFinite(unit.boomerangsOut) ? unit.boomerangsOut : 0
  const listed = unit.attributes[BOOMERANGS_OUT_ATTRIBUTE]
  const fromAttribute = typeof listed === "number" && Number.isFinite(listed) ? listed : 0
  return Math.max(0, field, fromAttribute)
}

// MARK: attack view

function takeTargetMark(unit: UnitState): boolean | undefined {
  return peekAttackTargetThisTick(unit)
}

function canAct(unit: UnitState): boolean {
  if (!unit.fielded || unit.downed || unit.routeHidden) return false
  if ((unit.attributes.hp ?? 0) <= 0) return false
  return !unit.flags.has("stun") && !unit.flags.has("sleep")
}

function onField(unit: UnitState): boolean {
  return unit.fielded && !unit.downed && (unit.attributes.hp ?? 0) > 0
}

function attackCooling(unit: UnitState): boolean {
  const timer = unit.timers.get("attack")
  if (!timer) return false
  if (text(timer, "phase") === "windup") return true
  return number(timer, "cooldown") > READY_EPSILON
}

function attackInterval(unit: UnitState, registry: BattleRegistry): number {
  const assumed = unit.base.aspd === undefined
  if (assumed) unit.base.aspd = 100
  const aspd = clamp(attributeOf(unit, registry, "aspd"), ASPD_MIN, ASPD_MAX)
  if (assumed) delete unit.base.aspd
  const batBase = unit.base.bat
  const bat = (batBase !== undefined && batBase > 0 ? batBase : 1) * Math.max(0.1, 1 + attributeOf(unit, registry, "batPct"))
  if (!(aspd > 0)) return 0
  return (bat * 100) / aspd
}

function chargeCap(unit: UnitState, registry: BattleRegistry): number {
  return Math.max(0, Math.floor(resolved(unit, registry, CHARGE_CAP_ATTRIBUTE, CHARGE_CAP)))
}

function ammoCap(unit: UnitState, registry: BattleRegistry): number {
  return Math.max(0, Math.floor(resolved(unit, registry, AMMO_CAP_ATTRIBUTE, AMMO_CAP)))
}

function ammoScale(unit: UnitState, registry?: BattleRegistry): number {
  if (!registry) {
    const listed = unit.attributes[AMMO_SCALE_ATTRIBUTE]
    if (typeof listed !== "number" || !Number.isFinite(listed)) return AMMO_SCALE
    return listed
  }
  return resolved(unit, registry, AMMO_SCALE_ATTRIBUTE, AMMO_SCALE)
}

function timerRate(unit: UnitState, registry: BattleRegistry): number {
  const value = resolved(unit, registry, TIMER_RATE_ATTRIBUTE, TIMER_RATE)
  if (!Number.isFinite(value) || value < 0) return TIMER_RATE
  return value
}

function resolved(unit: UnitState, registry: BattleRegistry, key: string, fallback: number): number {
  const assumed = unit.base[key] === undefined
  if (assumed) unit.base[key] = fallback
  const value = attributeOf(unit, registry, key)
  if (assumed) delete unit.base[key]
  if (!Number.isFinite(value)) return fallback
  return value
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function number(timer: TimerState, key: string): number {
  const value = timer[key]
  return typeof value === "number" ? value : 0
}

function text(timer: TimerState, key: string): string {
  const value = timer[key]
  return typeof value === "string" ? value : ""
}
