import type { ContentContext } from '#port/context.js';
import type { BattleRegistry } from '#port/definition.js';

/** 依次问注册的普攻替代，返回第一个非空的目标表；都没有时返回空表。 */
export function offerSubstitute(
  registry: BattleRegistry,
  ctx: ContentContext,
  unitId: string,
): readonly string[] {
  for (const substitute of registry.attackSubstitutes()) {
    const targets = substitute.offer(unitId, ctx);
    if (targets.length > 0) {
      return targets;
    }
  }
  return [];
}
