import { expect, test } from "vitest"
import { EMOTES, GEO } from "#contract/match.js"
import {
  C2S,
  EV,
  LOADOUT_LIMITS,
  MODULE_NONE,
  RESULT_LIMITS,
  S2C,
  checkLoadout,
  fxForm,
  isBattleResult,
  isLoadoutEntries,
  loadoutOptions,
  resolveLoadout,
  unitStatsEntry,
  validateC2S,
  type ChessRecord,
} from "#contract/message.js"

const C2S_FIELDS: Readonly<Record<string, readonly string[]>> = {
  hello: ["name", "token", "version"],
  ping: ["c"],
  "room.create": ["mode", "difficulty"],
  "room.join": ["code"],
  "room.leave": [],
  "room.ready": ["ready"],
  "room.setDifficulty": ["difficulty"],
  "room.addBot": [],
  "room.removeBot": ["seat"],
  "room.kick": ["seat", "playerId"],
  "room.start": [],
  "room.loadout": ["entries"],
  "room.spectate": ["code"],
  "room.removeSpectator": ["playerId"],
  "g.infoReady": [],
  "g.band": ["bandId"],
  "g.bandSkip": [],
  "g.bandFocus": ["bandId"],
  "g.buy": ["slot"],
  "g.refresh": [],
  "g.freeze": [],
  "g.levelUp": [],
  "g.sell": ["uid"],
  "g.move": ["uid", "to", "dir"],
  "g.equip": ["itemUid", "targetUid", "replaceUid"],
  "g.art": ["itemUid", "row", "col", "dir"],
  "g.destroy": ["uid"],
  "g.reward": ["idx"],
  "g.choice": ["idx"],
  "g.ready": ["ready"],
  "g.emote": ["id"],
  "g.watch": ["fieldId"],
  "g.autoplay": ["on"],
  "g.pause": ["on"],
  "g.unitStats": ["seq"],
  "g.leave": [],
  "b.progress": ["battleId", "gt", "killed", "total", "leaks", "bossDmg", "by", "done", "left"],
  "b.result": ["battleId", "result"],
}

const OPTIONAL: Readonly<Record<string, readonly string[]>> = {
  hello: ["token", "version"],
  "g.bandFocus": ["bandId"],
  "g.move": ["dir"],
  "g.equip": ["replaceUid"],
  "g.art": ["dir"],
  "g.unitStats": ["seq"],
  "b.progress": ["leaks", "bossDmg", "by", "done", "left"],
}

test("every client message has the master fields, and unknown extras are ignored", () => {
  expect(Object.keys(C2S)).toEqual(Object.keys(C2S_FIELDS))
  for (const [type, fields] of Object.entries(C2S_FIELDS)) {
    const spec = C2S[type]
    expect(spec, type).toBeTruthy()
    expect(Object.keys(spec ?? {}).filter((key) => key !== "$optional")).toEqual([...fields])
    expect([...(spec?.$optional ?? [])]).toEqual([...(OPTIONAL[type] ?? [])])
  }
  expect(Object.keys(C2S["room.create"] ?? {})).toEqual(["mode", "difficulty"])
  expect(validateC2S({ t: "room.create", mode: "coop", difficulty: "NORMAL", season: "act2autochess" })).toBeNull()
  expect(validateC2S({ t: "ping", c: 1, extra: true })).toBeNull()
})

test("server pushes keep the master names", () => {
  expect([...S2C]).toEqual([
    "welcome", "ok", "error", "pong",
    "room.state", "room.closed",
    "m.public", "m.private", "m.field", "m.toast", "m.ticker", "m.emote", "m.result",
    "m.unitStats",
    "b.start", "b.pool", "b.end",
    "b.snap", "b.ev",
  ])
  expect(EV).toEqual({
    SPAWN: "spawn", ATK: "atk", DMG: "dmg", HEAL: "heal", SKILL: "skill", ENGAGE: "engage",
    DIE: "die", LEAK: "leak", STATUS: "status", FX: "fx", LAYER: "layer", BOUNTY: "bounty", DEPLOY: "deploy",
  })
})

