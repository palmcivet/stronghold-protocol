import { expect, test } from "vitest"
import { formatAssetKey, type AssetKey } from "arknights-assets-catalog"
import { deriveAnimRoles, skillIndicesByOperator } from "#compiler/media/derive/anim-roles.js"

const meta = {
  spineVersion: "3.8.99",
  premultipliedAlpha: false,
  bounds: null,
  animations: { Idle: { duration: 1, events: [] }, Attack: { duration: 0.5, events: [] } },
  pages: [],
  missingRegions: [],
}

test("skill indices put the default skill first and the others in order", () => {
  const indices = skillIndicesByOperator({
    chess: [
      { charId: "char_a", defaultSkillIndex: 2, isGolden: false },
      { charId: "char_a", defaultSkillIndex: 0, isGolden: true },
      { charId: "char_b", defaultSkillIndex: 1, isGolden: false, backup: { charId: "char_b", skillIndex: 3 } },
    ],
  })
  expect(indices.get("char_a")).toEqual([2, 0])
  expect(indices.get("char_b")).toEqual([1, 3])
})

test("roles are derived for every spine with a valid side file and the rest are skipped", async () => {
  const valid = formatAssetKey("spine", "enemy/enemy_1000_a") as AssetKey
  const broken = formatAssetKey("spine", "enemy/enemy_1001_b") as AssetKey
  const result = await deriveAnimRoles({
    seasonId: "act2autochess",
    spineKeys: [broken, valid],
    ops03: { chess: [] },
    readMeta: async (key) => (key === valid ? meta : { spineVersion: 1 }),
  })
  expect(Object.keys(result.roles)).toEqual([valid])
  expect(result.roles[valid]?.attack).not.toBeNull()
  expect(result.skipped).toEqual([broken])
})
