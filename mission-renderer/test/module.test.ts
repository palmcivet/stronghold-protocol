import { moduleId as assetsCatalogId } from "arknights-assets-catalog"
import { moduleId as missionCoreId } from "arknights-mission-core"
import { moduleId } from "arknights-mission-renderer"
import { expect, test } from "vitest"

test("stage follows the battle core and the asset catalog", () => {
  expect(moduleId).toBe("arknights-mission-renderer")
  expect(missionCoreId).toBe("arknights-mission-core")
  expect(assetsCatalogId).toBe("arknights-assets-catalog")
})
