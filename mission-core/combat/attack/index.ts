import { attributeOf } from '#ability/effect/attribute.js';
import { interruptEnemyAttack } from '#ability/effect/palsy.js';
import { attackProfileOf } from '#combat/attack/profile.js';
import {
  projectileKindSpeed,
  resolveAttackImpact,
  retainOnMiss,
  returnSpeedOf,
} from '#combat/attack/shape.js';
import { standAfterStrike } from '#combat/attack/stand.js';
import { offerSubstitute } from '#combat/attack/substitute.js';
import {
  consumeAttackTiming,
  peekAttackTargetThisTick,
  readAttackTiming,
  registerIndependentTimers,
} from '#combat/attack/timing.js';
import { attackTargetIds } from '#combat/target/aim.js';
import type { AttackEvent } from '#contract/event.js';
import { routeHidden } from '#field/grid/route.js';
import { countdown, READY_EPSILON, reached, TICK } from '#kernel/tick/index.js';
import {
  type TimerState,
  timerNumber,
  timerText,
} from '#kernel/timer/index.js';
import { hasTag } from '#kernel/world/tag.js';
import type { ContentContext } from '#port/context.js';
import type {
  BattleRegistry,
  ContentTimerDefinition,
} from '#port/definition.js';
import { CANNOT_ACT, TREMBLE } from '#port/tag.js';
import { blockerOf } from '#unit/block/hold.js';
import {
  activeSkillSlot,
  type BattleWorld,
  requireUnit,
  type UnitState,
  unbalanced,
} from '#unit/record/index.js';

/** 攻速下限。 */
export const ASPD_MIN = 20;
/** 攻速上限。 */
export const ASPD_MAX = 600;
/** 没有攻击片段时，命中之后停住的秒数。 */
export const ATTACK_PAUSE = 0.35;

/** 普攻计时器与充能、弹药、回旋物的计时器。 */
export function registerAttackTimers(
  registry: BattleRegistry,
  state: BattleWorld,
): void {
  registry.registerTimer(attackTimer(state, registry));
  registerIndependentTimers(registry, state);
}

function attackTimer(
  state: BattleWorld,
  registry: BattleRegistry,
): ContentTimerDefinition {
  return {
    id: 'attack',
    slot: 'ally',
    create: () => ({
      phase: 'idle',
      elapsed: 0,
      cooldown: 0,
      rest: 0,
      lead: 0,
    }),
    advance(timer, unitId, ctx) {
      advanceAttack(state, registry, ctx, unitId, timer);
    },
    cancel(timer) {
      timer.phase = 'idle';
      timer.elapsed = 0;
      timer.lead = 0;
      delete timer.substitute;
    },
    view(timer) {
      return {
        phase: timerText(timer, 'phase', 'idle'),
        elapsed: timerNumber(timer, 'elapsed'),
      };
    },
  };
}

export function advanceAttack(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unitId: string,
  timer: TimerState,
): void {
  const unit = requireUnit(state, unitId);
  const timing = attackTiming(state, unit, registry);
  const stunned = clockStopped(state, unit);
  const held = attackHeld(state, registry, unit);
  if (text(timer, 'phase') === 'windup') {
    advanceWindup(state, registry, ctx, unit, timer, timing, stunned, held);
    return;
  }
  if (text(timer, 'phase') === 'recovery') {
    advanceRecovery(state, registry, ctx, unit, timer, timing, stunned, held);
    return;
  }
  advanceIdle(state, registry, ctx, unit, timer, timing, stunned, held);
}

/** 这一拍的攻击推进会不会打出命中。技力用它决定要不要在命中前释放。 */
export function attackWillHit(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
): boolean {
  const timer = unit.timers.get('attack');
  if (
    !timer ||
    clockStopped(state, unit) ||
    attackHeld(state, registry, unit)
  ) {
    return false;
  }
  if (!readAttackTiming(state, unit, registry).canAttack) {
    return false;
  }
  const timing = attackTiming(state, unit, registry);
  if (!hasTarget(state, registry, ctx, unit)) {
    return false;
  }
  if (text(timer, 'phase') === 'windup') {
    if (number(timer, 'lead') === 1) {
      return reached(number(timer, 'elapsed') + TICK, timing.wind);
    }
    return countdown(number(timer, 'cooldown'), TICK) === 0;
  }
  if (text(timer, 'phase') !== 'idle' && text(timer, 'phase') !== 'recovery') {
    return false;
  }
  if (
    timing.wind > READY_EPSILON &&
    number(timer, 'cooldown') <= READY_EPSILON
  ) {
    return false;
  }
  return countdown(number(timer, 'cooldown'), TICK) === 0;
}

/**
 * 这一拍的攻击推进会不会从冷却进入前摇。移动先于出手结算，站定用它让敌人在进入前摇的这一拍就停下。
 */
