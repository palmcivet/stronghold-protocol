import { attributeOf, maxHpOf } from '#ability/effect/attribute.js';
import {
  applyEffect as giveEffect,
  removeEffect as takeEffect,
} from '#ability/effect/index.js';
import {
  activateSkill,
  readySkill as fillSkill,
  gainSkillSp,
  configureSkill as writeSkill,
} from '#ability/skill/point.js';
import {
  shouldCast as askTrigger,
  setTriggerArea,
} from '#ability/skill/trigger.js';
import { SCHEDULE } from '#battle/step.js';
import { forceAttack } from '#combat/attack/index.js';
import { cutStand } from '#combat/attack/stand.js';
import { healUnit, loseLife, runDamage } from '#combat/damage/index.js';
import { addElement as chargeElement } from '#combat/element/index.js';
import {
  projectileViews,
  launchProjectile as storeProjectile,
} from '#combat/projectile/index.js';
import { setTargetPriority } from '#combat/target/priority.js';
import {
  unitsInRange as rangeUnits,
  selectUnits,
  setExtraRange,
} from '#combat/target/selector.js';
import type { BattleEvent, InterceptEventType } from '#contract/event.js';
import type { PhaseSlot } from '#contract/phase.js';
import type { BattleResult } from '#contract/result.js';
import type {
  TileCoord,
  TileSpec,
  UnitSide,
  UnitSpec,
} from '#contract/spec.js';
import { addCost, costOf, spendCost } from '#economy/index.js';
import { bodyRect, normHitArea } from '#field/body/index.js';
import { gridOf } from '#field/grid/index.js';
import { replanRoute, routeHidden } from '#field/grid/route.js';
import { applyShift } from '#field/motion/index.js';
import { cutUnbalance } from '#field/motion/unbalance.js';
import {
  emit as publish,
  intercept as publishIntercept,
  subscribe,
} from '#kernel/event/index.js';
import { TICK } from '#kernel/tick/index.js';
import type { TimerView } from '#kernel/timer/index.js';
import { defineResource } from '#kernel/world/resource.js';
import { grantTag, hasTag, revokeTag, tagSources } from '#kernel/world/tag.js';
import type {
  ContentContext,
  EventRevision,
  HitShape,
  UnitView,
} from '#port/context.js';
import type {
  AttributeModifier,
  BattleRegistry,
  DamageInfo,
  DamagePreview,
  ProjectileLaunch,
} from '#port/definition.js';
import { releaseBlock } from '#unit/block/index.js';
import { orderRedeploy, retreatUnit } from '#unit/deploy/command.js';
import {
  type BattleWorld,
  ENGINE,
  placeUnit,
  requireUnit,
  removeUnit as retireUnit,
  unbalanced,
} from '#unit/record/index.js';
import {
  advanceStartedTimers as advanceSlotTimers,
  armListedTimers,
  startTimer as beginTimer,
  timerView as readTimerView,
  advanceTimer as stepTimer,
} from '#unit/record/timer.js';

/** 本场结果。finish 写上胜方。 */
export const RESULT = defineResource<BattleResult>('battle:result', () => ({
  finished: false,
  winner: null,
}));

