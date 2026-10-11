import { registerBuiltinAttributes } from '#ability/effect/attribute.js';
import { registerEffectCatalog } from '#ability/effect/catalog.js';
import {
  registerBuiltinConditions,
  registerConditionSystem,
} from '#ability/effect/condition.js';
import { registerEffectTimer } from '#ability/effect/index.js';
import { registerBuiltinStackings } from '#ability/effect/stacking.js';
import {
  BUILTIN_SKILL_BODIES,
  registerBuiltinSkillBodies,
} from '#ability/skill/body.js';
import {
  normalizeTrigger,
  SKILL_ATTRIBUTES,
} from '#ability/skill/constants.js';
import {
  armField,
  bindSkillSignals,
  registerSkillTimers,
} from '#ability/skill/point.js';
import { registerBuiltinSkillTriggers } from '#ability/skill/trigger.js';
import { createContext, RESULT } from '#battle/context.js';
import { applyInputs } from '#battle/input.js';
import { createRegistry } from '#battle/registry.js';
import { readSnapshot } from '#battle/snapshot.js';
import { registerEngineSystems } from '#battle/step.js';
import { registerAttackTimers } from '#combat/attack/index.js';
import { bindIndependentTimers } from '#combat/attack/timing.js';
import { registerDamageSteps } from '#combat/damage/index.js';
import {
  BUILTIN_ELEMENTS,
  registerBuiltinElements,
} from '#combat/element/index.js';
import { registerBuiltinSelectors } from '#combat/target/catalog.js';
import type { BattleEvent } from '#contract/event.js';
import type { BattleInput } from '#contract/input.js';
import { PHASE_SLOTS } from '#contract/phase.js';
import type { BattleLedger, BattleResult } from '#contract/result.js';
import type { BattleSnapshot } from '#contract/snapshot.js';
import type { BattleSpec, UnitSpec } from '#contract/spec.js';
import { registerBuiltinShifts } from '#field/motion/index.js';
import { drainEvents, emit } from '#kernel/event/index.js';
import { canonicalJson, hashText } from '#kernel/hash/index.js';
import { UnknownRegistrationError } from '#kernel/registry/error.js';
import { defineExtensible } from '#kernel/registry/extensible.js';
import { counterTimer, elapsedTimer } from '#kernel/timer/index.js';
import {
  exportWorld,
  importWorld,
  type WorldArchive,
} from '#kernel/world/archive.js';
import { createWorld } from '#kernel/world/index.js';
import { bindLedger, readLedger } from '#ledger/index.js';
import type { BattleRegistry, SystemOrderEntry } from '#port/definition.js';
import type { MissionModule, Registration } from '#port/module.js';
import { CORE_TAGS } from '#port/tag.js';
import { openBattle } from '#unit/deploy/strategy.js';
import { unitCodec } from '#unit/record/archive.js';
import {
  addUnit,
  type BattleWorld,
  checkSpecTags,
  grantSpecTags,
  markDeployed,
  type UnitState,
} from '#unit/record/index.js';
import { armListedTimers } from '#unit/record/timer.js';

export interface Battle {
  /**
   * 推进一拍。inputs 在这一拍开始时按提交顺序生效，送出 input 或 input-refused；世界里不记输入，日志由调用方保存。
   * 推进中（系统或订阅者里）再调用会报错，保证每拍的顺序确定。
   */
  step(inputs?: readonly BattleInput[]): void;
  snapshot(): BattleSnapshot;
  drainEvents(): readonly BattleEvent[];
  result(): BattleResult;
  /** 按单位 owner 记的账。 */
  ledger(): BattleLedger;
  /** 全部系统的执行顺序。 */
  systemOrder(): readonly SystemOrderEntry[];
  /** 世界的纯数据快照。用同样的规格与模块调用 createBattle(spec, modules, archive) 从这里继续。 */
  export(): WorldArchive;
  /** 内容摘要：规格、按安装顺序的模块 id 与版本、可扩展 id 的替换链。16 位十六进制。 */
  contentHash(): string;
}

