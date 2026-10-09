import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, test } from "vitest"
import { formatAssetKey } from "arknights-assets-catalog"
import { markAbsent, parseAbsentTable } from "#compiler/media/need/absent.js"
import { dataWorkspace } from "#workspace.js"

test("listed needs become optional with their reason, others stay as they are", () => {
  const listed = formatAssetKey("spine", "enemy/enemy_9016_acstmr")
  const other = formatAssetKey("spine", "enemy/enemy_1007_slime")
  const table = parseAbsentTable({ [listed]: "Not in Ark-Models" }, "test")
  expect(markAbsent([{ key: listed, required: true }, { key: other, required: true }], table)).toEqual([
    { key: listed, required: false, absent: "Not in Ark-Models" },
    { key: other, required: true },
  ])
})

test("the absent table rejects invalid keys and empty reasons", () => {
  expect(() => parseAbsentTable([], "test")).toThrow(/object/)
  expect(() => parseAbsentTable({ "image:a.png": "x" }, "test")).toThrow(/not a valid asset key/)
  expect(() => parseAbsentTable({ "image:a": "" }, "test")).toThrow(/needs a reason/)
})

test("the checked-in absent table parses", () => {
  const path = join(dataWorkspace().baseInputDir, "absent.json")
  const table = parseAbsentTable(JSON.parse(readFileSync(path, "utf8")), path)
  expect(table.size).toBeGreaterThan(0)
  expect(table.has(formatAssetKey("spine", "token/token_10039_ulpia_block/front"))).toBe(true)
})
