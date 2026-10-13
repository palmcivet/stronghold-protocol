import { defineComponent } from '#kernel/world/component.js';
import { defineTag, type TagKey } from '#kernel/world/tag.js';
import type { MissionModule } from '#port/module.js';

/** 驭械术师：普攻带未释放的浮游单元。只有带它的单位由官方浮游单元模块附加伤害。 */
export const FUNNEL: TagKey = defineTag('funnel', {
  meaning: 'a caster whose attack carries unreleased drones',
});

/** 浮游单元的伤害标签。 */
export const FUNNEL_DAMAGE_TAG = 'funnel';

/**
 * 浮游单元倍率的缺省值：首次 `init`，同一目标每次加 `delta`，最多 `max`，每次攻击 `drones` 段。
 * 单位的 `script` 里写 `funnelInit`、`funnelDelta`、`funnelMax`、`funnelDrones` 时取单位的值。
 */
export const FUNNEL_DEFAULTS = Object.freeze({
  init: 0.2,
  delta: 0.15,
  max: 1.1,
  drones: 1,
});

interface FunnelRamp {
  targetId: string | null;
  scale: number;
}

/** 递增状态。再部署时清掉，下一次攻击从首次倍率起算。 */
const FUNNEL_RAMP = defineComponent<FunnelRamp>('official-funnel:ramp', {
  create: () => ({ targetId: null, scale: 0 }),
  reset: 'clear',
});

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * 官方浮游单元：带 `funnel` 的单位每次普攻落到目标上时，在攻击本体之后附加浮游单元的伤害。
 * 倍率按目标递增：换目标或再部署时回到首次倍率，同一目标每次加一档，到上限为止。
 */
export const officialFunnelModule: MissionModule = {
  id: 'official-funnel',
  install(ctx) {
    ctx.registerTag(FUNNEL);
    ctx.registerAttackSegment({
      id: 'official-funnel',
      segments(attackerId, targetId, runCtx) {
        if (!runCtx.hasTag(attackerId, FUNNEL)) {
          return null;
        }
        const script = runCtx.script(attackerId);
        const init = numberOr(script.funnelInit, FUNNEL_DEFAULTS.init);
        const delta = numberOr(script.funnelDelta, FUNNEL_DEFAULTS.delta);
        const max = numberOr(script.funnelMax, FUNNEL_DEFAULTS.max);
        const ramp = runCtx.component(FUNNEL_RAMP).ensure(attackerId);
        ramp.scale =
          ramp.targetId === targetId ? Math.min(max, ramp.scale + delta) : init;
        ramp.targetId = targetId;
        return {
          hits: Math.floor(
            numberOr(script.funnelDrones, FUNNEL_DEFAULTS.drones),
          ),
          scale: ramp.scale,
          tags: [FUNNEL_DAMAGE_TAG],
        };
      },
    });
  },
};