export function attackWillWind(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
): boolean {
  const timer = unit.timers.get('attack');
  if (!timer) {
    return false;
  }
  const phase = text(timer, 'phase');
  if (phase !== 'idle' && phase !== 'recovery') {
    return false;
  }
  if (
    clockStopped(state, unit) ||
    attackHeld(state, registry, unit) ||
    targetDenied(unit)
  ) {
    return false;
  }
  const timing = attackTiming(state, unit, registry);
  if (!(timing.wind > READY_EPSILON)) {
    return false;
  }
  if (!reached(timing.wind, countdown(number(timer, 'cooldown'), TICK))) {
    return false;
  }
  if (!readAttackTiming(state, unit, registry).canAttack) {
    return false;
  }
  return hasTarget(state, registry, ctx, unit);
}

// MARK: clock

function advanceWindup(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
  timer: TimerState,
  timing: AttackTiming,
  stunned: boolean,
  held: boolean,
): void {
  if (stunned || held) {
    return;
  }
  if (targetDenied(unit)) {
    timer.phase = 'idle';
    timer.elapsed = 0;
    timer.lead = 0;
    return;
  }
  if (number(timer, 'lead') === 1) {
    timer.elapsed = number(timer, 'elapsed') + TICK;
    if (!reached(number(timer, 'elapsed'), timing.wind)) {
      return;
    }
    strike(state, registry, ctx, unit, timer, timing);
    return;
  }
  timer.cooldown = countdown(number(timer, 'cooldown'), TICK);
  if (number(timer, 'cooldown') > 0) {
    return;
  }
  strike(state, registry, ctx, unit, timer, timing);
}

function advanceRecovery(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
  timer: TimerState,
  timing: AttackTiming,
  stunned: boolean,
  held: boolean,
): void {
  const before = number(timer, 'cooldown');
  if (!stunned) {
    timer.cooldown = countdown(before, TICK);
  }
  timer.elapsed = number(timer, 'elapsed') + TICK;
  if (
    !stunned &&
    !held &&
    readyToSwing(state, registry, ctx, unit, timer, timing)
  ) {
    openSwing(state, registry, ctx, unit, timer, timing, before);
    return;
  }
  if (reached(number(timer, 'elapsed'), number(timer, 'rest'))) {
    timer.phase = 'idle';
    timer.elapsed = 0;
  }
}

function advanceIdle(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
  timer: TimerState,
  timing: AttackTiming,
  stunned: boolean,
  held: boolean,
): void {
  const before = number(timer, 'cooldown');
  if (!stunned) {
    timer.cooldown = countdown(before, TICK);
  }
  if (
    stunned ||
    held ||
    !readyToSwing(state, registry, ctx, unit, timer, timing)
  ) {
    return;
  }
  openSwing(state, registry, ctx, unit, timer, timing, before);
}

function readyToSwing(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
  timer: TimerState,
  timing: AttackTiming,
): boolean {
  if (
    targetDenied(unit) ||
    !readAttackTiming(state, unit, registry).canAttack
  ) {
    return false;
  }
  if (!reached(timing.wind, number(timer, 'cooldown'))) {
    return false;
  }
  if (hasTarget(state, registry, ctx, unit)) {
    delete timer.substitute;
    return true;
  }
  // 没有目标：问登记的替代（例如替换这一下普攻、治疗半血友方的技能），它给出的单位作为这一下的目标
  const substitute = offerSubstitute(registry, ctx, unit.id);
  if (substitute.length === 0) {
    delete timer.substitute;
    return false;
  }
  timer.substitute = JSON.stringify(substitute);
  return true;
}

/** 这一下由替代给出的目标，还在场的；没有替代时是空表。 */
function substituteTargets(
  state: BattleWorld,
  timer: TimerState,
): readonly string[] {
  const raw = timer.substitute;
  if (typeof raw !== 'string' || raw.length === 0) {
    return [];
  }
  const ids = JSON.parse(raw) as readonly string[];
  return ids.filter((id) => {
    const target = state.units.get(id);
    return (
      target?.fielded &&
      !target.downed &&
      !target.removed &&
      (target.attributes.hp ?? 0) > 0
    );
  });
}

function openSwing(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
  timer: TimerState,
  timing: AttackTiming,
  before: number,
): void {
  // 这一拍之前冷却就已经在前摇以内（没有目标、被打断或刚解除控制）：从头走完整个前摇
  if (timing.wind > READY_EPSILON && before < timing.wind - READY_EPSILON) {
    timer.phase = 'windup';
    timer.lead = 1;
    timer.elapsed = 0;
    return;
  }
  if (number(timer, 'cooldown') <= READY_EPSILON && before > READY_EPSILON) {
    strike(state, registry, ctx, unit, timer, timing);
    return;
  }
  if (number(timer, 'cooldown') > READY_EPSILON) {
    timer.phase = 'windup';
    timer.lead = 0;
    timer.elapsed = 0;
    return;
  }
  if (timing.wind > READY_EPSILON) {
    timer.phase = 'windup';
    timer.lead = 1;
    timer.elapsed = 0;
    return;
  }
  strike(state, registry, ctx, unit, timer, timing);
}

