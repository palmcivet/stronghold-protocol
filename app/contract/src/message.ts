import { DIFFICULTIES, DIRS, EMOTES, GEO, MAX_SEATS, NAME_MAX_LEN, ROOM_CODE_LEN, type Difficulty, type Dir } from "#contract/match.js"

type Check = (value: unknown) => boolean

export interface MessageSpec {
  readonly $optional?: readonly string[]
  readonly [field: string]: Check | readonly string[] | undefined
}

const isInt = (value: unknown, lo = -Infinity, hi = Infinity): boolean =>
  Number.isInteger(value) && (value as number) >= lo && (value as number) <= hi
const isStr = (value: unknown, max = 64): boolean => typeof value === "string" && value.length <= max
const isBool = (value: unknown): boolean => typeof value === "boolean"
const isId = (value: unknown): boolean => typeof value === "string" && value.length > 0 && value.length <= 64 && /^[A-Za-z0-9_\-.:]+$/.test(value)
const isUid = (value: unknown): boolean => isInt(value, 1, 2 ** 31)
const isNum = (value: unknown, lo = -Infinity, hi = Infinity): boolean =>
  typeof value === "number" && Number.isFinite(value) && value >= lo && value <= hi
const isPlain = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
const optional = (check: Check): Check => (value) => value === undefined || check(value)
const nullable = (check: Check): Check => (value) => value === null || value === undefined || check(value)

function isMap(value: unknown, max: number, key: Check, val: Check): boolean {
  if (!isPlain(value)) return false
  const keys = Object.keys(value)
  if (keys.length > max) return false
  for (const name of keys) {
    if (!key(name) || !val(value[name])) return false
  }
  return true
}

function isList(value: unknown, max: number, item: Check): boolean {
  return Array.isArray(value) && value.length <= max && value.every(item)
}

export const RESULT_LIMITS: Readonly<{
  players: number
  leaked: number
  unitsEnd: number
  unitStats: number
  layerGains: number
  mods: number
  unspawned: number
}> = Object.freeze({ players: 4, leaked: 400, unitsEnd: 64, unitStats: 160, layerGains: 40, mods: 16, unspawned: 400 })

const BIG = 1e13
const isStat = (value: unknown): boolean => value === undefined || isNum(value, 0, BIG)
const isModVal = (value: unknown): boolean => value === null || isNum(value, -BIG, BIG) || isStr(value, 64) || isBool(value)

const isLeak: Check = (value) => isPlain(value) && isId(value.enemyKey)
  && (value.mods === undefined || value.mods === null || isMap(value.mods, RESULT_LIMITS.mods, (key) => isStr(key, 32), isModVal))
  && optional((item) => isNum(item, 0, 1000))(value.lpr)
  && nullable(isId)(value.sourcePlayerId)
  && nullable((item) => isStr(item, 16))(value.tag)
  && optional(isBool)(value.counted)
  && optional(isBool)(value.boss)
  && optional(isBool)(value.spawned)

const isUnitEnd: Check = (value) => isPlain(value) && nullable(isUid)(value.uid) && isNum(value.hpPct, 0, 1) && isNum(value.sp, 0, 1e5) && isBool(value.alive)
  && optional(isBool)(value.skillActive) && nullable(isId)(value.defId)

const isUnitStat: Check = (value) => isPlain(value) && nullable(isUid)(value.uid) && nullable(isId)(value.defId) && optional((item) => isStr(item, 16))(value.kind)
  && isStat(value.dmg) && isStat(value.kills) && isStat(value.heal) && isStat(value.taken) && isStat(value.attacks)

const isPerPlayer: Check = (value) => isPlain(value) && isInt(value.killed, 0, 1e5) && isInt(value.total, 0, 1e5) && (value.killed as number) <= (value.total as number)
  && isList(value.leaked, RESULT_LIMITS.leaked, isLeak) && isBool(value.perfect)
  && isMap(value.layerGains, RESULT_LIMITS.layerGains, isId, (item) => isNum(item, 0, 1e4))
  && isStat(value.coins) && isStat(value.damageDealt) && isStat(value.bossDamage) && isStat(value.healingDone) && isStat(value.deaths)
  && isList(value.unitsEnd, RESULT_LIMITS.unitsEnd, isUnitEnd)
  && (value.unitStats === undefined || isList(value.unitStats, RESULT_LIMITS.unitStats, isUnitStat))

const isUnspawned: Check = (value) => isPlain(value) && isId(value.enemyKey) && nullable(isId)(value.sourcePlayerId) && nullable((item) => isStr(item, 16))(value.tag)
  && optional((item) => isNum(item, 0, 1e6))(value.time)

