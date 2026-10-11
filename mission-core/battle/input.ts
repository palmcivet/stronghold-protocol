import type { BattleInput, CommandRefusal } from '#contract/input.js';
import { emit } from '#kernel/event/index.js';
import type { ContentContext } from '#port/context.js';
import { orderRedeploy, retreatUnit } from '#unit/deploy/command.js';
import { engineOf } from '#unit/record/index.js';

/** 输入被拒绝的原因：命令的原因，加上输入本身不成立、不是友方单位与技能放不出。 */
export type InputRefusal = CommandRefusal | 'bad-input' | 'cannot-cast';

/** 每拍开始时按提交顺序执行玩家输入，接受的送出 input，拒绝的送出 input-refused。 */
export function applyInputs(
  ctx: ContentContext,
  inputs: readonly BattleInput[],
): void {
  const { world: state } = engineOf(ctx);
  for (const input of inputs) {
    const reason = applyInput(ctx, input);
    if (reason === null) {
      emit(state, 'input', { input });
    } else {
      emit(state, 'input-refused', { input, reason });
    }
  }
}

function applyInput(
  ctx: ContentContext,
  input: BattleInput,
): InputRefusal | null {
  const { world: state } = engineOf(ctx);
  if (!input || typeof input !== 'object' || typeof input.unitId !== 'string') {
    return 'bad-input';
  }
  const unit = state.units.get(input.unitId);
  if (!unit || unit.removed) {
    return 'unknown-unit';
  }
  if (unit.side !== 'ally') {
    return 'not-ally';
  }
  switch (input.type) {
    case 'retreat':
      return retreatUnit(ctx, input.unitId);
    case 'redeploy':
      return orderRedeploy(
        ctx,
        input.unitId,
        input.tile ? { tile: input.tile } : {},
        true,
      );
    case 'cast':
      if (typeof input.skillId !== 'string') {
        return 'bad-input';
      }
      return ctx.castSkill(input.unitId, input.skillId) ? null : 'cannot-cast';
    default:
      return 'bad-input';
  }
}