/** 建一场战斗。给了 archive 时先照常建好，再把世界换成 archive 的状态，待取走的事件清空。 */
export function createBattle(
  spec: BattleSpec,
  modules: readonly MissionModule[],
  archive?: WorldArchive,
): Battle {
  const state = createState(spec);
  const registry = createRegistry();
  for (const key of CORE_TAGS) {
    registry.registerTag(key);
  }
  registerBuiltinSkillBodies(registry);
  registerBuiltinSkillTriggers(state, registry);
  registerBuiltinSelectors(state, registry);
  registerSkillTimers(registry, state);
  registry.registerTimer(counterTimer('trait', 'ally', 'count'));
  registry.registerTimer(elapsedTimer('redeploy', 'redeploy'));
  registerAttackTimers(registry, state);
  registerBuiltinAttributes(registry);
  for (const definition of SKILL_ATTRIBUTES) {
    registry.registerAttribute(definition);
  }
  registerBuiltinStackings(registry);
  registerBuiltinConditions(registry);
  registerEffectTimer(registry, state);
  registerEffectCatalog(state, registry);
  registerBuiltinElements(state, registry);
  registerDamageSteps(state, registry);
  markBuiltinExtensible(registry);
  const ctx = createContext(state, registry);
  registerBuiltinShifts(registry);
  registerEngineSystems(registry, state);
  registerConditionSystem(registry, state);
  const installed = installModules(spec, modules, ctx, registry);
  registry.systemOrder();
  validateUnits(spec, registry);
  for (const unit of spec.units) {
    grantSpecTags(registry, requireSpecUnit(state, unit), unit);
  }
  if (spec.deployStrategy !== null) {
    registry.requireDeployStrategy(spec.deployStrategy);
  }
  bindSkillSignals(state, registry, ctx);
  for (const unit of state.units.values()) {
    armListedTimers(state, registry, unit);
  }
  bindIndependentTimers(state, registry, ctx);
  bindLedger(state, ctx);
  openBattle(state, registry, ctx);
  if (spec.deployStrategy === null) {
    for (const unit of state.units.values()) {
      if (!unit.fielded) {
        continue;
      }
      markDeployed(unit);
      emit(state, 'deploy', { unitId: unit.id });
    }
  }
  armField(state, registry, ctx, true);
  const result = state.resources.access(RESULT);
  const units = unitCodec(registry);
  const hash = hashText(
    canonicalJson(
      {
        spec,
        modules: installed.map((module) => ({
          id: module.id,
          version: module.version ?? '',
        })),
        extensions: registry.extensions(),
      },
      'content',
    ),
  );
  if (archive) {
    importWorld(state, archive, units);
  }
  let stepping = false;
  return {
    step(inputs) {
      if (stepping) {
        throw new Error('step called while the battle is stepping');
      }
      stepping = true;
      try {
        if (inputs && inputs.length > 0) {
          applyInputs(ctx, inputs);
        }
        for (const slot of PHASE_SLOTS) {
          for (const system of registry.systemsIn(slot)) {
            system.run(ctx);
          }
        }
        state.tick += 1;
      } finally {
        stepping = false;
      }
    },
    snapshot() {
      return readSnapshot(state, registry);
    },
    drainEvents() {
      return drainEvents(state.events);
    },
    result() {
      const current = result.ensure();
      return { finished: current.finished, winner: current.winner };
    },
    ledger() {
      return readLedger(state);
    },
    systemOrder() {
      return registry.systemOrder();
    },
    export() {
      return exportWorld(state, units);
    },
    contentHash() {
      return hash;
    },
  };
}

/** 建出世界，放入开场单位。规格标签等模块装好后再授予。 */
function createState(spec: BattleSpec): BattleWorld {
  const state: BattleWorld = createWorld(spec);
  const fielded = spec.deployStrategy === null;
  for (const unit of spec.units) {
    addUnit(state, unit, fielded);
  }
  return state;
}

