import {
  type BattleEventType,
  CORE_EVENT_TYPES,
  type CoreEventType,
} from 'arknights-mission-core';
import { expect, expectTypeOf, test } from 'vitest';

test('核心事件名封闭、各列一次，且都是事件名', () => {
  expect(new Set(CORE_EVENT_TYPES).size).toBe(CORE_EVENT_TYPES.length);
  expect(Object.isFrozen(CORE_EVENT_TYPES)).toBe(true);
  expect(CORE_EVENT_TYPES).toContain('cue');
  expect(CORE_EVENT_TYPES.every((type) => !type.includes(':'))).toBe(true);
  expectTypeOf<CoreEventType>().toExtend<BattleEventType>();
});