/** Structural check of a client battle result. Semantic checks against the spec stay with the match. */
export function isBattleResult(value: unknown): boolean {
  if (!isPlain(value)) return false
  const players = value.perPlayer
  return (value.reason === "cleared" || value.reason === "timeout" || value.reason === "forced") && isNum(value.time, 0, 1e5)
    && optional((item) => isInt(item, 0, 1e5))(value.killed) && optional((item) => isInt(item, 0, 1e5))(value.total)
    && isPlain(players) && isMap(players, RESULT_LIMITS.players, isId, isPerPlayer) && Object.keys(players).length > 0
    && (value.unspawned === undefined || isList(value.unspawned, RESULT_LIMITS.unspawned, isUnspawned))
    && optional((item) => isInt(item, 0, 1e9))(value.errors) && optional((item) => isNum(item, 0, BIG))(value.bossHpLeft)
}

export const LOADOUT_LIMITS: Readonly<{ entries: number; skillIndex: number }> = Object.freeze({ entries: 160, skillIndex: 9 })
/** The elite "no module" choice. */
export const MODULE_NONE: "none" = "none"

const isLoadoutEntry: Check = (value) => isPlain(value) && Object.keys(value).length > 0 && Object.keys(value).every((key) => key === "skill" || key === "module")
  && optional((item) => isInt(item, 0, LOADOUT_LIMITS.skillIndex))(value.skill) && optional(isId)(value.module)

export const isLoadoutEntries: Check = (value) => isMap(value, LOADOUT_LIMITS.entries, isId, isLoadoutEntry)

export interface LoadoutSkill {
  readonly index?: number
  readonly isDefault?: boolean
}

export interface LoadoutModule {
  readonly uniEquipId?: string
  readonly isDefault?: boolean
}

export interface ChessRecord {
  readonly isGolden?: boolean
  readonly visible?: boolean
  readonly isHidden?: boolean
  readonly isDiy?: boolean
  readonly baseId?: string
  readonly chessId?: string
  readonly goldenId?: string
  readonly skill?: { readonly index?: number } | null
  readonly skills?: readonly (LoadoutSkill | null)[] | null
  readonly modules?: readonly (LoadoutModule | null)[] | null
  readonly module?: { readonly active?: boolean; readonly id?: string } | null
}

export type ChessLookup = (id: string) => ChessRecord | null | undefined

function skillIndexesOf(chess: ChessRecord | null | undefined): number[] {
  if (!chess || typeof chess !== "object") return []
  if (Array.isArray(chess.skills) && chess.skills.length) {
    return [...new Set(chess.skills.map((skill) => skill && skill.index).filter((index) => isInt(index, 0, LOADOUT_LIMITS.skillIndex)))]
      .sort((left, right) => (left as number) - (right as number)) as number[]
  }
  return isInt(chess.skill?.index, 0, LOADOUT_LIMITS.skillIndex) ? [chess.skill?.index as number] : []
}

export interface LoadoutOptions {
  readonly skills: readonly number[]
  readonly defaultSkill: number | null
  readonly modules: readonly string[]
  readonly defaultModule: string | null
}

export function loadoutOptions(base: ChessRecord | null | undefined, golden: ChessRecord | null = null): LoadoutOptions {
  const normal = skillIndexesOf(base)
  const elite = golden ? skillIndexesOf(golden) : null
  const skills = elite && elite.length ? normal.filter((index) => elite.includes(index)) : normal
  const flagged = Array.isArray(base?.skills) ? base.skills.find((skill) => skill && skill.isDefault && isInt(skill.index, 0, LOADOUT_LIMITS.skillIndex)) : null
  let defaultSkill: number | null = flagged && isInt(flagged.index, 0, LOADOUT_LIMITS.skillIndex)
    ? flagged.index as number
    : isInt(base?.skill?.index, 0, LOADOUT_LIMITS.skillIndex) ? base?.skill?.index as number : null
  if (defaultSkill == null || !skills.includes(defaultSkill)) defaultSkill = skills.length ? skills[0] ?? defaultSkill : defaultSkill
  const modules: string[] = []
  let defaultModule: string | null = null
  if (golden) {
    let chosen: string | null = null
    if (Array.isArray(golden.modules)) {
      for (const mod of golden.modules) {
        if (mod && isId(mod.uniEquipId) && mod.uniEquipId !== MODULE_NONE && !modules.includes(mod.uniEquipId)) modules.push(mod.uniEquipId)
      }
      const marked = golden.modules.find((mod) => mod && mod.isDefault && isId(mod.uniEquipId))
      chosen = marked?.uniEquipId ?? null
    } else if (golden.module && golden.module.active && isId(golden.module.id)) {
      modules.push(golden.module.id as string)
    }
    if (chosen == null && golden.module && golden.module.active && golden.module.id && modules.includes(golden.module.id)) chosen = golden.module.id
    modules.push(MODULE_NONE)
    defaultModule = chosen || MODULE_NONE
  }
  return { skills, defaultSkill, modules, defaultModule }
}