function requireSpecUnit(state: BattleWorld, spec: UnitSpec): UnitState {
  const unit = state.units.get(spec.id);
  if (!unit) {
    throw new Error(`单位不存在: ${spec.id}`);
  }
  return unit;
}

function installModules(
  spec: BattleSpec,
  modules: readonly MissionModule[],
  ctx: Registration,
  registry: BattleRegistry,
): readonly MissionModule[] {
  const catalog = new Map<string, MissionModule>();
  for (const module of modules) {
    if (catalog.has(module.id)) {
      throw new Error(`模块重复: ${module.id}`);
    }
    catalog.set(module.id, module);
  }
  const selected = new Set(spec.modules);
  for (const id of spec.modules) {
    if (!catalog.has(id)) {
      throw new UnknownRegistrationError('module', id);
    }
  }
  const ordered: MissionModule[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) {
      return;
    }
    if (visiting.has(id)) {
      throw new Error(`模块循环: ${id}`);
    }
    const module = catalog.get(id);
    if (!module) {
      throw new UnknownRegistrationError('module', id);
    }
    visiting.add(id);
    for (const dependency of module.dependsOn ?? []) {
      if (!selected.has(dependency)) {
        throw new UnknownRegistrationError('module', dependency);
      }
      visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
    ordered.push(module);
  };
  for (const id of spec.modules) {
    visit(id);
  }
  for (const module of ordered) {
    registry.installing(module.id);
    module.install(ctx);
  }
  registry.installing('core');
  return ordered;
}

/** 内置技能体、伤害步骤与元素标成可扩展。技能触发、选择器、叠加策略与条件在注册时标记。 */
function markBuiltinExtensible(registry: BattleRegistry): void {
  for (const id of BUILTIN_ELEMENTS) {
    registry.markExtensible(
      defineExtensible(id, { version: 1, contract: 'element' }),
    );
  }
  for (const id of BUILTIN_SKILL_BODIES) {
    registry.markExtensible(
      defineExtensible(id, { version: 1, contract: 'skill-body' }),
    );
  }
  for (const step of registry.damageSteps()) {
    registry.markExtensible(
      defineExtensible(step.id, { version: 1, contract: 'damage-step' }),
    );
  }
}

/**
 * 规格必须是纯数据，规格上的 id 都要已注册：技能体、技能触发、技能钩子、标签、计时器、条件与效果。
 * 缺失时报 UnknownRegistrationError。
 */
function validateUnits(spec: BattleSpec, registry: BattleRegistry): void {
  canonicalJson(spec, 'spec');
  const units: UnitSpec[] = [
    ...spec.units,
    ...spec.spawns.map((spawn) => spawn.unit),
  ];
  for (const unit of units) {
    const owner = `unit spec ${unit.id}`;
    for (const skill of unit.skills) {
      if (!registry.hasSkillBody(skill.body)) {
        throw new UnknownRegistrationError('skill-body', skill.body, owner);
      }
      const trigger = normalizeTrigger(skill.trigger);
      if (!registry.hasSkillTrigger(trigger)) {
        throw new UnknownRegistrationError('skill-trigger', trigger, owner);
      }
      for (const hookId of Object.values(skill.hooks ?? {})) {
        if (hookId !== undefined) {
          registry.requireSkillHook(hookId);
        }
      }
    }
    for (const timerId of unit.timers ?? []) {
      registry.requireTimer(timerId);
    }
    for (const selectorId of unit.attackShape?.filters ?? []) {
      registry.requireSelector(selectorId);
    }
    if (unit.attackShape?.healThrough !== undefined) {
      registry.requireSelector(unit.attackShape.healThrough);
    }
    for (const entry of unit.conditionalEffects ?? []) {
      registry.requireCondition(entry.condition);
      registry.requireEffect(entry.effect);
    }
    checkSpecTags(registry, unit);
  }
}
