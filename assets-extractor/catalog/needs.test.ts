import type { AssetKey, NeedsList } from "arknights-assets-catalog"
import { expect, test } from "vitest"
import { mergeNeeds } from "#catalog/needs.js"

const list = (needs: [string, boolean][]): NeedsList => ({ schemaVersion: 1, pack: { type: "base", id: "t" }, needs: needs.map(([key, required]) => ({ key: key as AssetKey, required })) })

test("a key is required when any list requires it; output sorted by key", () => {
  expect(mergeNeeds([list([["image:b", false], ["image:a", false]]), list([["image:b", true]])])).toEqual([
    { key: "image:a", required: false },
    { key: "image:b", required: true },
  ])
})

test("an absent reason survives the merge only while the key stays optional", () => {
  const absent = (key: string, required: boolean, reason?: string): NeedsList => ({
    schemaVersion: 1,
    pack: { type: "base", id: "t" },
    needs: [reason === undefined ? { key: key as AssetKey, required } : { key: key as AssetKey, required, absent: reason }],
  })
  expect(mergeNeeds([absent("image:a", false, "only in the client"), absent("image:a", false)])).toEqual([{ key: "image:a", required: false, absent: "only in the client" }])
  expect(mergeNeeds([absent("image:b", false, "only in the client"), absent("image:b", true)])).toEqual([{ key: "image:b", required: true }])
})
