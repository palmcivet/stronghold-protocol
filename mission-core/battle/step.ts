import { attributeOf, maxHpOf } from '#ability/effect/attribute.js';
import { armUnit } from '#ability/skill/point.js';
import { attackWillWind } from '#combat/attack/index.js';
import { attackStanding, settleStands } from '#combat/attack/stand.js';
import { clearAttackTargetThisTick } from '#combat/attack/timing.js';
import { advanceProjectiles } from '#combat/projectile/index.js';
import { gridOf } from '#field/grid/index.js';
import { advanceRoute, MOVE_SCALE, routeHidden } from '#field/grid/route.js';
import { advanceShift } from '#field/motion/index.js';
import { settleUnbalance } from '#field/motion/unbalance.js';
import { emit } from '#kernel/event/index.js';
import { TICK } from '#kernel/tick/index.js';
import { readTimer } from '#kernel/timer/index.js';
import { defineResource } from '#kernel/world/resource.js';
import { hasTag } from '#kernel/world/tag.js';
import type { ContentContext } from '#port/context.js';
import type { BattleRegistry } from '#port/definition.js';
import { ATTRACT, CANNOT_ACT, FEAR } from '#port/tag.js';
import { type BattleWorld, placeUnit, unbalanced } from '#unit/record/index.js';
import {
  advanceStartedTimers,
  advanceTimer,
  armListedTimers,
} from '#unit/record/timer.js';

export interface ScheduledCallback {
  tick: number;
  run: (ctx: ContentContext) => void;
}

/** 内容排下的回调，按排入顺序。 */
export const SCHEDULE = defineResource<ScheduledCallback[]>(
  'battle:schedule',
  () => [],
  {
    codec: {
      encode(callbacks) {
        if (callbacks.length > 0) {
          throw new Error(
            `scheduled callbacks are functions and cannot be exported: ${callbacks.length}`,
          );
        }
        return [];
      },
      decode: () => [],
    },
  },
);

/** 已经出场的规格出场项下标。 */
export const SPAWNED = defineResource<Set<number>>(
  'battle:spawned',
  () => new Set(),
  {
    codec: {
      encode: (indices) => [...indices],
      decode: (data) => new Set(data as readonly number[]),
    },
  },
);

export function registerEngineSystems(
  registry: BattleRegistry,
  state: BattleWorld,
): void {
  const schedule = state.resources.access(SCHEDULE);
  const spawns = state.resources.access(SPAWNED);
  registry.registerSystem({
    id: 'engine:schedule',
    slot: 'schedule',
    priority: 0,
    run(runCtx) {
      const scheduled = schedule.ensure();
      const due: ScheduledCallback[] = [];
      for (let index = scheduled.length - 1; index >= 0; index -= 1) {
        const callback = scheduled[index];
        if (!callback || callback.tick !== state.tick) {
          continue;
        }
        due.push(callback);
        scheduled.splice(index, 1);
      }
      due.reverse();
      for (const callback of due) {
        callback.run(runCtx);
      }
    },
  });
  registry.registerSystem({
    id: 'engine:spawn',
    slot: 'spawn',
    priority: 0,
    run(runCtx) {
      const spawned = spawns.ensure();
      state.spec.spawns.forEach((spawn, index) => {
        if (spawn.atTick !== state.tick || spawned.has(index)) {
          return;
        }
        spawned.add(index);
        const unit = placeUnit(state, registry, spawn.unit, true);
        armUnit(state, registry, runCtx, unit, false);
        armListedTimers(state, registry, unit);
        emit(state, 'spawn', { unitId: spawn.unit.id });
      });
    },
  });
  registry.registerSystem({
    id: 'engine:enemy-route',
    slot: 'enemy',
    priority: 0,
    run(runCtx) {
      settleStands(state);
      for (const unit of state.units.values()) {
        settleUnbalance(state, unit);
        // 晕眩等无法行动时恐惧与诱导的位移也停下
        if (hasTag(unit, CANNOT_ACT) && !routeHidden(state, unit.id)) {
          continue;
        }
        if (advanceShift(state, registry, unit, TICK)) {
          continue;
        }
        const speed =
          Math.max(0, attributeOf(unit, registry, 'moveSpeed')) * MOVE_SCALE;
        // 诱导还在时走到诱导点就停在那里等，诱导结束才接着沿路线；没有来源的恐惧没有可达地块，留在原格
        const standing =
          unbalanced(state, unit) ||
          hasTag(unit, ATTRACT) ||
          hasTag(unit, FEAR) ||
          attackStanding(state, unit, () =>
            attackWillWind(state, registry, runCtx, unit),
          );
        advanceRoute(state, gridOf(state), unit, TICK, speed, standing);
      }
    },
  });
  registry.registerSystem({
    id: 'engine:enemy-attack',
    slot: 'enemy',
    priority: 1,
    run(runCtx) {
      for (const unit of state.units.values()) {
        if (unit.side !== 'enemy' || !unit.fielded || unit.downed) {
          continue;
        }
        if (readTimer(unit, 'attack')) {
          advanceTimer(state, registry, runCtx, unit.id, 'attack');
        }
        clearAttackTargetThisTick(unit);
      }
    },
  });
  registry.registerSystem({
    id: 'engine:status-timers',
    slot: 'status',
    priority: 0,
    run(runCtx) {
      advanceStartedTimers(state, registry, runCtx, 'status');
    },
  });
  registry.registerSystem({
    id: 'engine:projectile',
    slot: 'projectile',
    priority: 0,
    run(runCtx) {
      advanceProjectiles(state, registry, runCtx);
    },
  });
  registry.registerSystem({
    id: 'engine:ally-timers',
    slot: 'ally',
    priority: 0,
    run(runCtx) {
      advanceStartedTimers(state, registry, runCtx, 'ally');
      for (const unit of state.units.values()) {
        if (unit.side !== 'ally' || !unit.fielded || unit.downed) {
          continue;
        }
        clearAttackTargetThisTick(unit);
      }
    },
  });
  registry.registerSystem({
    id: 'engine:modifiers',
    slot: 'finale',
    priority: 1000,
    run() {
      for (const unit of state.units.values()) {
        for (const [key, timed] of unit.modifiers) {
          if (timed.remaining === Infinity) {
            continue;
          }
          timed.remaining -= 1;
          if (timed.remaining <= 0) {
            unit.modifiers.delete(key);
          }
        }
      }
    },
  });
  registry.registerSystem({
    id: 'engine:max-hp',
    slot: 'finale',
    priority: 1001,
    run() {
      // 这一拍里没人读过的最大生命变化，在拍末结算比例，快照看到的生命已经跟上
      for (const unit of state.units.values()) {
        maxHpOf(unit, registry);
      }
    },
  });
}
