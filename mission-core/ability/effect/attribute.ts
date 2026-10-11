import { skillModSum } from '#ability/skill/modifier.js';
import { HEALTH_EPSILON } from '#kernel/math/epsilon.js';
import { powi } from '#kernel/math/powi.js';
import type {
  AttributeDefinition,
  AttributeModifier,
  BattleRegistry,
} from '#port/definition.js';
import type { UnitState } from '#unit/record/index.js';

/** 写出一份属性定义。 */
export function defineAttribute(
  id: string,
  options: {
    readonly base: number;
    readonly clamp?: AttributeDefinition['clamp'];
  },
): AttributeDefinition {
  if (!Number.isFinite(options.base)) {
    throw new Error(`attribute base must be finite: ${id}`);
  }
  return {
    id,
    base: options.base,
    ...(options.clamp ? { clamp: { ...options.clamp } } : {}),
  };
}

/** 基础值从 1 开始的乘数属性。 */
export const MULTIPLIER_ATTRIBUTES: readonly AttributeDefinition[] = [
  'dmgDealt',
  'physDealt',
  'artsDealt',
  'dmgTaken',
  'physTaken',
  'artsTaken',
  'trueTaken',
  'elementalTaken',
  'elemTaken',
  'healingDealt',
  'healingTaken',
].map((id) => defineAttribute(id, { base: 1 }));

/** 重量。推拉的受力等级与浮空、缚地减半都读修饰之后的值，不低于 0。 */
export const MASS_LEVEL = defineAttribute('massLevel', {
  base: 0,
  clamp: { min: 0 },
});

export function registerBuiltinAttributes(registry: BattleRegistry): void {
  for (const definition of MULTIPLIER_ATTRIBUTES) {
    registry.registerAttribute(definition);
  }
  registry.registerAttribute(MASS_LEVEL);
}

interface ModSum {
  add: number;
  percent: number;
  mul: number;
  independent: number;
  touched: boolean;
}

/**
 * 属性的当前值：基础值 → 加值 → 百分比 → 直接乘算 → 独立乘区，再按定义夹住。
 * 基础值取单位规格；规格没写时取调用方给的 assumed，再没有时取属性定义（未注册的属性是 0）。
 * 结果不是有限数时退回基础值。
 */
export function attributeOf(
  unit: UnitState,
  registry: BattleRegistry,
  key: string,
  assumed?: number,
): number {
  if (key === 'dodgePhys' || key === 'dodgeArts') {
    return dodgeOf(unit, registry, key);
  }
  const definition = registry.findAttribute(key);
  const fallback = definition?.base ?? 0;
  const base = unit.base[key] ?? assumed ?? fallback;
  const mods = sumMods(unit, registry, key);
  let value =
    (base + mods.add) * (1 + mods.percent) * mods.mul * mods.independent;
  if (!Number.isFinite(value)) {
    value = Number.isFinite(base) ? base : fallback;
  }
  const clamp = definition?.clamp;
  if (clamp?.min !== undefined && value < clamp.min) {
    value = clamp.min;
  }
  if (clamp?.max !== undefined && value > clamp.max) {
    value = clamp.max;
  }
  return value;
}

/** 单位或效果上是否写过这个属性。 */
export function carriesAttribute(
  unit: UnitState,
  registry: BattleRegistry,
  key: string,
): boolean {
  return unit.base[key] !== undefined || sumMods(unit, registry, key).touched;
}

/**
 * 最大生命。hp 与 maxHp 的修饰都算在内，当前生命不参与。
 * 这是最大生命自己的规则：读到的值和上一次结算的不同时，在场单位的当前生命按比例缩放，夹在 0 到新上限之间，不取整。
 * 结算发生在拍内第一次读到最大生命时，没人读时在拍末。
 */
// TRACE: assumed/max-hp-ratio
export function maxHpOf(unit: UnitState, registry: BattleRegistry): number {
  const value = maxHpValue(unit, registry);
  const seen = unit.maxHpSeen;
  unit.maxHpSeen = value;
  if (!(seen > 0) || Math.abs(seen - value) <= HEALTH_EPSILON) {
    return value;
  }
  // 只有在场的单位跟着缩放；不在场、倒下的只记下新上限
  if (!unit.fielded || unit.downed) {
    return value;
  }
  const hp = unit.attributes.hp ?? 0;
  const scaled = hp * (value / seen);
  unit.attributes.hp = Math.min(
    value,
    Math.max(0, Number.isFinite(scaled) ? scaled : value),
  );
  return value;
}