test("validateC2S rejects a frame that is not a known object", () => {
  expect(validateC2S(null)).toBe("not an object")
  expect(validateC2S([])).toBe("not an object")
  expect(validateC2S(42)).toBe("not an object")
  expect(validateC2S("str")).toBe("not an object")
  expect(validateC2S({})).toBe("unknown type undefined")
  expect(validateC2S({ t: 5 })).toBe("unknown type 5")
  for (const type of ["nope", "__proto__", "constructor", "toString", "hasOwnProperty", "g.", "room."]) {
    expect(validateC2S({ t: type })).toBe(`unknown type ${type}`)
  }
  expect(validateC2S({ t: "ping", c: 1, rid: -5 })).toBe("bad rid")
  expect(validateC2S({ t: "ping", c: 1, rid: 2 ** 31 + 1 })).toBe("bad rid")
  expect(validateC2S({ t: "ping", c: 1, rid: 0 })).toBeNull()
  expect(validateC2S({ t: "ping", c: 1, rid: 2 ** 31 })).toBeNull()
})

test("lobby and match frames accept the master ranges and nothing outside them", () => {
  expect(validateC2S({ t: "hello", name: "博士" })).toBeNull()
  expect(validateC2S({ t: "hello", name: "x".repeat(12), token: null, version: 1 })).toBeNull()
  expect(validateC2S({ t: "hello", name: "   " })).toBe("bad field name")
  expect(validateC2S({ t: "hello", name: "x".repeat(13) })).toBe("bad field name")
  expect(validateC2S({ t: "hello", name: "a", version: 999 })).toBeNull()
  expect(validateC2S({ t: "hello", name: "a", version: 1.5 })).toBe("bad field version")
  expect(validateC2S({ t: "ping", c: 12.5 })).toBeNull()
  expect(validateC2S({ t: "ping", c: "x" })).toBe("bad field c")
  expect(validateC2S({ t: "ping", c: Infinity })).toBe("bad field c")

  expect(validateC2S({ t: "room.create", mode: "solo", difficulty: "ABYSS" })).toBeNull()
  expect(validateC2S({ t: "room.create", mode: "ranked", difficulty: "NORMAL" })).toBe("bad field mode")
  expect(validateC2S({ t: "room.create", mode: "coop", difficulty: "EASY" })).toBe("bad field difficulty")
  expect(validateC2S({ t: "room.create", mode: "coop" })).toBe("bad field difficulty")
  expect(validateC2S({ t: "room.join", code: "ABCDEF" })).toBeNull()
  expect(validateC2S({ t: "room.join", code: "ABCDEFG" })).toBe("bad field code")
  expect(validateC2S({ t: "room.join", code: "AB CD" })).toBe("bad field code")
  expect(validateC2S({ t: "room.join", code: { $gt: "" } })).toBe("bad field code")
  expect(validateC2S({ t: "room.ready", ready: "yes" })).toBe("bad field ready")
  expect(validateC2S({ t: "room.setDifficulty", difficulty: "HARD" })).toBeNull()
  expect(validateC2S({ t: "room.removeBot", seat: 3 })).toBeNull()
  expect(validateC2S({ t: "room.removeBot", seat: 4 })).toBe("bad field seat")
  expect(validateC2S({ t: "room.removeBot", seat: 9 })).toBe("bad field seat")
  expect(validateC2S({ t: "room.kick", seat: 1, playerId: "p_0123456789" })).toBeNull()
  expect(validateC2S({ t: "room.kick", seat: 1 })).toBe("bad field playerId")
  expect(validateC2S({ t: "room.kick", seat: 9, playerId: "p_1" })).toBe("bad field seat")
  expect(validateC2S({ t: "room.kick", seat: 1, playerId: "" })).toBe("bad field playerId")
  expect(validateC2S({ t: "room.leave" })).toBeNull()
  expect(validateC2S({ t: "room.addBot" })).toBeNull()
  expect(validateC2S({ t: "room.start" })).toBeNull()
  expect(validateC2S({ t: "room.spectate", code: "ab12" })).toBeNull()
  expect(validateC2S({ t: "room.removeSpectator", playerId: "p_1" })).toBeNull()

  expect(validateC2S({ t: "g.infoReady" })).toBeNull()
  expect(validateC2S({ t: "g.band", bandId: "band_a" })).toBeNull()
  expect(validateC2S({ t: "g.bandSkip" })).toBeNull()
  expect(validateC2S({ t: "g.bandFocus" })).toBeNull()
  expect(validateC2S({ t: "g.bandFocus", bandId: null })).toBeNull()
  expect(validateC2S({ t: "g.bandFocus", bandId: "band_bldsk" })).toBeNull()
  expect(validateC2S({ t: "g.bandFocus", bandId: "a b" })).toBe("bad field bandId")
  expect(validateC2S({ t: "g.buy", slot: 0 })).toBeNull()
  expect(validateC2S({ t: "g.buy", slot: 15 })).toBeNull()
  expect(validateC2S({ t: "g.buy", slot: -1 })).toBe("bad field slot")
  expect(validateC2S({ t: "g.buy", slot: 16 })).toBe("bad field slot")
  expect(validateC2S({ t: "g.refresh" })).toBeNull()
  expect(validateC2S({ t: "g.freeze" })).toBeNull()
  expect(validateC2S({ t: "g.levelUp" })).toBeNull()
  expect(validateC2S({ t: "g.sell", uid: 1 })).toBeNull()
  expect(validateC2S({ t: "g.sell", uid: 2 ** 31 })).toBeNull()
  expect(validateC2S({ t: "g.sell", uid: 0 })).toBe("bad field uid")
  expect(validateC2S({ t: "g.move", uid: 1, to: { area: "board", row: 0, col: 0 }, dir: "UP" })).toBeNull()
  expect(validateC2S({ t: "g.move", uid: 1, to: { area: "board", row: GEO.ROWS - 1, col: GEO.COLS - 1 } })).toBeNull()
  expect(validateC2S({ t: "g.move", uid: 1, to: { area: "board", row: GEO.ROWS, col: 0 } })).toBe("bad field to")
  expect(validateC2S({ t: "g.move", uid: 1, to: { area: "hand", idx: GEO.HAND_SIZE - 1 } })).toBeNull()
  expect(validateC2S({ t: "g.move", uid: 1, to: { area: "hand", idx: GEO.HAND_SIZE } })).toBe("bad field to")
  expect(validateC2S({ t: "g.move", uid: 1, to: { area: "moon" } })).toBe("bad field to")
  expect(validateC2S({ t: "g.move", uid: 1, to: { area: "board", row: 0, col: 0 }, dir: "left" })).toBe("bad field dir")
  expect(validateC2S({ t: "g.equip", itemUid: 1, targetUid: 2 })).toBeNull()
  expect(validateC2S({ t: "g.equip", itemUid: 1, targetUid: 2, replaceUid: 3 })).toBeNull()
  expect(validateC2S({ t: "g.equip", itemUid: 1, targetUid: 2, replaceUid: null })).toBeNull()
  expect(validateC2S({ t: "g.equip", itemUid: 1, targetUid: 2, replaceUid: "x" })).toBe("bad field replaceUid")
  expect(validateC2S({ t: "g.equip", itemUid: 1, targetUid: 2, replaceUid: 0 })).toBe("bad field replaceUid")
  expect(validateC2S({ t: "g.art", itemUid: 1, row: 0, col: 0 })).toBeNull()
  expect(validateC2S({ t: "g.art", itemUid: 1, row: 0, col: 0, dir: "LEFT" })).toBeNull()
  expect(validateC2S({ t: "g.destroy", uid: 2 })).toBeNull()
  expect(validateC2S({ t: "g.reward", idx: 5 })).toBeNull()
  expect(validateC2S({ t: "g.reward", idx: 6 })).toBe("bad field idx")
  expect(validateC2S({ t: "g.choice", idx: 0 })).toBeNull()
  expect(validateC2S({ t: "g.choice", idx: 6 })).toBe("bad field idx")
  expect(validateC2S({ t: "g.ready", ready: false })).toBeNull()
  expect(validateC2S({ t: "g.watch", fieldId: "n:p_1" })).toBeNull()
  expect(validateC2S({ t: "g.watch", fieldId: "x".repeat(33) })).toBe("bad field fieldId")
  expect(validateC2S({ t: "g.autoplay", on: true })).toBeNull()
  expect(validateC2S({ t: "g.pause", on: true })).toBeNull()
  expect(validateC2S({ t: "g.pause", on: false, rid: 3 })).toBeNull()
  expect(validateC2S({ t: "g.pause" })).toBe("bad field on")
  expect(validateC2S({ t: "g.pause", on: 1 })).toBe("bad field on")
  expect(validateC2S({ t: "g.unitStats" })).toBeNull()
  expect(validateC2S({ t: "g.unitStats", seq: 12 })).toBeNull()
  expect(validateC2S({ t: "g.unitStats", seq: 2 ** 31 })).toBeNull()
  expect(validateC2S({ t: "g.unitStats", seq: -1 })).toBe("bad field seq")
  expect(validateC2S({ t: "g.unitStats", seq: 1.5 })).toBe("bad field seq")
  expect(validateC2S({ t: "g.leave" })).toBeNull()
})

