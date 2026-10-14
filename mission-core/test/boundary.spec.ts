import type { BattleEventMap, CueMap } from 'arknights-mission-core';
import { expect, test } from 'vitest';

/** 类型里出现的属性名，向下展开到第 4 层，数组看元素。 */
type FieldNames<T, Depth extends unknown[] = []> = Depth['length'] extends 4
  ? never
  : T extends readonly (infer Item)[]
    ? FieldNames<Item, [...Depth, 0]>
    : T extends object
      ? {
          [K in keyof T & string]: K | FieldNames<T[K], [...Depth, 0]>;
        }[keyof T & string]
      : never;

/** 含 player 的词，或以 room 开头的词。 */
type PlayerOrRoom =
  | `${string}${'player' | 'Player' | 'PLAYER'}${string}`
  | `${'room' | 'Room' | 'ROOM'}${string}`
  | `${string}${'Room' | '_room' | '-room'}${string}`;

/** 事件名、cue 种类，以及事件数据与 cue 数据里的属性名。 */
type EventFieldName =
  | keyof BattleEventMap
  | keyof CueMap
  | FieldNames<BattleEventMap>
  | FieldNames<CueMap>;

test('事件表的事件名与数据字段里没有玩家或房间（编译期检查）', () => {
  // 编译期断言：有违规字段时下面这行的类型不是 "none"，tsc -p tsconfig.test.json 报错并指出字段名。
  const leaks: [Extract<EventFieldName, PlayerOrRoom>] extends [never]
    ? 'none'
    : Extract<EventFieldName, PlayerOrRoom> = 'none';
  // 对照：检查本身能抓到嵌套与数组里的字段。
  const probe: Extract<
    FieldNames<{
      gain: {
        readonly owners: readonly {
          playerId: string;
          roomCode: string;
          bondId: string;
        }[];
      };
    }>,
    PlayerOrRoom
  >[] = ['playerId', 'roomCode'];
  expect([leaks, probe]).toEqual(['none', ['playerId', 'roomCode']]);
});