export interface StoredLoadoutEntry {
  readonly skill: number
  readonly module: string | null
}

export type LoadoutCheck =
  | { ok: true; loadout: Record<string, StoredLoadoutEntry> }
  | { error: "BAD_MSG" | "BAD_TARGET"; detail: string }

function includesNumber(list: readonly number[], value: unknown): value is number {
  return typeof value === "number" && list.includes(value)
}

function includesString(list: readonly string[], value: unknown): value is string {
  return typeof value === "string" && list.includes(value)
}

/** Semantic check of `room.loadout.entries`. Unknown or illegal choices reject the whole map. Defaults are dropped. */
export function checkLoadout(entries: unknown, getChess: ChessLookup | null | undefined): LoadoutCheck {
  if (!isLoadoutEntries(entries)) return { error: "BAD_MSG", detail: "bad loadout entries" }
  const read = typeof getChess === "function" ? getChess : null
  const table = entries as Record<string, { skill?: number; module?: string }>
  const out: Record<string, StoredLoadoutEntry> = {}
  for (const id of Object.keys(table)) {
    const entry = table[id]
    if (!entry) return { error: "BAD_MSG", detail: "bad loadout entries" }
    const base = read ? read(id) : null
    if (!read || !base || base.isGolden || base.visible === false || base.isHidden || base.isDiy || (base.baseId && base.baseId !== id)) {
      return { error: "BAD_TARGET", detail: `unknown chess ${id}` }
    }
    const golden = base.goldenId ? read(base.goldenId) || null : null
    const options = loadoutOptions(base, golden)
    const skill = entry.skill ?? options.defaultSkill
    if (!includesNumber(options.skills, skill)) return { error: "BAD_TARGET", detail: `skill ${entry.skill} not available for ${id}` }
    if (entry.module !== undefined && !golden) return { error: "BAD_TARGET", detail: `${id} has no elite module` }
    const moduleId = golden ? (entry.module ?? options.defaultModule) : null
    if (golden && !includesString(options.modules, moduleId)) return { error: "BAD_TARGET", detail: `module ${entry.module} not available for ${id}` }
    if (skill === options.defaultSkill && moduleId === options.defaultModule) continue
    out[id] = { skill, module: moduleId }
  }
  return { ok: true, loadout: out }
}

export interface ResolvedLoadout {
  readonly skillIndex: number | null
  readonly moduleId: string | null
}

/** Skill index and module a board chess fights with under a checked loadout. */
export function resolveLoadout(
  loadout: Readonly<Record<string, { skill?: number; module?: string | null }>> | null | undefined,
  chess: ChessRecord | null | undefined,
  getChess: ChessLookup,
): ResolvedLoadout {
  if (!chess || typeof chess !== "object") return { skillIndex: null, moduleId: null }
  const baseId = (chess.baseId || chess.chessId) as string
  const base = chess.isGolden ? (getChess(baseId) || chess) : chess
  const golden = chess.isGolden ? chess : null
  const options = loadoutOptions(base, chess.isGolden ? chess : (base.goldenId ? getChess(base.goldenId) || null : null))
  const entry = loadout && Object.hasOwn(loadout, baseId) ? loadout[baseId] : null
  const skillIndex = entry && includesNumber(options.skills, entry.skill) ? entry.skill : options.defaultSkill
  let moduleId: string | null = null
  if (golden) moduleId = entry && includesString(options.modules, entry.module) ? entry.module : options.defaultModule
  return { skillIndex, moduleId }
}

interface StatSource {
  maxHp?: unknown
  atk?: unknown
  def?: unknown
  res?: unknown
  interval?: unknown
  bat?: unknown
  aspd?: unknown
  blockCnt?: unknown
  moveSpeed?: unknown
  flags?: { silence?: unknown }
}

const fin = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback)
const round1 = (value: number): number => Math.round(value * 10) / 10
const round2 = (value: number): number => Math.round(value * 100) / 100