test("g.emote accepts exactly the official ids", () => {
  for (const id of EMOTES) expect(validateC2S({ t: "g.emote", id }), id).toBeNull()
  for (const id of ["happy", "thanks", "autochess_room_hello", "__proto__", "", 7, null]) {
    expect(validateC2S({ t: "g.emote", id })).toBe("bad field id")
  }
})

const player = () => ({
  killed: 1,
  total: 2,
  leaked: [],
  perfect: true,
  layerGains: {},
  unitsEnd: [],
})

test("b.progress and b.result keep the structural limits", () => {
  expect(RESULT_LIMITS).toEqual({ players: 4, leaked: 400, unitsEnd: 64, unitStats: 160, layerGains: 40, mods: 16, unspawned: 400 })
  expect(validateC2S({ t: "b.progress", battleId: "b1", gt: 0, killed: 0, total: 0 })).toBeNull()
  expect(validateC2S({
    t: "b.progress", battleId: "b1", gt: 1e5, killed: 1e5, total: 1e5,
    leaks: 1e6, bossDmg: 1e13, by: { p_1: 1e13 }, done: false, left: { p_1: 1e5 },
  })).toBeNull()
  expect(validateC2S({ t: "b.progress", battleId: "b1", gt: 0, killed: 0, total: 0, by: { p_1: -1 } })).toBe("bad field by")
  expect(validateC2S({ t: "b.progress", battleId: "b1", gt: 0, killed: 0, total: 0, leaks: 1e6 + 1 })).toBe("bad field leaks")

  const ok = { reason: "cleared", time: 1, perPlayer: { p_1: player() } }
  expect(isBattleResult(ok)).toBe(true)
  expect(validateC2S({ t: "b.result", battleId: "b", result: { ...ok, season: "ignored", killed: 0, total: 1 } })).toBeNull()
  expect(isBattleResult({ ...ok, reason: "draw" })).toBe(false)
  expect(isBattleResult({ ...ok, perPlayer: {} })).toBe(false)
  expect(isBattleResult({ ...ok, time: -1 })).toBe(false)
  expect(isBattleResult({ ...ok, errors: -1 })).toBe(false)
  expect(isBattleResult({ ...ok, errors: 1e9 })).toBe(true)
  expect(isBattleResult({ ...ok, errors: 1e9 + 1 })).toBe(false)
  expect(isBattleResult({ ...ok, bossHpLeft: 1e13 })).toBe(true)
  expect(isBattleResult({ ...ok, bossHpLeft: -1 })).toBe(false)
  expect(isBattleResult({ reason: "timeout", time: 1, perPlayer: { p_1: { ...player(), killed: 3, total: 2 } } })).toBe(false)
  expect(isBattleResult({ ...ok, perPlayer: { "bad id": player() } })).toBe(false)
  expect(isBattleResult({ ...ok, perPlayer: { p_1: { ...player(), coins: undefined, damageDealt: 1 } } })).toBe(true)
  expect(isBattleResult({ ...ok, unspawned: [{ enemyKey: "enemy_a" }] })).toBe(true)
  expect(isBattleResult({ ...ok, unspawned: [{ enemyKey: "enemy_a", sourcePlayerId: null, tag: null }] })).toBe(true)
  expect(isBattleResult({ ...ok, unspawned: [{ sourcePlayerId: "p_1" }] })).toBe(false)

  const mods = Object.fromEntries(Array.from({ length: 16 }, (_, index) => [`m${index}`, index % 2 === 0 ? null : "x"]))
  const leaked = [{ enemyKey: "enemy_a", mods, lpr: 1000, sourcePlayerId: "p_1", tag: "t", counted: true, boss: false, spawned: true }]
  expect(isBattleResult({ ...ok, perPlayer: { p_1: { ...player(), leaked } } })).toBe(true)
  const tooManyMods = { ...mods, extra: true }
  expect(isBattleResult({ ...ok, perPlayer: { p_1: { ...player(), leaked: [{ enemyKey: "enemy_a", mods: tooManyMods }] } } })).toBe(false)
  expect(isBattleResult({
    ...ok,
    perPlayer: { p_1: { ...player(), unitsEnd: [{ uid: null, hpPct: 1, sp: 0, alive: true }] } },
  })).toBe(true)
  expect(isBattleResult({
    ...ok,
    perPlayer: { p_1: { ...player(), unitsEnd: [{ hpPct: 1.1, sp: 0, alive: true }] } },
  })).toBe(false)
})

