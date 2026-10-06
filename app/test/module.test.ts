import { moduleId as assetsCatalogId } from "arknights-assets-catalog"
import { moduleId as missionCoreId } from "arknights-mission-core"
import { moduleId as missionRendererId } from "arknights-mission-renderer"
import { moduleId } from "stronghold-app"
import { expect, test } from "vitest"

test("app follows the battle core, the asset catalog, and the stage", () => {
  expect(moduleId).toBe("stronghold-app")
  expect(missionCoreId).toBe("arknights-mission-core")
  expect(assetsCatalogId).toBe("arknights-assets-catalog")
  expect(missionRendererId).toBe("arknights-mission-renderer")
})
