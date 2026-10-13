import { defineTag, type TagKey } from '#kernel/world/tag.js';
import type { MissionModule } from '#port/module.js';

/** 首领：画面给它首领的框。只是标记，不改战斗规则。 */
export const BOSS: TagKey = defineTag('boss', {
  meaning: 'a boss unit; the view frames it as one',
});

/** 精英：画面给它精英的框。只是标记，不改战斗规则。 */
export const ELITE: TagKey = defineTag('elite', {
  meaning: 'an elite unit; the view frames it as one',
});

/** 官方的单位等级标签：注册 boss 与 elite，单位规格才能写它们。 */
export const officialRankModule: MissionModule = {
  id: 'official-rank',
  install(ctx) {
    ctx.registerTag(BOSS);
    ctx.registerTag(ELITE);
  },
};