function strike(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
  timer: TimerState,
  timing: AttackTiming,
): void {
  const swing = readAttackTiming(state, unit, registry);
  if (!swing.canAttack) {
    timer.phase = 'idle';
    timer.elapsed = 0;
    timer.lead = 0;
    timer.cooldown = 0;
    return;
  }
  const found = attackTargetIds(state, registry, ctx, unit);
  const replaced = found.length === 0;
  const targets = replaced ? substituteTargets(state, timer) : found;
  delete timer.substitute;
  if (targets.length === 0) {
    timer.phase = 'idle';
    timer.elapsed = 0;
    timer.lead = 0;
    timer.cooldown = 0;
    return;
  }
  if (interruptEnemyAttack(state, registry, unit.id)) {
    timer.phase = 'recovery';
    timer.elapsed = 0;
    timer.lead = 0;
    timer.cooldown = timing.interval;
    timer.rest = ATTACK_PAUSE;
    if (!blockerOf(state, unit.id) && unit.attackRange.length > 0) {
      standAfterStrike(state, unit, ATTACK_PAUSE);
    }
    return;
  }
  const slot = activeSkillSlot(unit);
  const notice: AttackEvent = {
    unitId: unit.id,
    targetIds: targets,
    cancel: false,
    ...(slot !== undefined ? { skillSlot: slot } : {}),
    ...(replaced ? { substitute: true as const } : {}),
  };
  ctx.intercept('attack', notice);
  if (notice.cancel === true) {
    timer.phase = 'recovery';
    timer.elapsed = 0;
    timer.lead = 0;
    timer.cooldown = timing.interval;
    timer.rest = timing.rest;
    return;
  }
  if (replaced) {
    consumeAttackTiming(unit);
    ctx.emit('attack-hit', {
      unitId: unit.id,
      ...(notice.noAmmo === true ? { noAmmo: true as const } : {}),
      ...(slot !== undefined ? { skillSlot: slot } : {}),
      substitute: true,
      targetIds: targets,
    });
  } else {
    release(state, registry, ctx, unit, targets, notice.noAmmo === true);
  }
  timer.phase = 'recovery';
  timer.elapsed = 0;
  timer.lead = 0;
  timer.cooldown = timing.interval;
  timer.rest = timing.rest;
  standAfterStrike(state, unit, timing.rest);
}

/** 打出这一下：按攻击片段的倍率与段数结算每个目标，用掉片段，送出 attack-hit。 */
function release(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
  targets: readonly string[],
  noAmmo: boolean,
): void {
  const swing = readAttackTiming(state, unit, registry);
  const slot = activeSkillSlot(unit);
  const scale = Number.isFinite(swing.damageScale) ? swing.damageScale : 1;
  const amount = Math.max(0, attributeOf(unit, registry, 'atk') * scale);
  const hitCount = Number.isFinite(swing.hitCount)
    ? Math.max(0, Math.floor(swing.hitCount))
    : 1;
  for (const targetId of targets) {
    deliver(state, registry, ctx, unit, targetId, amount, hitCount, slot);
  }
  consumeAttackTiming(unit);
  ctx.emit('attack-hit', {
    unitId: unit.id,
    ...(noAmmo ? { noAmmo: true as const } : {}),
    ...(slot !== undefined ? { skillSlot: slot } : {}),
  });
}

/**
 * 内容要求的额外一下普攻：不看也不动攻击计时，目标缺省按普攻选。照样经过 attack 拦截、算一次攻击；
 * noAmmo 时不用掉弹药。打出去返回 true；单位不在场、没有目标或被取消时返回 false。
 */
export function forceAttack(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unitId: string,
  targetIds: readonly string[] | null,
  noAmmo: boolean,
): boolean {
  const unit = state.units.get(unitId);
  if (
    !unit?.fielded ||
    unit.downed ||
    unit.removed ||
    (unit.attributes.hp ?? 0) <= 0
  ) {
    return false;
  }
  const targets = (
    targetIds ?? attackTargetIds(state, registry, ctx, unit)
  ).filter((id) => {
    const target = state.units.get(id);
    return target?.fielded && !target.downed && !target.removed;
  });
  if (targets.length === 0) {
    return false;
  }
  const slot = activeSkillSlot(unit);
  const notice: AttackEvent = {
    unitId,
    targetIds: targets,
    cancel: false,
    ...(noAmmo ? { noAmmo: true } : {}),
    ...(slot !== undefined ? { skillSlot: slot } : {}),
  };
  ctx.intercept('attack', notice);
  if (notice.cancel === true) {
    return false;
  }
  release(state, registry, ctx, unit, targets, notice.noAmmo === true);
  return true;
}