/** 不结算比例的最大生命，给快照这类不能改状态的读法。 */
export function maxHpValue(unit: UnitState, registry: BattleRegistry): number {
  const hp = sumMods(unit, registry, 'hp');
  const max = sumMods(unit, registry, 'maxHp');
  const base = unit.base.maxHp ?? unit.base.hp ?? 1;
  const value =
    (base + hp.add + max.add) *
    (1 + hp.percent + max.percent) *
    hp.mul *
    max.mul *
    hp.independent *
    max.independent;
  const fallback = Math.max(1, unit.base.maxHp ?? unit.base.hp ?? 1);
  if (!Number.isFinite(value) || !(value > 0)) {
    return fallback;
  }
  return Math.max(1, value);
}

function applyLayer(
  sum: ModSum,
  modifier: AttributeModifier,
  stacks: number,
): void {
  sum.touched = true;
  if (modifier.op === 'add') {
    sum.add += modifier.value * stacks;
  } else if (modifier.op === 'percent') {
    sum.percent += modifier.value * stacks;
  } else if (modifier.op === 'mul') {
    sum.mul *= stacks === 1 ? modifier.value : powi(modifier.value, stacks);
  } else {
    sum.independent *=
      stacks === 1 ? modifier.value : powi(modifier.value, stacks);
  }
}

function eachModifier(
  unit: UnitState,
  registry: BattleRegistry,
  visit: (modifier: AttributeModifier, stacks: number) => void,
): void {
  for (const effect of unit.effects) {
    const definition = registry.requireEffect(effect.id);
    for (const modifier of definition.modifiers) {
      visit(modifier, effect.stacks);
    }
    for (const modifier of effect.runtimeModifiers) {
      visit(modifier, effect.stacks);
    }
  }
  for (const timed of unit.modifiers.values()) {
    if (!(timed.remaining > 0)) {
      continue;
    }
    for (const modifier of timed.modifiers) {
      visit(modifier, 1);
    }
  }
}

function sumMods(
  unit: UnitState,
  registry: BattleRegistry,
  key: string,
): ModSum {
  const sum: ModSum = {
    add: 0,
    percent: 0,
    mul: 1,
    independent: 1,
    touched: false,
  };
  eachModifier(unit, registry, (modifier, stacks) => {
    if (modifier.attribute === key) {
      applyLayer(sum, modifier, stacks);
    }
  });
  const skill = skillModSum(unit, key);
  return {
    add: sum.add + skill.add,
    percent: sum.percent + skill.percent,
    mul: sum.mul * skill.mul,
    independent: sum.independent * skill.independent,
    touched: sum.touched || skill.touched,
  };
}

/** 多个闪避来源按独立检定叠：1 − Π(1 − p)^层数。只有一条时保留原值。 */
function dodgeOf(
  unit: UnitState,
  registry: BattleRegistry,
  key: 'dodgePhys' | 'dodgeArts',
): number {
  const rolls: { p: number; stacks: number }[] = [];
  const base = unit.base[key] ?? 0;
  if (base > 0) {
    rolls.push({ p: Math.min(1, base), stacks: 1 });
  }
  eachModifier(unit, registry, (modifier, stacks) => {
    if (
      modifier.attribute !== key ||
      modifier.op !== 'add' ||
      !(modifier.value > 0)
    ) {
      return;
    }
    rolls.push({ p: Math.min(1, modifier.value), stacks });
  });
  if (rolls.length === 0) {
    return 0;
  }
  const first = rolls[0];
  if (rolls.length === 1 && first && first.stacks === 1) {
    return first.p;
  }
  let miss = 1;
  for (const roll of rolls) {
    miss *= powi(1 - roll.p, roll.stacks);
  }
  return Math.min(1, Math.max(0, 1 - miss));
}