function intervalOf(source: StatSource): number | null {
  if (typeof source.interval === "number" && Number.isFinite(source.interval) && source.interval > 0) return round2(source.interval)
  const bat = fin(source.bat, 0)
  const aspd = fin(source.aspd, 100) > 0 ? fin(source.aspd, 100) : 100
  return bat > 0 ? round2((bat * 100) / aspd) : null
}

export interface StatView {
  readonly maxHp: number
  readonly atk: number
  readonly def: number
  readonly res: number
  readonly interval: number | null
  readonly blockCnt: number
  readonly moveSpeed: number
}

function statView(source: StatSource): StatView {
  return {
    maxHp: Math.round(fin(source.maxHp)),
    atk: Math.round(fin(source.atk)),
    def: Math.round(fin(source.def)),
    res: round1(fin(source.res)),
    interval: intervalOf(source),
    blockCnt: Math.max(0, Math.round(fin(source.blockCnt))),
    moveSpeed: round2(fin(source.moveSpeed)),
  }
}

export interface UnitStatsEntry extends StatView {
  readonly id: number | null
  readonly uid: number | null
  readonly defId: string | null
  readonly hp: number
  readonly alive: boolean
  readonly base: StatView
  readonly range?: ReadonlyArray<readonly [number, number]>
  readonly silenced: boolean
}

interface StatsUnit {
  id?: unknown
  uid?: unknown
  defId?: unknown
  hp?: unknown
  alive?: unknown
  side?: unknown
  base?: StatSource
  liveRangeGrid?: unknown
}

/** Detail-card stats of one unit: effective stats beside the unbuffed base, plus current HP. */
export function unitStatsEntry(unit: StatsUnit | null | undefined, stats: StatSource | null = null): UnitStatsEntry {
  const base = unit && unit.base && typeof unit.base === "object" ? unit.base : {}
  const current = stats && typeof stats === "object" ? stats : base
  const grid = unit?.side !== "enemy" && Array.isArray(unit?.liveRangeGrid) ? unit.liveRangeGrid : null
  const range = grid
    ? grid.filter((point): point is [number, number] => Array.isArray(point) && Number.isInteger(point[0]) && Number.isInteger(point[1])).map((point) => [point[0], point[1]] as [number, number])
    : null
  return {
    id: Number.isInteger(unit?.id) ? unit?.id as number : null,
    uid: Number.isInteger(unit?.uid) ? unit?.uid as number : null,
    defId: typeof unit?.defId === "string" ? unit.defId : null,
    hp: Math.max(0, Math.round(fin(unit?.hp))),
    alive: unit?.alive !== false,
    ...statView(current),
    base: statView(base),
    ...(range ? { range } : {}),
    silenced: !!(current.flags && current.flags.silence),
  }
}

const isDir = (value: unknown): value is Dir => typeof value === "string" && (DIRS as readonly string[]).includes(value)

const target: Check = (value) => {
  if (!value || typeof value !== "object") return false
  const tile = value as { area?: unknown; row?: unknown; col?: unknown; idx?: unknown }
  if (tile.area === "board") return isInt(tile.row, 0, GEO.ROWS - 1) && isInt(tile.col, 0, GEO.COLS - 1)
  if (tile.area === "hand") return isInt(tile.idx, 0, GEO.HAND_SIZE - 1)
  return false
}

const isDifficulty = (value: unknown): value is Difficulty =>
  typeof value === "string" && (DIFFICULTIES as readonly string[]).includes(value)

const isEmote = (value: unknown): boolean => typeof value === "string" && EMOTES.includes(value)
const isRoomCode = (value: unknown): boolean => typeof value === "string" && value.length <= ROOM_CODE_LEN + 2 && /^[A-Za-z0-9]+$/.test(value)
const isHelloName = (value: unknown): boolean => typeof value === "string" && value.length <= NAME_MAX_LEN && value.trim().length > 0