const chess: Record<string, ChessRecord> = {
  chess_a: {
    chessId: "chess_a",
    visible: true,
    goldenId: "chess_a_g",
    skill: { index: 1 },
    skills: [{ index: 0 }, { index: 1, isDefault: true }],
  },
  chess_a_g: {
    chessId: "chess_a_g",
    isGolden: true,
    baseId: "chess_a",
    skill: { index: 1 },
    skills: [{ index: 0 }, { index: 1, isDefault: true }],
    modules: [{ uniEquipId: "mod_x", isDefault: true }, { uniEquipId: "mod_y" }, { uniEquipId: "none" }],
    module: { active: true, id: "mod_x" },
  },
  chess_b: { chessId: "chess_b", visible: true, isHidden: true, skill: { index: 0 } },
  chess_c: { chessId: "chess_c", visible: true, skill: { index: 2 } },
  chess_d: { chessId: "chess_d", visible: true, goldenId: "chess_d_g", skill: { index: 0 } },
  chess_d_g: { chessId: "chess_d_g", isGolden: true, baseId: "chess_d", module: { active: true, id: "mod_d" }, skill: { index: 0 } },
}
const getChess = (id: string) => chess[id] ?? null

test("room.loadout structure is a map of base ids to skill or module", () => {
  expect(LOADOUT_LIMITS).toEqual({ entries: 160, skillIndex: 9 })
  expect(MODULE_NONE).toBe("none")
  const ok = (entries: unknown) => validateC2S({ t: "room.loadout", entries }) === null
  expect(ok({})).toBe(true)
  expect(ok({ chess_a: { skill: 0 } })).toBe(true)
  expect(ok({ chess_a: { module: "none" } })).toBe(true)
  expect(ok({ chess_a: { skill: 1, module: "mod_x" } })).toBe(true)
  expect(ok([])).toBe(false)
  expect(ok(null)).toBe(false)
  expect(ok({ chess_a: {} })).toBe(false)
  expect(ok({ chess_a: { skill: 0, extra: 1 } })).toBe(false)
  expect(ok({ chess_a: { skill: LOADOUT_LIMITS.skillIndex + 1 } })).toBe(false)
  expect(ok({ chess_a: { skill: 0.5 } })).toBe(false)
  expect(ok({ chess_a: { module: "" } })).toBe(false)
  expect(ok({ chess_a: { module: "a b" } })).toBe(false)
  expect(ok({ "bad id!": { skill: 0 } })).toBe(false)
  const many: Record<string, { skill: number }> = {}
  for (let index = 0; index <= LOADOUT_LIMITS.entries; index++) many[`c${index}`] = { skill: 0 }
  expect(ok(many)).toBe(false)
  expect(validateC2S({ t: "room.loadout" })).toBe("bad field entries")
  expect(isLoadoutEntries(Object.create({ chess_a: { skill: 0 } }))).toBe(false)
})

