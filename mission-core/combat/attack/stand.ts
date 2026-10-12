import { routeHidden } from '#field/grid/route.js';
import { READY_EPSILON, TICK } from '#kernel/tick/index.js';
import { timerText } from '#kernel/timer/index.js';
import {
  type ComponentStore,
  defineComponent,
} from '#kernel/world/component.js';
import { hasTag } from '#kernel/world/tag.js';
import { ATTACK_MOVES, CANNOT_ACT, FEAR } from '#port/tag.js';
import { blockerOf } from '#unit/block/hold.js';
import type { BattleWorld, UnitState } from '#unit/record/index.js';

/**
 * 敌人出手后的站定：命中后站到攻击片段放完（until，拍数，可以带小数）。cutAt 是站定最近一次被打断的拍，
 * 只给画面用。held 表示正在恐惧：站定照记，但不站、不显示。
 */
export interface AttackStand {
  until: number | null;
  cutAt: number | null;
  held: boolean;
}

/** 画面用的站定视图：站到哪一拍（没有站定时是 null），最近一次打断在哪一拍。 */
export interface AttackStandView {
  readonly until: number | null;
  readonly cutAt: number | null;
}

export const ATTACK_STAND = defineComponent<AttackStand>('attack:stand', {
  create: () => ({ until: null, cutAt: null, held: false }),
  view: (stand): AttackStandView => ({
    until: stand.held ? null : stand.until,
    cutAt: stand.cutAt,
  }),
});

/** 命中之后站 seconds 秒。不停止移动的攻击者不站。 */
export function standAfterStrike(
  state: BattleWorld,
  unit: UnitState,
  seconds: number,
): void {
  if (unit.side !== 'enemy' || hasTag(unit, ATTACK_MOVES) || !(seconds > 0)) {
    return;
  }
  const stand = state.components.access(ATTACK_STAND).ensure(unit.id);
  stand.until = state.tick + seconds / TICK;
}

/** 打断还没站完的站定，记下打断的拍。没有站定时什么都不做。 */
export function cutStand(state: BattleWorld, unitId: string): void {
  const stand = state.components.access(ATTACK_STAND).get(unitId);
  if (!stand || stand.until === null) {
    return;
  }
  if (stand.until > state.tick + READY_EPSILON) {
    stand.cutAt = state.tick;
  }
  stand.until = null;
}

/**
 * 每拍在移动之前整理站定：晕眩、冻结、沉睡、浮空等无法行动，路线消失，倒下或离场时打断；
 * 恐惧时记一次打断但保留站定；站完的清掉。
 */
export function settleStands(state: BattleWorld): void {
  const table = state.components.access(ATTACK_STAND);
  for (const unit of state.units.values()) {
    const stand = table.get(unit.id);
    if (!stand) {
      continue;
    }
    if (stand.until !== null && stand.until <= state.tick + READY_EPSILON) {
      stand.until = null;
    }
    if (
      !unit.fielded ||
      unit.downed ||
      unit.removed ||
      routeHidden(state, unit.id) ||
      hasTag(unit, CANNOT_ACT)
    ) {
      cutStand(state, unit.id);
      stand.held = false;
      continue;
    }
    stand.held = hasTag(unit, FEAR);
    if (stand.held && stand.until !== null) {
      stand.cutAt = state.tick;
    }
  }
}

/**
 * 这一拍敌人是不是站着出手：命中后的站定还没完（恐惧时不站），或者没被阻挡、攻击范围不为空、
 * 不是不停止移动的攻击者，正处在出手前摇或这一拍就要进入前摇（winding）。
 * 站着时路线上的行走停下，等待、消失、出现照常推进。
 */
export function attackStanding(
  world: { readonly components: ComponentStore },
  unit: UnitState,
  winding: () => boolean,
): boolean {
  const stand = world.components.access(ATTACK_STAND).get(unit.id);
  if (stand && stand.until !== null && !stand.held) {
    return true;
  }
  if (
    unit.side !== 'enemy' ||
    hasTag(unit, ATTACK_MOVES) ||
    hasTag(unit, CANNOT_ACT) ||
    hasTag(unit, FEAR)
  ) {
    return false;
  }
  if (unit.attackRange.length === 0 || blockerOf(world, unit.id)) {
    return false;
  }
  const timer = unit.timers.get('attack');
  if (timer !== undefined && timerText(timer, 'phase', 'idle') === 'windup') {
    return true;
  }
  return winding();
}
