import { defineEffect } from '#ability/effect/index.js';
import type { Direction } from '#contract/spec.js';
import { directionVector, oppositeDirection } from '#field/direction/index.js';
import { defineTerrain, terrainSource } from '#field/terrain/index.js';
import { defineZone } from '#field/zone/index.js';
import { defineExtensible } from '#kernel/registry/extensible.js';
import { TICK } from '#kernel/tick/index.js';
import { defineTag, type TagKey } from '#kernel/world/tag.js';
import type { ContentContext } from '#port/context.js';
import type { AttributeModifier } from '#port/definition.js';
import type { MissionModule } from '#port/module.js';

/** 官方地形缺省数值。关卡 notes 的 special 块里写了的项盖过这些。 */
export const OFFICIAL_TERRAIN_DEFAULTS = Object.freeze({
  mire: Object.freeze({
    intervalSec: 1,
    aspdPerStack: -0.05,
    moveMulPerStack: -0.05,
    maxStacks: 10,
    heavyWeight: 3,
  }),
  deepsea: Object.freeze({ damage: 40, attackSpeed: -0.6, moveSpeed: 0.6 }),
  infection: Object.freeze({
    damage: 70,
    atk: 0.2,
    attackSpeed: 20,
    duration: 300,
  }),
});

/** 官方地形的可扩展键。内容模块拿它 replace 或 wrap。 */
export const OFFICIAL_TERRAINS = Object.freeze({
  mire: defineExtensible('mire', { version: 1, contract: 'terrain' }),
  smog: defineExtensible('smog', { version: 1, contract: 'terrain' }),
  deepsea: defineExtensible('deepsea', { version: 1, contract: 'terrain' }),
  infection: defineExtensible('infection', {
    version: 1,
    contract: 'terrain',
  }),
  airflow: defineExtensible('airflow', { version: 1, contract: 'zone' }),
});

/** 风机：带这个标签的装置按朝向吹出气流，作用格是它的攻击范围。 */
export const BLOWER: TagKey = defineTag('blower', {
  meaning: 'blows airflow along its facing over its attack range',
});

/** 重量达到 heavyWeight 的敌人每次陷入沼泽得到的层数。 */
const MIRE_HEAVY_LAYERS = 2;

const INFECTION_EFFECT = 'infection';

type Block = Readonly<Record<string, unknown>>;

function block(value: unknown): Block {
  return value !== null && typeof value === 'object' ? (value as Block) : {};
}