test("checkLoadout drops defaults and rejects an unknown chess or a missing lookup", () => {
  expect(loadoutOptions(chess.chess_a, chess.chess_a_g)).toEqual({
    skills: [0, 1],
    defaultSkill: 1,
    modules: ["mod_x", "mod_y", "none"],
    defaultModule: "mod_x",
  })
  expect(loadoutOptions(chess.chess_d, chess.chess_d_g).modules).toEqual(["mod_d", "none"])
  expect(checkLoadout({}, getChess)).toEqual({ ok: true, loadout: {} })
  expect(checkLoadout({ chess_a: { skill: 0 } }, getChess)).toEqual({ ok: true, loadout: { chess_a: { skill: 0, module: "mod_x" } } })
  expect(checkLoadout({ chess_a: { skill: 1 } }, getChess)).toEqual({ ok: true, loadout: {} })
  expect(checkLoadout({ chess_a: { module: "none" } }, getChess)).toEqual({ ok: true, loadout: { chess_a: { skill: 1, module: "none" } } })
  expect(checkLoadout({ chess_a: { skill: 9 } }, getChess)).toEqual({ error: "BAD_TARGET", detail: "skill 9 not available for chess_a" })
  expect(checkLoadout({ chess_a_g: { skill: 0 } }, getChess).error).toBe("BAD_TARGET")
  expect(checkLoadout({ chess_b: { skill: 0 } }, getChess).error).toBe("BAD_TARGET")
  expect(checkLoadout({ nope: { skill: 0 } }, getChess).error).toBe("BAD_TARGET")
  expect(checkLoadout([], getChess)).toEqual({ error: "BAD_MSG", detail: "bad loadout entries" })
  expect(checkLoadout({ chess_c: { module: "none" } }, getChess).error).toBe("BAD_TARGET")
  expect(checkLoadout({ chess_c: { skill: 2 } }, getChess)).toEqual({ ok: true, loadout: {} })
  expect(checkLoadout({ chess_a: { skill: 0 } }, null)).toEqual({ error: "BAD_TARGET", detail: "unknown chess chess_a" })

  const stored = checkLoadout({ chess_a: { skill: 0, module: "none" } }, getChess)
  expect(stored.ok).toBe(true)
  if (!stored.ok) return
  expect(resolveLoadout(stored.loadout, chess.chess_a, getChess)).toEqual({ skillIndex: 0, moduleId: null })
  expect(resolveLoadout(stored.loadout, chess.chess_a_g, getChess)).toEqual({ skillIndex: 0, moduleId: "none" })
  expect(resolveLoadout(null, chess.chess_a_g, getChess)).toEqual({ skillIndex: 1, moduleId: "mod_x" })
  expect(resolveLoadout({ chess_a: { skill: 7, module: "gone" } }, chess.chess_a_g, getChess)).toEqual({ skillIndex: 1, moduleId: "mod_x" })
  const seen: unknown[] = []
  resolveLoadout({}, { isGolden: true }, (id) => { seen.push(id); return null })
  expect(seen).toEqual([undefined])
  expect(resolveLoadout(null, null, getChess)).toEqual({ skillIndex: null, moduleId: null })
})