export function createContext(
  state: BattleWorld,
  registry: BattleRegistry,
): ContentContext {
  const ctx: ContentContext = {
    registerAttribute(definition) {
      registry.registerAttribute(definition);
    },
    registerEffect(definition) {
      registry.registerEffect(definition);
    },
    registerStacking(definition) {
      registry.registerStacking(definition);
    },
    registerCondition(definition) {
      registry.registerCondition(definition);
    },
    registerSkillHook(definition) {
      registry.registerSkillHook(definition);
    },
    registerDamageStep(definition) {
      registry.registerDamageStep(definition);
    },
    registerDamageModifier(definition) {
      registry.registerDamageModifier(definition);
    },
    markExtensible(key) {
      registry.markExtensible(key);
    },
    replace(key, definition) {
      registry.replace(key, definition);
    },
    wrap(key, wrap) {
      registry.wrap(key, wrap);
    },
    registerElement(definition) {
      registry.registerElement(definition);
    },
    registerSelector(definition) {
      registry.registerSelector(definition);
    },
    registerSkillTrigger(definition) {
      registry.registerSkillTrigger(definition);
    },
    registerSkillBody(definition) {
      registry.registerSkillBody(definition);
    },
    registerTimer(definition) {
      registry.registerTimer(definition);
    },
    registerDeployStrategy(definition) {
      registry.registerDeployStrategy(definition);
    },
    registerShift(definition) {
      registry.registerShift(definition);
    },
    registerTerrain(definition) {
      registry.registerTerrain(definition);
    },
    registerZone(definition) {
      registry.registerZone(definition);
    },
    registerSystem(system) {
      registry.registerSystem(system);
    },
    registerTag(key) {
      registry.registerTag(key);
    },
    subscribe(type, handler) {
      return subscribe(state.events, type, (event) => handler(event, ctx));
    },
    dealDamage(info: DamageInfo) {
      runDamage(state, registry, ctx, info, false);
    },
    heal(unitId, amount, options) {
      healUnit(state, registry, ctx, unitId, amount, options);
    },
    loseHp(unitId, amount) {
      loseLife(state, registry, ctx, unitId, amount);
    },
    applyEffect(unitId, effectId, application) {
      giveEffect(state, registry, ctx, unitId, effectId, application);
    },
    removeEffect(unitId, effectId) {
      takeEffect(state, registry, ctx, unitId, effectId);
    },
    spawnUnit(spec: UnitSpec) {
      if (!stands(state, registry, ctx, spec.id, spec.x, spec.y)) {
        return;
      }
      armListedTimers(state, registry, placeUnit(state, registry, spec, true));
      publish(state, 'spawn', { unitId: spec.id });
    },
    removeUnit(unitId) {
      const unit = requireUnit(state, unitId);
      if (unit.removed) {
        return;
      }
      if (unit.side === 'enemy') {
        releaseBlock(state, unit, { registry, ctx });
      }
      retireUnit(state, unitId);
    },
    displace(unitId, x, y) {
      if (!stands(state, registry, ctx, unitId, x, y)) {
        return;
      }
      const unit = requireUnit(state, unitId);
      unit.x = x;
      unit.y = y;
      replanRoute(state, unitId);
      cutStand(state, unitId);
      publish(state, 'displace', {
        unitId,
        x,
        y,
        duration: 0,
        keepFacing: false,
      });
    },
    shift(actionId, unitId, input) {
      return applyShift(state, registry, ctx, actionId, unitId, input);
    },
    setTerrain(x, y, terrain) {
      gridOf(state).setTerrain(x, y, terrain);
    },
    terrainAt(x, y) {
      return gridOf(state).terrainAt(x, y);
    },
    setObstacle(x, y, on, kind) {
      gridOf(state).setObstacle(x, y, on, kind);
    },
    launchProjectile(projectile: ProjectileLaunch) {
      storeProjectile(state, projectile);
      publish(state, 'projectile', {
        id: projectile.id,
        sourceId: projectile.sourceId,
        targetId: projectile.targetId,
      });
    },
    spendCost(side, amount) {
      return spendCost(state, side, amount);
    },
    addCost(side, amount) {
      addCost(state, side, amount);
    },
    costOf(side) {
      return costOf(state, side);
    },
    emit(type, data) {
      publish(state, type, data);
    },
    intercept(type, data) {
      publishIntercept(state, type, data);
    },
    random: state.random,
    hitRect(unitId): HitShape {
      const unit = requireUnit(state, unitId);
      const area = normHitArea(unit.hitArea);
      const rect = bodyRect(unit);
      if (!area || !rect) {
        return {
          kind: 'tile',
          x: Math.round(unit.x) - 0.5,
          y: Math.round(unit.y) - 0.5,
          w: 1,
          h: 1,
        };
      }
      return { kind: 'rect', x: rect.x0, y: rect.y0, w: area.w, h: area.h };
    },
    unitsInRange(unitId, selectorId) {
      return rangeUnits(state, registry, ctx, unitId, selectorId);
    },
    select(selectorId, unitIds) {
      return selectUnits(registry, ctx, selectorId, unitIds, { origin: null });
    },
    previewDamage(info: DamageInfo): DamagePreview {
      return runDamage(state, registry, ctx, info, true);
    },
    startTimer(unitId, timerId) {
      beginTimer(state, registry, unitId, timerId);
    },
    advanceTimer(unitId, timerId) {
      stepTimer(state, registry, ctx, unitId, timerId);
    },
    advanceStartedTimers(slot: PhaseSlot) {
      advanceSlotTimers(state, registry, ctx, slot);
    },
    timerView(unitId, timerId): TimerView {
      return readTimerView(state, registry, unitId, timerId);
    },
    addElement(unitId, elementId, amount) {
      chargeElement(state, registry, ctx, unitId, elementId, amount);
    },
    component(key) {
      return state.components.access(key);
    },
    resource(key) {
      return state.resources.access(key);
    },
    hasTag(unitId, key) {
      const unit = state.units.get(unitId);
      return unit !== undefined && hasTag(unit, key);
    },
    grantTag(unitId, key, sourceId) {
      registry.requireTag(key.id, `grant from ${sourceId}`);
      grantTag(requireUnit(state, unitId), key, sourceId);
    },
    revokeTag(unitId, key, sourceId) {
      const unit = state.units.get(unitId);
      if (unit) {
        revokeTag(unit, key, sourceId);
      }
    },
    tagSources(unitId, key) {
      const unit = state.units.get(unitId);
      return unit ? tagSources(unit, key) : [];
    },
    schedule(tick, run) {
      state.resources.access(SCHEDULE).ensure().push({ tick, run });
    },
    finish(winner: UnitSide) {
      state.resources.access(RESULT).set({ finished: true, winner });
    },
    tick() {
      return state.tick;
    },
    shouldCast(unitId, skillId) {
      return askTrigger(state, registry, ctx, unitId, skillId);
    },
    forceAttack(unitId, targetIds = null, options = {}) {
      return forceAttack(
        state,
        registry,
        ctx,
        unitId,
        targetIds,
        options.noAmmo === true,
      );
    },
    setExtraRange(unitId, tiles) {
      requireUnit(state, unitId);
      setExtraRange(state, unitId, tiles);
    },
    setTriggerArea(unitId, key, area) {
      requireUnit(state, unitId);
      setTriggerArea(state, unitId, key, area);
    },
    castSkill(unitId, skillId) {
      return activateSkill(state, registry, ctx, unitId, skillId, 'manual');
    },
    retreatUnit(unitId) {
      return retreatUnit(ctx, unitId);
    },
    redeployUnit(unitId, order = {}) {
      return orderRedeploy(ctx, unitId, order, false);
    },
    unbalanced(unitId) {
      const unit = state.units.get(unitId);
      return unit !== undefined && unbalanced(state, unit);
    },
    cutUnbalance(unitId) {
      const unit = state.units.get(unitId);
      if (!unit || unit.removed) {
        return 'unknown-unit';
      }
      cutUnbalance(unit);
      return null;
    },
    readySkill(unitId, skillId) {
      fillSkill(state, registry, unitId, skillId);
    },
    configureSkill(unitId, skillId, spec) {
      writeSkill(state, unitId, skillId, spec);
    },
    setAim(unitId, priority) {
      if (!state.units.has(unitId)) {
        return;
      }
      setTargetPriority(state, unitId, priority);
    },
    gainSp(unitId, skillId, amount, options) {
      return gainSkillSp(
        state,
        registry,
        unitId,
        skillId,
        amount,
        options?.ignoreLock === true ? 'unlocked' : 'grant',
      );
    },
    tile(x, y): TileSpec | null {
      return gridOf(state).at(x, y);
    },
    projectiles() {
      return projectileViews(state);
    },
    unit(unitId): UnitView | null {
      const unit = state.units.get(unitId);
      if (!unit) {
        return null;
      }
      const hp = unit.attributes.hp ?? 0;
      return {
        id: unit.id,
        side: unit.side,
        x: unit.x,
        y: unit.y,
        hp,
        maxHp: maxHpOf(unit, registry),
        alive:
          unit.fielded && !unit.downed && hp > 0 && !routeHidden(state, unitId),
        fielded: unit.fielded,
        downed: unit.downed,
        facing: unit.facing,
        motion: unit.motion,
      };
    },
    units(side) {
      const ids: string[] = [];
      for (const unit of state.units.values()) {
        if (side !== undefined && unit.side !== side) {
          continue;
        }
        ids.push(unit.id);
      }
      return ids;
    },
    attribute(unitId, key) {
      const unit = state.units.get(unitId);
      if (!unit) {
        return 0;
      }
      if (key === 'hp') {
        return unit.attributes.hp ?? 0;
      }
      if (key === 'maxHp') {
        return maxHpOf(unit, registry);
      }
      return attributeOf(unit, registry, key);
    },
    setModifier(unitId, key, modifiers, duration) {
      const unit = state.units.get(unitId);
      if (!unit) {
        return;
      }
      if (duration !== undefined && !(duration > 0)) {
        unit.modifiers.delete(key);
        return;
      }
      const remaining =
        duration === undefined
          ? Number.POSITIVE_INFINITY
          : Math.max(1, Math.round(duration / TICK));
      const copy: AttributeModifier[] = modifiers.map((modifier) => ({
        attribute: modifier.attribute,
        op: modifier.op,
        value: modifier.value,
      }));
      unit.modifiers.set(key, { modifiers: copy, remaining });
    },
    clearModifier(unitId, key) {
      state.units.get(unitId)?.modifiers.delete(key);
    },
    hasModifier(unitId, key) {
      const timed = state.units.get(unitId)?.modifiers.get(key);
      return timed !== undefined && timed.remaining > 0;
    },
    script(unitId) {
      return state.units.get(unitId)?.script ?? EMPTY_SCRIPT;
    },
    field() {
      return state.spec.notes ?? EMPTY_FIELD;
    },

    revise(event: BattleEvent<InterceptEventType>, revision: EventRevision) {
      const data = event.data as {
        prevented?: boolean;
        cancel?: boolean;
        keep?: boolean;
      };
      if (revision.prevented !== undefined && 'prevented' in data) {
        data.prevented = revision.prevented;
      }
      if (revision.cancel !== undefined && 'cancel' in data) {
        data.cancel = revision.cancel;
      }
      if (revision.keep !== undefined && 'keep' in data) {
        data.keep = revision.keep;
      }
    },
  };
  state.resources.access(ENGINE).set({ world: state, registry });
  return ctx;
}

const EMPTY_SCRIPT: Readonly<Record<string, string | number | boolean>> =
  Object.freeze({});
const EMPTY_FIELD: Readonly<Record<string, unknown>> = Object.freeze({});

function stands(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  unitId: string,
  x: number,
  y: number,
): boolean {
  const strategyId = state.spec.deployStrategy;
  if (strategyId === null) {
    return true;
  }
  const tile: TileCoord = { x: Math.round(x), y: Math.round(y) };
  return registry.requireDeployStrategy(strategyId).canStand(unitId, tile, ctx);
}
