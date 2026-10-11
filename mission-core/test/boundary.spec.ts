import { expect, test } from "vitest"
import type { BattleEventMap, CueMap } from "arknights-mission-core"
import { isTestFile, packageSources, significant, tokenize } from "#test/source.js"

const IMPORT = /\bfrom\s+"([^"]+)"|\bimport\s*\(\s*"([^"]+)"\s*\)/g

test("kernel 只引用 contract 与 kernel", () => {
  const outside: string[] = []
  for (const file of packageSources()) {
    if (!file.path.startsWith("kernel/") || file.path.endsWith(".test.ts")) continue
    for (const match of file.text.matchAll(IMPORT)) {
      const target = match[1] ?? match[2] ?? ""
      if (!target.startsWith("#kernel/") && !target.startsWith("#contract/")) outside.push(`${file.path} -> ${target}`)
    }
  }
  expect(outside).toEqual([])
})

/** 名字按驼峰与连字符拆成的小写词。 */
function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase())
}

test("核心不引用玩家或房间：名字与字符串里没有 player，也没有以 room 开头的名字", () => {
  const found: string[] = []
  for (const file of packageSources()) {
    if (isTestFile(file.path)) continue
    for (const token of significant(tokenize(file.text))) {
      const parts = words(token.value)
      if (parts.some((word) => word.startsWith("player")) || parts[0]?.startsWith("room") === true) {
        found.push(`${file.path}:${token.line} ${token.text}`)
      }
    }
  }
  expect(found).toEqual([])
})

/** 类型里出现的属性名，向下展开到第 4 层，数组看元素。 */
type FieldNames<T, Depth extends unknown[] = []> = Depth["length"] extends 4
  ? never
  : T extends readonly (infer Item)[]
    ? FieldNames<Item, [...Depth, 0]>
    : T extends object
      ? { [K in keyof T & string]: K | FieldNames<T[K], [...Depth, 0]> }[keyof T & string]
      : never

/** 含 player 的词，或以 room 开头的词。 */
type PlayerOrRoom =
  | `${string}${"player" | "Player" | "PLAYER"}${string}`
  | `${"room" | "Room" | "ROOM"}${string}`
  | `${string}${"Room" | "_room" | "-room"}${string}`

/** 事件名、cue 种类，以及事件数据与 cue 数据里的属性名。 */
type EventFieldName = keyof BattleEventMap | keyof CueMap | FieldNames<BattleEventMap> | FieldNames<CueMap>

test("事件表的事件名与数据字段里没有玩家或房间（编译期检查）", () => {
  // 编译期断言：有违规字段时下面这行的类型不是 "none"，tsc -p tsconfig.test.json 报错并指出字段名。
  const leaks: [Extract<EventFieldName, PlayerOrRoom>] extends [never] ? "none" : Extract<EventFieldName, PlayerOrRoom> = "none"
  // 对照：检查本身能抓到嵌套与数组里的字段。
  const probe: Extract<FieldNames<{ gain: { readonly owners: readonly { playerId: string; roomCode: string; bondId: string }[] } }>, PlayerOrRoom>[] =
    ["playerId", "roomCode"]
  expect([leaks, probe]).toEqual(["none", ["playerId", "roomCode"]])
})