/** notes.special 里这种地形的参数块。 */
function special(ctx: ContentContext, key: string): Block {
  return block(block(ctx.field().special)[key]);
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** 攻速写成小数时按百分点换算。 */
function aspdOf(value: number): number {
  return Math.abs(value) < 1 ? value * 100 : value;
}

interface MireParams {
  readonly intervalTicks: number;
  readonly aspdPer: number;
  readonly movePer: number;
  readonly max: number;
  readonly heavyWeight: number;
}

function mireParams(ctx: ContentContext): MireParams {
  const m = special(ctx, 'mire');
  const d = OFFICIAL_TERRAIN_DEFAULTS.mire;
  const interval = num(m.intervalSec, d.intervalSec);
  return {
    intervalTicks: Math.max(
      1,
      Math.round((interval > 0 ? interval : d.intervalSec) / TICK),
    ),
    aspdPer: aspdOf(num(m.aspdPerStack, d.aspdPerStack)),
    movePer: num(m.moveMulPerStack, d.moveMulPerStack),
    max: Math.max(1, Math.floor(num(m.maxStacks, d.maxStacks))),
    heavyWeight: num(m.heavyWeight, d.heavyWeight),
  };
}

/** 停留第 count 拍时的沼泽层数：进入那一拍触发一次，之后每个间隔一次。 */
function mireLayers(params: MireParams, per: number, count: number): number {
  const triggers = 1 + Math.floor((count - 1) / params.intervalTicks);
  return Math.min(params.max, per * triggers);
}

function mireStay(unitId: string, ctx: ContentContext, count: number): void {
  const params = mireParams(ctx);
  const enemy = ctx.unit(unitId)?.side === 'enemy';
  const per =
    enemy && ctx.attribute(unitId, 'massLevel') >= params.heavyWeight
      ? MIRE_HEAVY_LAYERS
      : 1;
  const layers = mireLayers(params, per, count);
  if (count > 1 && layers === mireLayers(params, per, count - 1)) {
    return;
  }
  const modifiers: AttributeModifier[] = [
    { attribute: 'aspd', op: 'add', value: params.aspdPer * layers },
  ];
  if (enemy) {
    modifiers.push({
      attribute: 'moveSpeed',
      op: 'mul',
      value: Math.max(0, 1 + params.movePer * layers),
    });
  }
  ctx.setModifier(unitId, terrainSource('mire'), modifiers);
}

function deepseaParams(ctx: ContentContext): {
  readonly damage: number;
  readonly aspd: number;
  readonly moveMul: number;
} {
  const bb = block(special(ctx, 'deepsea').bb);
  const d = OFFICIAL_TERRAIN_DEFAULTS.deepsea;
  return {
    damage: num(bb['sea_drown[enemy].damage'], d.damage),
    aspd: aspdOf(num(bb['sea_drown[enemy].attack_speed'], d.attackSpeed)),
    moveMul: num(bb['sea_drown[enemy].move_speed'], d.moveSpeed),
  };
}

function infectionParams(ctx: ContentContext): {
  readonly damage: number;
  readonly atk: number;
  readonly aspd: number;
  readonly duration: number;
} {
  const bb = block(special(ctx, 'infection').bb);
  const d = OFFICIAL_TERRAIN_DEFAULTS.infection;
  const duration = num(bb.duration, d.duration);
  return {
    damage: num(bb.damage, d.damage),
    atk: num(bb.atk, d.atk),
    aspd: aspdOf(num(bb.attack_speed, d.attackSpeed)),
    duration: duration > 0 ? duration : d.duration,
  };
}

/** 地形造成的无来源真实伤害，不能闪避。 */
function terrainDamage(
  ctx: ContentContext,
  unitId: string,
  amount: number,
  extra: { readonly tags: readonly string[]; readonly noSp?: boolean },
): void {
  if (!(amount > 0) || ctx.unit(unitId)?.alive !== true) {
    return;
  }
  ctx.dealDamage({
    sourceId: '',
    targetId: unitId,
    amount,
    kind: 'true',
    canDodge: false,
    sourceless: true,
    ...extra,
  });
}

type Relation = 'equal' | 'opposite' | 'vertical';

/** 干员朝向与气流方向：相同、相反或垂直。 */
function facingRelation(unit: Direction, flow: Direction): Relation {
  if (unit === flow) {
    return 'equal';
  }
  return unit === oppositeDirection(flow) ? 'opposite' : 'vertical';
}

/** 位移与气流方向的夹角余弦大于 0.7 为顺风、小于 -0.7 为逆风，其余垂直。按平方比较，不开方。 */
function movingRelation(dx: number, dy: number, flow: Direction): Relation {
  const [row, col] = directionVector(flow);
  const dot = dx * col + dy * row;
  const far = dot * dot > 0.49 * (dx * dx + dy * dy);
  if (far && dot > 0) {
    return 'equal';
  }
  return far && dot < 0 ? 'opposite' : 'vertical';
}

/** 风机的黑板：装置自己的 script，没有时用 notes.special.blower.bb。 */
function blowerBoard(ctx: ContentContext, deviceId: string): Block {
  const own = ctx.script(deviceId);
  return Object.keys(own).length > 0 ? own : block(special(ctx, 'blower').bb);
}

const AIRFLOW_KEY = terrainSource('airflow');

const airflowZone = defineZone('airflow', {
  source: BLOWER,
  onStay(unitId, ctx, visit) {
    const unit = ctx.unit(unitId);
    if (!unit) {
      return;
    }
    const board = blowerBoard(ctx, visit.deviceId);
    if (unit.side === 'ally') {
      const atk =
        unit.motion === 'FLY'
          ? 0
          : num(
              board[
                `blower_s_character[${facingRelation(unit.facing, visit.facing)}].atk`
              ],
              0,
            );
      if (atk === 0) {
        ctx.clearModifier(unitId, AIRFLOW_KEY);
      } else {
        ctx.setModifier(unitId, AIRFLOW_KEY, [
          { attribute: 'atk', op: 'percent', value: atk },
        ]);
      }
      return;
    }
    const moved = visit.moved;
    if (moved && moved.dx * moved.dx + moved.dy * moved.dy <= 1e-12) {
      // 这一拍没动（出手停顿、被阻挡）：保持上一次的推力
      return;
    }
    const relation = moved
      ? movingRelation(moved.dx, moved.dy, visit.facing)
      : 'vertical';
    let mul =
      relation === 'vertical'
        ? 1
        : 1 + num(board[`blower_s_enemy[${relation}].move_speed`], 0);
    if (!(mul >= 0)) {
      mul = 0;
    }
    if (mul === 1) {
      ctx.clearModifier(unitId, AIRFLOW_KEY);
    } else {
      ctx.setModifier(unitId, AIRFLOW_KEY, [
        { attribute: 'moveSpeed', op: 'mul', value: mul },
      ]);
    }
  },
  onLeave: (unitId, ctx) => ctx.clearModifier(unitId, AIRFLOW_KEY),
});

/**
 * 官方地形：沼泽 mire、排气格栅 smog、深水区 deepsea、活性源石 infection，以及风机气流 airflow（装置作用区）。
 * 每种地形 id 都标成可扩展，内容模块可以 replace 或 wrap。数值读关卡 notes 的 special 块，没写的用缺省。
 */
export const officialTerrainModule: MissionModule = {
  id: 'official-terrain',
  install(ctx) {
    ctx.registerEffect(
      defineEffect(INFECTION_EFFECT, {
        period: 1,
        onApply(unitId, _stacks, run) {
          const params = infectionParams(run);
          run.setModifier(unitId, terrainSource('infection'), [
            { attribute: 'atk', op: 'percent', value: params.atk },
            { attribute: 'aspd', op: 'add', value: params.aspd },
          ]);
        },
        onTick(unitId, _stacks, run) {
          terrainDamage(run, unitId, infectionParams(run).damage, {
            tags: ['terrain'],
          });
        },
        onRemove(unitId, run) {
          run.clearModifier(unitId, terrainSource('infection'));
        },
      }),
    );
    const terrains = [
      defineTerrain('mire', {
        period: TICK,
        onStay: mireStay,
        onLeave: (unitId, run) =>
          run.clearModifier(unitId, terrainSource('mire')),
      }),
      defineTerrain('smog', {
        effect: 'stealth',
        affects: { sides: ['ally'] },
      }),
      defineTerrain('deepsea', {
        affects: { sides: ['enemy'] },
        tieBreak: 1,
        period: 1,
        onEnter(unitId, run) {
          const params = deepseaParams(run);
          run.setModifier(unitId, terrainSource('deepsea'), [
            { attribute: 'aspd', op: 'add', value: params.aspd },
            { attribute: 'moveSpeed', op: 'mul', value: params.moveMul },
          ]);
        },
        onStay(unitId, run, count) {
          if (count > 1) {
            terrainDamage(run, unitId, deepseaParams(run).damage, {
              tags: ['dot', 'periodic', 'deepsea'],
              noSp: true,
            });
          }
        },
        onLeave: (unitId, run) =>
          run.clearModifier(unitId, terrainSource('deepsea')),
      }),
      defineTerrain('infection', {
        effect: INFECTION_EFFECT,
        linger: (run) => infectionParams(run).duration,
      }),
    ];
    for (const terrain of terrains) {
      ctx.registerTerrain(terrain);
    }
    ctx.registerTag(BLOWER);
    ctx.registerZone(airflowZone);
    for (const key of Object.values(OFFICIAL_TERRAINS)) {
      ctx.markExtensible(key);
    }
  },
};
