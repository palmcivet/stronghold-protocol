import { attackProfileOf } from '#combat/attack/profile.js';
import { hasTag } from '#kernel/world/tag.js';
import type { ContentContext } from '#port/context.js';
import type { BattleRegistry } from '#port/definition.js';
import { NO_ALLY_HEAL, NO_HEAL } from '#port/tag.js';
import type { BattleWorld, UnitState } from '#unit/record/index.js';

/** 治疗者的 attackShape.healThrough 认这个单位：它的治疗与治疗选择穿过 no-heal 与 heal-free。 */
export function healsThrough(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  healerId: string | undefined,
  unitId: string,
): boolean {
  if (healerId === undefined || healerId === unitId) {
    return false;
  }
  const selectorId = attackProfileOf(state, healerId).shape?.healThrough;
  if (selectorId === undefined) {
    return false;
  }
  return registry
    .requireSelector(selectorId)
    .filter(unitId, ctx, { origin: healerId });
}

/** 别人的治疗被拦下：带 no-ally-heal，或带 no-heal 而治疗者没有穿过它。来自自己的治疗不拦。 */
export function healBlocked(
  state: BattleWorld,
  registry: BattleRegistry,
  ctx: ContentContext,
  healerId: string | undefined,
  unit: UnitState,
): boolean {
  if (healerId === unit.id) {
    return false;
  }
  if (hasTag(unit, NO_ALLY_HEAL)) {
    return true;
  }
  return (
    hasTag(unit, NO_HEAL) &&
    !healsThrough(state, registry, ctx, healerId, unit.id)
  );
}