/** Client → server field checks. `room.create` is only `mode` and `difficulty`. */
export const C2S: Readonly<Record<string, MessageSpec>> = {
  hello: { name: isHelloName, token: (value) => value == null || isStr(value, 64), version: (value) => value == null || isInt(value, 0, 1e6), $optional: ["token", "version"] },
  ping: { c: (value) => typeof value === "number" && Number.isFinite(value) },
  "room.create": { mode: (value) => value === "solo" || value === "coop", difficulty: isDifficulty },
  "room.join": { code: isRoomCode },
  "room.leave": {},
  "room.ready": { ready: isBool },
  "room.setDifficulty": { difficulty: isDifficulty },
  "room.addBot": {},
  "room.removeBot": { seat: (value) => isInt(value, 0, MAX_SEATS - 1) },
  "room.kick": { seat: (value) => isInt(value, 0, MAX_SEATS - 1), playerId: isId },
  "room.start": {},
  "room.loadout": { entries: isLoadoutEntries },
  "room.spectate": { code: isRoomCode },
  "room.removeSpectator": { playerId: isId },
  "g.infoReady": {},
  "g.band": { bandId: isId },
  "g.bandSkip": {},
  "g.bandFocus": { bandId: nullable(isId), $optional: ["bandId"] },
  "g.buy": { slot: (value) => isInt(value, 0, 15) },
  "g.refresh": {},
  "g.freeze": {},
  "g.levelUp": {},
  "g.sell": { uid: isUid },
  "g.move": { uid: isUid, to: target, dir: isDir, $optional: ["dir"] },
  "g.equip": { itemUid: isUid, targetUid: isUid, replaceUid: nullable(isUid), $optional: ["replaceUid"] },
  "g.art": { itemUid: isUid, row: (value) => isInt(value, 0, GEO.ROWS - 1), col: (value) => isInt(value, 0, GEO.COLS - 1), dir: isDir, $optional: ["dir"] },
  "g.destroy": { uid: isUid },
  "g.reward": { idx: (value) => isInt(value, 0, 5) },
  "g.choice": { idx: (value) => isInt(value, 0, 5) },
  "g.ready": { ready: isBool },
  "g.emote": { id: isEmote },
  "g.watch": { fieldId: (value) => isStr(value, 32) },
  "g.autoplay": { on: isBool },
  "g.pause": { on: isBool },
  "g.unitStats": { seq: (value) => isInt(value, 0, 2 ** 31), $optional: ["seq"] },
  "g.leave": {},
  "b.progress": {
    battleId: isId,
    gt: (value) => isNum(value, 0, 1e5),
    killed: (value) => isInt(value, 0, 1e5),
    total: (value) => isInt(value, 0, 1e5),
    leaks: (value) => isNum(value, 0, 1e6),
    bossDmg: (value) => isNum(value, 0, BIG),
    by: (value) => isMap(value, RESULT_LIMITS.players, isId, (item) => isNum(item, 0, BIG)),
    done: isBool,
    left: (value) => isMap(value, RESULT_LIMITS.players, isId, (item) => isInt(item, 0, 1e5)),
    $optional: ["leaks", "bossDmg", "by", "done", "left"],
  },
  "b.result": { battleId: isId, result: isBattleResult },
}

export const S2C = [
  "welcome", "ok", "error", "pong",
  "room.state", "room.closed",
  "m.public", "m.private", "m.field", "m.toast", "m.ticker", "m.emote", "m.result",
  "m.unitStats",
  "b.start", "b.pool", "b.end",
  "b.snap", "b.ev",
] as const

export type S2CType = (typeof S2C)[number]

/** `null` when the frame is valid, otherwise a short reason. Unknown extra fields are ignored. */
export function validateC2S(msg: unknown): string | null {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return "not an object"
  const record = msg as Record<string, unknown>
  const type = record.t
  const spec = typeof type === "string" && Object.hasOwn(C2S, type) ? C2S[type] : undefined
  if (!spec) return `unknown type ${String(type).slice(0, 32)}`
  if (record.rid != null && !isInt(record.rid, 0, 2 ** 31)) return "bad rid"
  const optionalFields = spec.$optional ?? []
  for (const [key, check] of Object.entries(spec)) {
    if (key === "$optional" || typeof check !== "function") continue
    const value = record[key]
    if (value === undefined && optionalFields.includes(key)) continue
    if (!check(value)) return `bad field ${key}`
  }
  return null
}

export const EV: Readonly<Record<string, string>> = Object.freeze({
  SPAWN: "spawn",
  ATK: "atk",
  DMG: "dmg",
  HEAL: "heal",
  SKILL: "skill",
  ENGAGE: "engage",
  DIE: "die",
  LEAK: "leak",
  STATUS: "status",
  FX: "fx",
  LAYER: "layer",
  BOUNTY: "bounty",
  DEPLOY: "deploy",
})

/** Model form carried by a `b.ev` fx tuple, or undefined when the tuple is not a form change. */
export function fxForm(event: unknown): string | null | undefined {
  if (!Array.isArray(event) || event[0] !== EV.FX) return undefined
  const extra = event[4]
  if (!extra || typeof extra !== "object" || (extra as { id?: unknown }).id == null || !Object.hasOwn(extra, "form")) return undefined
  const form = (extra as { form?: unknown }).form
  return typeof form === "string" ? form : null
}
