import { createRequire } from "node:module"
import { expect, test } from "vitest"
import { validateC2S } from "#contract/message.js"
import {
  ANIM,
  APP_VERSION,
  AREA,
  DIFFICULTIES,
  DIFFICULTY_COLORS,
  DIFFICULTY_NAMES,
  DIRS,
  EMOTE_BUBBLE_MS,
  EMOTE_CATALOG,
  EMOTE_COOLDOWN_MS,
  EMOTE_LABEL,
  EMOTE_THEME,
  EMOTE_THEMES,
  EMOTES,
  ERR,
  ERR_TEXT,
  GEO,
  MAX_SEATS,
  MAX_SPECTATORS,
  NAME_MAX_LEN,
  PHASE,
  PHASE_NAMES,
  PIECE_KIND,
  PROTOCOL_VERSION,
  ROOM_CODE_LEN,
  UF,
  emoteArtGroup,
  emoteArtPath,
  emoteInfo,
  modeIdFor,
  moduleMeleeOnHighGround,
  placementClass,
} from "#contract/match.js"

const require = createRequire(import.meta.url)
const packageVersion = (require("../../../package.json") as { version: string }).version

const EMOTE_IDS = [
  "autochess_battle_happy", "autochess_battle_scared", "autochess_battle_sorry", "autochess_battle_thanks",
  "autochess_battle_thinking", "autochess_battle_nice_cooperate",
  "slug_autochess_battle_nice_work", "slug_autochess_battle_thanks", "slug_autochess_battle_sorry",
  "slug_autochess_battle_bye", "slug_autochess_battle_distrust", "slug_autochess_battle_very_soon",
  "autochess_battle_noproblem", "autochess_battle_respect", "autochess_battle_call", "autochess_battle_playingcool",
  "autochess_battle_sad", "autochess_battle_dying",
  "autochess_battle_fooldoctor_01", "autochess_battle_fooldoctor_02", "autochess_battle_fooldoctor_03",
  "autochess_battle_fooldoctor_04", "autochess_battle_fooldoctor_05", "autochess_battle_fooldoctor_06",
  "autochess_battle_foolamiya_01", "autochess_battle_foolamiya_02", "autochess_battle_foolamiya_03",
  "autochess_battle_foolamiya_04", "autochess_battle_foolamiya_05", "autochess_battle_foolamiya_06",
  "autochess_battle_foolwisdel_01", "autochess_battle_foolwisdel_02", "autochess_battle_foolwisdel_03",
  "autochess_battle_foolwisdel_04", "autochess_battle_foolwisdel_05", "autochess_battle_foolwisdel_06",
]

test("wire version is separate from the release string", () => {
  expect(PROTOCOL_VERSION).toBe(1)
  expect(APP_VERSION).toBe(packageVersion)
  expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
})

test("seats, room codes, names, difficulties, and phases", () => {
  expect(MAX_SEATS).toBe(4)
  expect(MAX_SPECTATORS).toBe(2)
  expect(ROOM_CODE_LEN).toBe(4)
  expect(NAME_MAX_LEN).toBe(12)
  expect([...DIFFICULTIES]).toEqual(["FUNNY", "NORMAL", "HARD", "ABYSS"])
  expect(DIFFICULTY_NAMES).toEqual({ FUNNY: "标准模拟", NORMAL: "险境模拟", HARD: "绝境模拟", ABYSS: "终极模拟" })
  expect(DIFFICULTY_COLORS).toEqual({ FUNNY: "#f6a329", NORMAL: "#e85a1a", HARD: "#e73118", ABYSS: "#ff0024" })
  expect(modeIdFor("solo", "HARD")).toBe("mode_single_hard")
  expect(modeIdFor("coop", "ABYSS")).toBe("mode_multi_abyss")
  expect(PHASE).toEqual({
    LOBBY: "LOBBY", INFO_CHECK: "INFO_CHECK", BAND_DRAFT: "BAND_DRAFT", BATTLE_CHECK: "BATTLE_CHECK",
    ROUND_START: "ROUND_START", SP_DRAFT: "SP_DRAFT", PREP: "PREP", COMBAT: "COMBAT", UNITE: "UNITE",
    SETTLE: "SETTLE", FINAL_ASSAULT: "FINAL_ASSAULT", HIDDEN_CORE: "HIDDEN_CORE", RESULT: "RESULT",
  })
  expect(Object.keys(PHASE_NAMES)).toEqual(Object.keys(PHASE))
  expect(PHASE_NAMES.PREP).toBe("休整期")
  expect([...DIRS]).toEqual(["UP", "RIGHT", "DOWN", "LEFT"])
})

