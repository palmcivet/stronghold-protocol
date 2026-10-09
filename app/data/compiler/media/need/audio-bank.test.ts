import { expect, test } from "vitest"
import { assetToPath, indexAudio, pickUnitSfx } from "#compiler/media/need/audio-bank.js"

test("asset paths and unit sfx role picking", () => {
  expect(assetToPath("Audio/Sound_Beta_2/Player/p_atk/p_atk_sword_n")).toBe("player/p_atk/p_atk_sword_n.mp3")
  expect(assetToPath(null)).toBeNull()
  const index = indexAudio({
    soundFXBanks: [
      { name: "battle.ON_ABILITY_START.char_1_x.attack.1", sounds: [{ asset: "Audio/Sound_Beta_2/P/a1" }] },
      { name: "battle.ON_ABILITY_START.char_1_x.attack.0", sounds: [{ asset: "Audio/Sound_Beta_2/P/a0" }] },
      { name: "battle.ON_ABILITY_HIT.char_1_x.attack", sounds: [{ asset: "Audio/Sound_Beta_2/P/h" }] },
      { name: "battle.ON_UNIT_DEAD.char_1_x", sounds: [{ asset: "Audio/Sound_Beta_2/P/d" }] },
      { name: "battle.ON_SKILL_START.skchr_x_2", sounds: [{ asset: "Audio/Sound_Beta_2/P/s" }] },
    ],
    bgmBanks: [{ name: "battle.ON_GAME_READY.x", intro: null, loop: "Audio/Sound_Beta_2/Music/x_loop" }],
    bankAlias: { "battle.ON_GAME_READY.y": "battle.ON_GAME_READY.x" },
  })
  expect(pickUnitSfx(index.unitBanks.get("char_1_x"))).toEqual({ attack: ["p/a0.mp3"], hit: ["p/h.mp3"], die: ["p/d.mp3"] })
  expect(index.skillBanks.get("skchr_x_2")?.get("ON_SKILL_START")).toEqual(["p/s.mp3"])
  expect(index.bgm("battle.ON_GAME_READY.y")).toEqual({ intro: null, loop: "music/x_loop.mp3" })
  expect(pickUnitSfx(undefined)).toEqual({})
})

test("non-attack abilities are not used as the attack sound", () => {
  const banks = new Map<string, readonly string[]>([
    ["ON_ABILITY_ON.ShieldBurst", ["e/skill.mp3"]],
    ["ON_ABILITY_START.T.1", ["e/talent.mp3"]],
    ["ON_ABILITY_HIT.attack", ["e/hit.mp3"]],
    ["ON_ABILITY_START.PowerAttack", ["e/power.mp3"]],
  ])
  expect(pickUnitSfx(banks)).toEqual({ attack: ["e/power.mp3"], hit: ["e/hit.mp3"] })
  banks.delete("ON_ABILITY_START.PowerAttack")
  expect(pickUnitSfx(banks)).toEqual({ hit: ["e/hit.mp3"] })
})

test("operators keep normal-mode sounds and their own projectile banks", () => {
  const banks = new Map<string, readonly string[]>([
    ["ON_ABILITY_START.attack", ["p/p_atk_x_n.mp3"]],
    ["ON_ABILITY_HIT.attack.2", ["p/p_imp_x_s.mp3"]],
  ])
  expect(pickUnitSfx(banks, { operator: true, projectile: { hit: ["p/p_imp_x_n.mp3"] } })).toEqual({
    attack: ["p/p_atk_x_n.mp3"],
    hit: ["p/p_imp_x_n.mp3"],
  })
  expect(pickUnitSfx(banks)).toEqual({ attack: ["p/p_atk_x_n.mp3"], hit: ["p/p_imp_x_s.mp3"] })
  const mixed = new Map<string, readonly string[]>([
    ["ON_ABILITY_START.attack", ["p/p_atk_y_h.mp3"]],
    ["ON_ABILITY_START.attack.0", ["p/p_atk_y_n.mp3"]],
    ["ON_ABILITY_ON.attack", ["p/p_atk_y_n2.mp3"]],
  ])
  expect(pickUnitSfx(mixed, { operator: true }).attack).toEqual(["p/p_atk_y_n2.mp3"])
  expect(pickUnitSfx(new Map([["ON_ABILITY_START.attack.1", ["p/p_atk_z_s.mp3"]]]), { operator: true })).toEqual({})
  expect(pickUnitSfx(undefined, { operator: true, projectile: { born: ["p/b.mp3"] } })).toEqual({ attack: ["p/b.mp3"] })
})
