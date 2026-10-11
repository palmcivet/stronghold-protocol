// 编译期边界检查：合进核心事件表与 cue 表之后（含本包 declare module 补上的项），事件名、cue 种类与数据字段名里没有玩家或房间。
// 与 mission-core/test/boundary.spec.ts 的检查相同。只有类型，tsc --noEmit 时生效，有违规字段时报错并指出字段名。
import type { BattleEventMap, CueMap } from "arknights-mission-core"

/** 去掉索引签名后的属性名。本包给 CueMap 补了 [kind: string]，不去掉的话具体的名字会被 string 吞掉。 */
type KnownKeys<T> = keyof { [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K] } & string

/** 类型里出现的属性名，向下展开到第 4 层，数组看元素。索引签名下的值照样展开。 */
type FieldNames<T, Depth extends unknown[] = []> = Depth["length"] extends 4
  ? never
  : T extends readonly (infer Item)[]
    ? FieldNames<Item, [...Depth, 0]>
    : T extends object
      ? { [K in KnownKeys<T>]: K | FieldNames<T[K], [...Depth, 0]> }[KnownKeys<T>] | IndexedNames<T, Depth>
      : never

type IndexedNames<T, Depth extends unknown[]> = T extends { readonly [key: string]: infer Value }
  ? string extends keyof T
    ? FieldNames<Value, [...Depth, 0]>
    : never
  : never

/** 含 player 的词，或以 room 开头的词。 */
type PlayerOrRoom =
  | `${string}${"player" | "Player" | "PLAYER"}${string}`
  | `${"room" | "Room" | "ROOM"}${string}`
  | `${string}${"Room" | "_room" | "-room"}${string}`

type EventFieldName = KnownKeys<BattleEventMap> | KnownKeys<CueMap> | FieldNames<BattleEventMap> | FieldNames<CueMap>

type Clean<Leak> = [Leak] extends [never] ? "none" : Leak

/** 结果必须是 "none"。 */
type Expect<T extends "none"> = T

export type EventBoundary = Expect<Clean<Extract<EventFieldName, PlayerOrRoom>>>

// 对照：检查本身能抓到嵌套与数组里的字段。
type Probe = Extract<FieldNames<{ gain: { readonly owners: readonly { playerId: string; roomCode: string; bondId: string }[] } }>, PlayerOrRoom>
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? "none" : "differs") : "differs"
export type EventBoundaryProbe = Expect<Same<Probe, "playerId" | "roomCode">>
