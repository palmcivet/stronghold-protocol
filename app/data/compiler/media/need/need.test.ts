import { expect, test } from "vitest"
import { formatAssetKey, type Need } from "arknights-assets-catalog"
import { baseNeeds, researchTokenIds } from "#compiler/media/need/base.js"
import { collectEnemyIds } from "#compiler/media/need/enemy-ids.js"
import { soundName, uniqueNeeds, type NeedContext } from "#compiler/media/need/input.js"

test("enemy ids come from the research tables and from kits of reached enemies", () => {
  const ids = collectEnemyIds({
    assets07: { enemies: { enemy_1000_a: {} } },
    enemies05: { enemies: { enemy_1000_a: { skills: [{ key: "enemy_1001_b" }] }, enemy_1001_b: {}, enemy_1002_c: {} } },
    maps05: { roundLevels: {} },
    ops03: { chess: [] },
  })
  expect(ids).toEqual(["enemy_1000_a", "enemy_1001_b"])
})

test("a need listed twice stays required when either listing is required", () => {
  const key = formatAssetKey("image", "camp/a")
  const needs: Need[] = [
    { key, required: false },
    { key, required: true },
    { key: formatAssetKey("image", "camp/b"), required: false },
  ]
  expect(uniqueNeeds(needs)).toEqual([
    { key, required: true },
    { key: formatAssetKey("image", "camp/b"), required: false },
  ])
})

test("sound names drop the directory and the extension and keep only key-safe characters", () => {
  expect(soundName("battle/b_char/b_char_atkboost.mp3")).toBe("b_char_atkboost")
  expect(soundName("a/b c[1].mp3")).toBe("b_c_1_")
})

function contextOf(packet: Partial<NeedContext["packet"]>, assets07: unknown = {}): NeedContext {
  return {
    research: { ops03: {}, enemies05: {}, maps05: {}, assets07 },
    audio: null,
    charword: null,
    arknightsAssets: new Map(),
    voice: new Map(),
    voiceLang: "cn",
    voiceSlots: null,
    packet: { enemyIds: [], tokenIds: [], handbookOf: new Map(), spineOf: new Map(), ...packet },
  }
}

test("an enemy that shares the battle model of another asks for that model", () => {
  const keys = baseNeeds(contextOf({ enemyIds: ["enemy_2001_duckmi_2"], spineOf: new Map([["enemy_2001_duckmi_2", "enemy_2001_duckmi"]]) })).map((need) => need.key)
  expect(keys).toContain("spine:enemy/enemy_2001_duckmi")
  expect(keys).toContain("image:enemy/icon/enemy_2001_duckmi_2")
  expect(keys).not.toContain("spine:enemy/enemy_2001_duckmi_2")
})

test("research summons without a name are not official summons", () => {
  expect(researchTokenIds({ tokens: { token_a: { name: "A" }, token_b: { name: null } } })).toEqual(["token_a"])
})
