import type { EntityCodec } from '#kernel/world/archive.js';
import {
  exportTagGrants,
  importTagGrants,
  type TagGrantData,
} from '#kernel/world/tag.js';
import type { BattleRegistry } from '#port/definition.js';
import type { UnitState } from '#unit/record/index.js';

type UnitData = Omit<UnitState, 'tags' | 'timers' | 'modifiers'> & {
  readonly tags: TagGrantData;
  readonly timers: readonly (readonly [
    string,
    UnitState['timers'] extends Map<string, infer V> ? V : never,
  ])[];
  readonly modifiers: readonly (readonly [
    string,
    UnitState['modifiers'] extends Map<string, infer V> ? V : never,
  ])[];
};

/** 核心记录的编解码。技能钩子是 id，随记录一起导出；标签按 id 从注册表找回。 */
export function unitCodec(registry: BattleRegistry): EntityCodec<UnitState> {
  return {
    encode(unit) {
      const { tags, timers, modifiers, ...rest } = unit;
      const data: UnitData = {
        ...rest,
        tags: exportTagGrants(tags),
        timers: [...timers.entries()],
        modifiers: [...modifiers.entries()],
      };
      return data;
    },
    decode(raw) {
      const data = raw as UnitData;
      return {
        ...data,
        tags: importTagGrants(data.tags, (id) =>
          registry.requireTag(id, `unit ${data.id}`),
        ),
        timers: new Map(data.timers),
        modifiers: new Map(data.modifiers),
      };
    },
  };
}
