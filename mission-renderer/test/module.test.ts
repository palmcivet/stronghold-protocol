import { mediaUrl } from "arknights-assets-catalog"
import { MODULE_ID as missionCoreId } from "arknights-mission-core"
import { MODULE_ID } from "arknights-mission-renderer"
import { expect, test } from "vitest"

test("stage follows the battle core and the asset catalog", () => {
  expect(MODULE_ID).toBe("arknights-mission-renderer")
  expect(missionCoreId).toBe("arknights-mission-core")
  expect(mediaUrl("/assets/audio/bgm/act1.mp3", "http://localhost")).toBe("/media/bgm/act1")
})
