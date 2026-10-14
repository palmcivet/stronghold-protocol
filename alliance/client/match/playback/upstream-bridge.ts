import {
  battleProgressOf,
  battleResultOf,
  battleSpecOf,
  playerIdsOfSpec,
} from '@alliance/compat-upstream';
import {
  blockModule,
  costModule,
  deployModule,
  leakModule,
  type MissionModule,
  officialFunnelModule,
  officialRankModule,
  officialTerrainModule,
  redeployModule,
} from 'arknights-mission-core';
import type { MissionMap } from 'arknights-mission-renderer';
import { combatDefsStore } from '#infra/store/combat-defs.js';
import { stageMapStore } from '#infra/store/stage-map.js';
import { missionMapOf } from '#match/mission-map.js';
import type { BattleBridge, BattleStart } from '#match/playback/bridge.js';
import { catalogFlavorTagModule } from '#match/playback/catalog-tags.js';

/**
 * Core modules every autochess battle needs. Skill *kits* (custom triggers / blackboard hooks) are content modules and
 * stay empty until the ECS content line lands; SkillSpec from chess records still drives SP / body / attribute mods.
 */
export const UPSTREAM_BATTLE_MODULES: readonly MissionModule[] = Object.freeze([
  costModule,
  deployModule,
  redeployModule,
  blockModule,
  leakModule,
  officialFunnelModule,
  officialTerrainModule,
  officialRankModule,
  catalogFlavorTagModule,
]);

/**
 * Battle bridge for a master backend: maps `b.start.spec` through compat into mission-core, then reports progress and
 * a per-player result. Returns null from `prepare` when the stage or combat defs are not loaded yet.
 */
export function createUpstreamBattleBridge(): BattleBridge {
  return {
    prepare(start: BattleStart) {
      const { defs } = combatDefsStore.getState();
      const { maps } = stageMapStore.getState();
      const spec = battleSpecOf(start.spec, { defs, stages: maps });
      if (!spec) {
        return null;
      }
      const stageId =
        spec.notes && typeof spec.notes.stageId === 'string'
          ? spec.notes.stageId
          : null;
      const stage = stageId ? maps[stageId] : null;
      if (!stage) {
        return null;
      }
      const map: MissionMap = missionMapOf(stage);
      // battleSpecOf only lists core/official module ids; append catalog flavor tags so they install.
      const modules = spec.modules.includes(catalogFlavorTagModule.id)
        ? spec.modules
        : [...spec.modules, catalogFlavorTagModule.id];
      return {
        spec: { ...spec, modules },
        modules: UPSTREAM_BATTLE_MODULES,
        map,
      };
    },
    progress(battle, _start) {
      const { gt, killed, total, dp, done } = battleProgressOf(battle);
      const base = {
        gt,
        killed,
        total,
        ...(dp !== undefined ? { dp } : {}),
      };
      return done ? { ...base, done } : base;
    },
    result(battle, start) {
      return battleResultOf(battle, {
        playerIds: playerIdsOfSpec(start.spec),
      });
    },
  };
}