// MARK: timing

interface AttackTiming {
  readonly interval: number;
  readonly wind: number;
  readonly rest: number;
}

function attackTiming(
  state: BattleWorld,
  unit: UnitState,
  registry: BattleRegistry,
): AttackTiming {
  const interval = attackInterval(unit, registry);
  const clip = attackProfileOf(state, unit.id).clip;
  if (!clip || !(clip.duration > 0)) {
    return { interval, wind: 0, rest: ATTACK_PAUSE };
  }
  const speed =
    interval > 0 && interval < clip.duration ? clip.duration / interval : 1;
  const hit = Number.isFinite(clip.hit)
    ? Math.min(clip.duration, Math.max(0, clip.hit))
    : clip.duration / 2;
  return {
    interval,
    wind: hit / speed,
    rest: Math.max(0, (clip.duration - hit) / speed),
  };
}

function attackInterval(unit: UnitState, registry: BattleRegistry): number {
  const aspd = clamp(aspdOf(unit, registry), ASPD_MIN, ASPD_MAX);
  const batBase = unit.base.bat;
  const bat =
    (batBase !== undefined && batBase > 0 ? batBase : 1) *
    Math.max(0.1, 1 + attributeOf(unit, registry, 'batPct'));
  return (bat * 100) / aspd;
}

function aspdOf(unit: UnitState, registry: BattleRegistry): number {
  const value = attributeOf(unit, registry, 'aspd', 100);
  return Number.isFinite(value) ? value : 100;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

// MARK: target

function hasTarget(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unit: UnitState,
): boolean {
  return attackTargetIds(state, registry, ctx, unit).length > 0;
}

function targetDenied(unit: UnitState): boolean {
  return peekAttackTargetThisTick(unit) === false;
}

function attackHeld(
  state: BattleWorld,
  registry: BattleRegistry,
  unit: UnitState,
): boolean {
  if (hasTag(unit, TREMBLE) && blockerOf(state, unit.id)) {
    return true;
  }
  for (const status of unit.effects) {
    if (status.dropped) {
      continue;
    }
    if (registry.requireEffect(status.id).cancels.includes('attack')) {
      return true;
    }
  }
  return false;
}

/** 打断前摇中的一下（失衡）：回到冷却，之后重新走完整个前摇。已经出手的不撤回。 */
export function cutSwing(unit: UnitState): void {
  const timer = unit.timers.get('attack');
  if (!timer || text(timer, 'phase') !== 'windup') {
    return;
  }
  timer.phase = 'idle';
  timer.elapsed = 0;
  timer.lead = 0;
}

function clockStopped(state: BattleWorld, unit: UnitState): boolean {
  if (
    !unit.fielded ||
    unit.downed ||
    (unit.attributes.hp ?? 0) <= 0 ||
    routeHidden(state, unit.id)
  ) {
    return true;
  }
  // 失衡时不开始普攻，前摇中的一下被打断，冷却停下
  return hasTag(unit, CANNOT_ACT) || unbalanced(state, unit);
}

function deliver(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  attacker: UnitState,
  targetId: string,
  amount: number,
  hitCount: number,
  skillSlot: number | undefined,
): void {
  const shape = attackProfileOf(state, attacker.id).shape;
  const slot = skillSlot !== undefined ? { skillSlot } : {};
  if (shape?.projectile && shape.lockRange !== true) {
    const back = returnSpeedOf(shape.projectile);
    ctx.launchProjectile({
      id: `${attacker.id}:${targetId}:${state.tick}`,
      sourceId: attacker.id,
      targetId,
      amount,
      speed: projectileKindSpeed(shape.projectile),
      retain: retainOnMiss(shape),
      ...(back !== undefined
        ? {
            attack: { shape, hitCount, leg: 'out', returnSpeed: back, ...slot },
          }
        : { attack: { shape, hitCount, ...slot } }),
    });
    return;
  }
  const target = state.units.get(targetId);
  resolveAttackImpact(state, registry, ctx, {
    sourceId: attacker.id,
    targetId,
    x: target?.x ?? attacker.x,
    y: target?.y ?? attacker.y,
    amount,
    hitCount,
    shape: shape ?? {},
    ...slot,
  });
}

function number(timer: TimerState, key: string): number {
  const value = timer[key];
  return typeof value === 'number' ? value : 0;
}

function text(timer: TimerState, key: string): string {
  const value = timer[key];
  return typeof value === 'string' ? value : 'idle';
}
