import { describe, expect, it } from "vitest"
import { assetKeyIssue } from "arknights-assets-catalog"
import { ASSET_RULES, type AssetRule, type MappedRule, type RuleContext } from "#data/asset/rules.js"

function ruleNamed(name: string): AssetRule {
  const found = ASSET_RULES.find((rule) => rule.name === name)
  if (found === undefined) throw new Error(`no rule named ${name}`)
  return found
}

function mappedNamed(name: string): MappedRule {
  const rule = ruleNamed(name)
  if (rule.action !== "map") throw new Error(`${name} is not a mapped rule`)
  return rule
}

/** Runs a text rule on one address, the way the builder does, and returns its key and refs path. */
function mapText(name: string, address: string, params: readonly string[] = []) {
  const rule = mappedNamed(name)
  const match = rule.pattern?.exec(address)
  if (match === null || match === undefined) throw new Error(`${name} does not match ${address}`)
  const context: RuleContext = { params, captures: match.slice(1).map((group) => group ?? ""), text: address, parent: {}, seasonId: "act2autochess" }
  return { key: rule.key(context), refPath: rule.ref?.(context) ?? null }
}

describe("asset rules", () => {
  it("has a unique name for every rule", () => {
    const names = ASSET_RULES.map((rule) => rule.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it.each([
    ["chars.avatar", "/assets/char/avatar/char_003_kalts.png", ["char_003_kalts"], "image:char/avatar/char_003_kalts", ["chars", "char_003_kalts", "avatar"]],
    ["chars.avatarE2", "/assets/char/avatar/char_003_kalts_2.png", ["char_003_kalts"], "image:char/avatar/char_003_kalts_2", ["chars", "char_003_kalts", "avatarElite"]],
    ["chars.portrait", "/assets/char/portrait/char_003_kalts_1.png", ["char_003_kalts"], "image:char/portrait/char_003_kalts_1", ["chars", "char_003_kalts", "portrait"]],
    ["chars.portraitE2", "/assets/char/portrait/char_003_kalts_2.png", ["char_003_kalts"], "image:char/portrait/char_003_kalts_2", ["chars", "char_003_kalts", "portraitElite"]],
    ["enemies.icon", "/assets/enemy/icon/enemy_10001_trslim.png", ["enemy_10001_trslim"], "image:enemy/icon/enemy_10001_trslim", ["enemies", "enemy_10001_trslim", "icon"]],
    ["tokens.avatar", "/assets/token/avatar/token_10000_silent_healrb.png", ["token_10000_silent_healrb"], "image:token/icon/token_10000_silent_healrb", ["tokens", "token_10000_silent_healrb", "icon"]],
    ["bonds", "/assets/bond/yanShip.png", ["yanShip"], "image:bond/yanShip", ["bonds", "yanShip"]],
    ["bands", "/assets/band/band_bldsk.png", ["band_bldsk"], "image:band/band_bldsk", ["bands", "band_bldsk"]],
    ["items", "/assets/item/trap_1041_acarm041.png", ["trap_1041_acarm041"], "image:season/act2autochess/trap/trap_1041_acarm041", ["items", "trap_1041_acarm041"]],
    ["modules", "/assets/module/WAH-Y.png", ["WAH-Y"], "image:module/wah-y", null],
    ["skills", "/assets/skill/skchr_kalts_1.png", ["skchr_kalts_1"], "image:skill/skchr_kalts_1", ["skills", "skchr_kalts_1"]],
    ["ui", "/assets/ui/garrisonTypeIcon/icon_battle.png", [], "image:ui/garrisonTypeIcon/icon_battle", null],
    ["prof.icon", "/assets/prof/icon_caster.png", ["caster"], "image:prof/caster", ["prof", "icon", "caster"]],
    ["prof.large", "/assets/prof/large_caster.png", ["caster"], "image:prof/large/caster", ["prof", "large", "caster"]],
    ["prof.battlecard", "/assets/prof/battlecard_caster.png", ["caster"], "image:prof/card/caster", ["prof", "card", "caster"]],
    ["prof.sub", "/assets/prof/sub/fastshot.png", ["fastshot"], "image:prof/sub/fastshot", ["prof", "sub", "fastshot"]],
  ])("maps %s to a valid key and refs path", (name, address, params, key, refPath) => {
    const mapped = mapText(name, address, params)
    expect(mapped.key).toBe(key)
    expect(assetKeyIssue(mapped.key)).toBeNull()
    expect(mapped.refPath).toEqual(refPath)
  })

  it.each([
    ["audio.bgm", "/assets/audio/bgm/m_bat_act1autochess_loop.mp3", "audio:bgm/m_bat_act1autochess_loop", ["bgm", "m_bat_act1autochess_loop"]],
    ["audio.bossBgm", "/assets/audio/bgm/m_bat_ancestor_loop.mp3", "audio:bgm/m_bat_ancestor_loop", ["bgm", "m_bat_ancestor_loop"]],
    ["audio.sfx.ui", "/assets/audio/sfx/general/g_ui/g_ui_btn_h.mp3", "audio:sfx/ui/g_ui_btn_h", ["sfx", "ui", "g_ui_btn_h"]],
    ["audio.sfx.battle", "/assets/audio/sfx/battle/b_char/b_char_set.mp3", "audio:sfx/battle/b_char_set", ["sfx", "battle", "b_char_set"]],
    ["fonts.faces", "/fonts/novecento-wide-normal.woff2", "font:novecento-wide/normal", ["fonts", "novecento-wide", "normal"]],
  ])("maps %s to a valid key and refs path", (name, address, key, refPath) => {
    const params = name === "fonts.faces" ? ["novecento-wide-normal"] : []
    const mapped = mapText(name, address, params)
    expect(mapped.key).toBe(key)
    expect(assetKeyIssue(mapped.key)).toBeNull()
    expect(mapped.refPath).toEqual(refPath)
  })

  it("maps a voice line under its character and slot, with the language of the master path", () => {
    const mapped = mapText("audio.voice", "/assets/audio/voice/cn/char_102_texas/cn_019.mp3", ["char_102_texas", "start"])
    expect(mapped).toEqual({ key: "audio:voice/cn/char_102_texas/cn_019", refPath: ["voice", "char_102_texas", "start"] })
  })

  it("maps a unit sound from the player, enemy or battle directory to the battle sfx key, without refs", () => {
    expect(mapText("audio.sfx.units", "/assets/audio/sfx/player/p_atk/p_atk_healpistol_n.mp3", ["char_003_kalts", "attack"])).toEqual({
      key: "audio:sfx/battle/p_atk_healpistol_n",
      refPath: null,
    })
    expect(mapText("audio.sfx.units.skills", "/assets/audio/sfx/enemy/e_skill/e_skill_gldcndd.mp3", ["char_003_kalts", "skills", "0"]).key).toBe("audio:sfx/battle/e_skill_gldcndd")
  })

  it("maps a spine record by its location, as the operator, enemy and token pose or variant keys", () => {
    const front = ruleNamed("chars.spine.front")
    expect(front.action === "map" && front.key({ params: ["char_003_kalts"], captures: [], text: "", parent: {}, seasonId: "x" })).toBe("spine:char/char_003_kalts/front")
    const variant = ruleNamed("tokens.spine.variant")
    expect(variant.action === "map" && variant.when?.({ spineVariant: "token_10006_vodfox_doll_witch_2" })).toBe(true)
    expect(variant.action === "map" && variant.key({ params: ["token_10006_vodfox_doll"], captures: [], text: "", parent: { spineVariant: "token_10006_vodfox_doll_witch_2" }, seasonId: "x" }))
      .toBe("spine:token/token_10006_vodfox_doll/token_10006_vodfox_doll_witch_2")
  })

  it.each([
    ["chars.avatar", "/assets/char/avatar/char_003_kalts.jpg", "a jpg is not an avatar address"],
    ["chars.avatarE2", "/assets/char/avatar/char_003_kalts.png", "an elite avatar name ends with _2"],
    ["ui", "/assets/misc/x.png", "ui addresses live under /assets/ui/"],
    ["audio.sfx.ui", "/assets/audio/sfx/customse/act1autochess/act1autochess_b_ui_getmoney.mp3", "customse is not general/g_ui"],
    ["audio.sfx.battle", "/assets/audio/sfx/battle/b_char_set.mp3", "a battle sfx needs its directory"],
    ["audio.voice", "/assets/audio/voice/en/char_102_texas/cn_019.mp3", "only the cn voice language is mapped"],
  ])("does not guess a key for %s: %s", (name, address) => {
    expect(mappedNamed(name).pattern?.test(address)).toBe(false)
  })

  it("refuses local-client Spine records with a reason", () => {
    const refused = ASSET_RULES.filter((rule) => rule.action === "refuse")
    expect(refused.map((rule) => rule.name)).toEqual(["enemies.spineLocal", "tokens.spineLocal"])
    for (const rule of refused) expect(rule.action === "refuse" && rule.reason).toMatch(/local-assets\.json/)
  })
})