test("board geometry, areas, piece kinds, snapshot flags, and anim values", () => {
  expect(GEO).toEqual({
    ROWS: 19, COLS: 21,
    FIELD: { r0: 9, r1: 12, c0: 2, c1: 10 },
    NORMAL_RECT: { r0: 9, r1: 12, c0: 0, c1: 10 },
    UNITE_RECT: { r0: 9, r1: 12, c0: 0, c1: 20 },
    BOSS_RECT: { r0: 0, r1: 5, c0: 0, c1: 20 },
    HAND_ROW: 7, HAND_SIZE: 10,
    TEMP_ROW: 8, TEMP_C0: 4, TEMP_SIZE: 5,
    PARTNER_COL_OFFSET: 8,
  })
  expect(AREA).toEqual({ BOARD: "board", HAND: "hand", TEMP: "temp", OUTSIDE: "outside" })
  expect(PIECE_KIND).toEqual({ CHESS: "chess", ITEM: "item", TOKEN: "token" })
  expect(UF).toEqual({
    BLOCKED: 1, STUNNED: 2, FROZEN: 4, STEALTH: 8, SKILL: 16, SHIELD: 32, INVULN: 64, COLD: 128, SLEEP: 256, FLYING: 512,
  })
  expect(ANIM).toEqual({ IDLE: 0, MOVE: 1, ATTACK: 2, SKILL: 3, DIE: 4, STUN: 5, DEPLOY: 6 })
})

test("placement class reads position and the equipped module flag", () => {
  expect(placementClass("MELEE")).toBe("melee")
  expect(placementClass("melee", true)).toBe("all")
  expect(placementClass("RANGED", true)).toBe("ranged")
  expect(placementClass(null)).toBe("all")
  const modules = [{ uniEquipId: "mod-y", meleeOnHighGround: true }, { uniEquipId: "mod-x" }]
  expect(moduleMeleeOnHighGround(modules, "mod-y")).toBe(true)
  expect(moduleMeleeOnHighGround(modules, "mod-x")).toBe(false)
  expect(moduleMeleeOnHighGround(modules, "none")).toBe(false)
  expect(moduleMeleeOnHighGround(null, "mod-y")).toBe(false)
})

test("every error code has the player-facing sentence", () => {
  expect(ERR_TEXT).toEqual({
    BAD_MSG: "无效的请求",
    RATE: "操作过于频繁",
    NOT_IN_ROOM: "你不在房间中",
    ROOM_NOT_FOUND: "未找到该同盟密钥对应的房间",
    ROOM_FULL: "房间已满",
    ROOM_STARTED: "模拟已开始",
    NOT_HOST: "只有房主可以操作",
    NOT_READY: "仍有玩家未就绪",
    WRONG_PHASE: "当前阶段无法进行该操作",
    NO_FUNDS: "资金不足",
    HAND_FULL: "整备区已满",
    BOARD_FULL: "已达到部署上限",
    BAD_TILE: "无法部署在该位置",
    BAD_TARGET: "无效的目标",
    SOLD_OUT: "已售出",
    MAX_LEVEL: "调度中心已达最高等级",
    NOT_YOUR_TURN: "尚未轮到你",
    ALREADY: "已完成该操作",
    TEMP_NOT_EMPTY: "临时整备区不为空",
    ELIMINATED: "你已被淘汰",
    SPECTATOR: "观战中无法进行该操作",
    INTERNAL: "服务器内部错误",
  })
  expect(Object.keys(ERR)).toEqual(Object.keys(ERR_TEXT))
  for (const code of Object.keys(ERR)) expect(ERR[code as keyof typeof ERR]).toBe(code)
})

test("emote ids are the 36 official battle ids, and a wire id cannot reach Object.prototype", () => {
  expect([...EMOTES]).toEqual(EMOTE_IDS)
  expect(EMOTE_THEMES.map((theme) => theme.themeId)).toEqual([
    "emoticon_autochess_basic", "emoticon_originium_slug", "emoticon_autochess_basic_2",
    "emoticon_foolsday_doctor", "emoticon_foolsday_amiya", "emoticon_foolsday_wisdel",
  ])
  expect(EMOTE_CATALOG.map((entry) => entry.id)).toEqual(EMOTE_IDS)
  const doctor = EMOTE_THEMES.find((theme) => theme.themeId === "emoticon_foolsday_doctor")
  expect(doctor?.emotes.map((entry) => entry.picId)).toEqual([
    "pic_fooldoctor_01_battle", "pic_fooldoctor_02_battle", "pic_fooldoctor_04_battle",
    "pic_fooldoctor_05_battle", "pic_fooldoctor_06_battle", "pic_fooldoctor_08_battle",
  ])
  expect(emoteArtPath("autochess_battle_fooldoctor_06")).toBe("/assets/ui/emoticon/fooldoctor/pic_fooldoctor_08_battle.png")
  expect(emoteArtGroup("autochess_battle_dying")).toBe("emoticon/basic_2")
  expect(emoteInfo("autochess_battle_call")?.themeId).toBe("emoticon_autochess_basic_2")
  for (const id of ["happy", "__proto__", "constructor", "toString", "", null, 42]) {
    expect(emoteInfo(id)).toBeNull()
    expect(emoteArtPath(id)).toBeNull()
    expect(emoteArtGroup(id)).toBeNull()
  }
  for (const id of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
    expect(EMOTE_THEME[id]).toBeUndefined()
    expect(EMOTE_LABEL[id]).toBeUndefined()
  }
  expect(Object.keys(EMOTE_THEME)).toHaveLength(36)
  expect(EMOTE_COOLDOWN_MS).toBe(1000)
  expect(EMOTE_BUBBLE_MS).toBe(3000)
  expect(validateC2S({ t: "g.emote", id: EMOTES[0] })).toBeNull()
})