test("unitStatsEntry rounds display stats and keeps an ally attack range", () => {
  const unit = {
    id: 3, uid: 44, defId: "chess_x", hp: 812.6, alive: true,
    base: { maxHp: 1000, atk: 300, def: 100, res: 10, aspd: 100, bat: 1.2, blockCnt: 2, moveSpeed: 0 },
  }
  const entry = unitStatsEntry(unit, { maxHp: 1250.4, atk: 420.49, def: 90, res: 12.34, interval: 1.0833333, blockCnt: 3, moveSpeed: 0 })
  expect(entry).toEqual({
    id: 3, uid: 44, defId: "chess_x", hp: 813, alive: true,
    maxHp: 1250, atk: 420, def: 90, res: 12.3, interval: 1.08, blockCnt: 3, moveSpeed: 0,
    base: { maxHp: 1000, atk: 300, def: 100, res: 10, interval: 1.2, blockCnt: 2, moveSpeed: 0 },
    silenced: false,
  })
  expect(unitStatsEntry(unit).atk).toBe(300)
  expect(unitStatsEntry(unit).interval).toBe(1.2)
  expect(unitStatsEntry(null).maxHp).toBe(0)
  expect(unitStatsEntry({ base: { bat: 0 } }).interval).toBeNull()
  const ranged = unitStatsEntry({ side: "ally", liveRangeGrid: [[1, 2], ["a", 1], [1.5, 2], [3]] })
  expect(ranged.range).toEqual([[1, 2]])
  expect(Object.keys(ranged)).toEqual([
    "id", "uid", "defId", "hp", "alive", "maxHp", "atk", "def", "res", "interval", "blockCnt", "moveSpeed", "base", "range", "silenced",
  ])
  expect(unitStatsEntry({ side: "enemy", liveRangeGrid: [[1, 0]] }).range).toBeUndefined()
  expect(unitStatsEntry({ hp: -4, alive: false }, { flags: { silence: true }, maxHp: 1 }).silenced).toBe(true)
})

test("fxForm reads only an fx tuple that names a unit form", () => {
  expect(fxForm(["fx", "phase", 1, 2, { id: 3, kind: "translator_youling", form: "translator_youling", dur: 2 }])).toBe("translator_youling")
  expect(fxForm(["fx", "ember", 1, 2, { id: 3, hits: 5, dur: 11, form: "husk" }])).toBe("husk")
  expect(fxForm(["fx", "revive", 1, 2, { id: 3, form: null }])).toBeNull()
  expect(fxForm(["fx", "phase", 1, 2, { id: 3, kind: "artsBarrier", value: 300 }])).toBeUndefined()
  expect(fxForm(["fx", "ember", 1, 2, { form: "husk" }])).toBeUndefined()
  expect(fxForm(["dmg", 3, 100])).toBeUndefined()
  expect(fxForm(["fx", "x", 0, 0, { id: 1, form: 4 }])).toBeNull()
})
