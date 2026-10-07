import packageJson from "../../../package.json" with { type: "json" }

/** Wire format number. Separate from the release string in `/healthz`. */
export const PROTOCOL_VERSION: number = 1

/** Release string shown by `/healthz`. Kept equal to this package's version. */
export const APP_VERSION: string = packageJson.version

export const MAX_SEATS: number = 4
export const MAX_SPECTATORS: number = 2
export const ROOM_CODE_LEN: number = 4
export const NAME_MAX_LEN: number = 12

export const DIFFICULTIES = ["FUNNY", "NORMAL", "HARD", "ABYSS"] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export const DIFFICULTY_NAMES: Readonly<Record<Difficulty, string>> = {
  FUNNY: "标准模拟",
  NORMAL: "险境模拟",
  HARD: "绝境模拟",
  ABYSS: "终极模拟",
}

export const DIFFICULTY_COLORS: Readonly<Record<Difficulty, string>> = {
  FUNNY: "#f6a329",
  NORMAL: "#e85a1a",
  HARD: "#e73118",
  ABYSS: "#ff0024",
}

/** `config.modes` id: `mode_single_*` for solo, `mode_multi_*` otherwise. */
export function modeIdFor(roomMode: string, difficulty: string): string {
  return `mode_${roomMode === "solo" ? "single" : "multi"}_${difficulty.toLowerCase()}`
}

interface PhaseMap {
  readonly LOBBY: "LOBBY"
  readonly INFO_CHECK: "INFO_CHECK"
  readonly BAND_DRAFT: "BAND_DRAFT"
  readonly BATTLE_CHECK: "BATTLE_CHECK"
  readonly ROUND_START: "ROUND_START"
  readonly SP_DRAFT: "SP_DRAFT"
  readonly PREP: "PREP"
  readonly COMBAT: "COMBAT"
  readonly UNITE: "UNITE"
  readonly SETTLE: "SETTLE"
  readonly FINAL_ASSAULT: "FINAL_ASSAULT"
  readonly HIDDEN_CORE: "HIDDEN_CORE"
  readonly RESULT: "RESULT"
}

export const PHASE: PhaseMap = Object.freeze({
  LOBBY: "LOBBY",
  INFO_CHECK: "INFO_CHECK",
  BAND_DRAFT: "BAND_DRAFT",
  BATTLE_CHECK: "BATTLE_CHECK",
  ROUND_START: "ROUND_START",
  SP_DRAFT: "SP_DRAFT",
  PREP: "PREP",
  COMBAT: "COMBAT",
  UNITE: "UNITE",
  SETTLE: "SETTLE",
  FINAL_ASSAULT: "FINAL_ASSAULT",
  HIDDEN_CORE: "HIDDEN_CORE",
  RESULT: "RESULT",
})

export type Phase = (typeof PHASE)[keyof typeof PHASE]

export const PHASE_NAMES: Readonly<Record<Phase, string>> = {
  LOBBY: "等待中",
  INFO_CHECK: "确认本局信息",
  BAND_DRAFT: "选择策略",
  BATTLE_CHECK: "协议启动",
  ROUND_START: "回合开始",
  SP_DRAFT: "机变阶段",
  PREP: "休整期",
  COMBAT: "作战中",
  UNITE: "联防阶段",
  SETTLE: "结算",
  FINAL_ASSAULT: "最终攻势",
  HIDDEN_CORE: "隐秘核心",
  RESULT: "模拟结束",
}

/** Board geometry on the 19×21 stage. Row 0 is the bottom. */
interface GeometryRect {
  readonly r0: number
  readonly r1: number
  readonly c0: number
  readonly c1: number
}

interface Geometry {
  readonly ROWS: number
  readonly COLS: number
  readonly FIELD: GeometryRect
  readonly NORMAL_RECT: GeometryRect
  readonly UNITE_RECT: GeometryRect
  readonly BOSS_RECT: GeometryRect
  readonly HAND_ROW: number
  readonly HAND_SIZE: number
  readonly TEMP_ROW: number
  readonly TEMP_C0: number
  readonly TEMP_SIZE: number
  readonly PARTNER_COL_OFFSET: number
}

export const GEO: Geometry = Object.freeze({
  ROWS: 19,
  COLS: 21,
  FIELD: Object.freeze({ r0: 9, r1: 12, c0: 2, c1: 10 }),
  NORMAL_RECT: Object.freeze({ r0: 9, r1: 12, c0: 0, c1: 10 }),
  UNITE_RECT: Object.freeze({ r0: 9, r1: 12, c0: 0, c1: 20 }),
  BOSS_RECT: Object.freeze({ r0: 0, r1: 5, c0: 0, c1: 20 }),
  HAND_ROW: 7,
  HAND_SIZE: 10,
  TEMP_ROW: 8,
  TEMP_C0: 4,
  TEMP_SIZE: 5,
  PARTNER_COL_OFFSET: 8,
})

export type PlacementClass = "melee" | "ranged" | "all"

interface PlacementModule {
  readonly uniEquipId?: string
  readonly meleeOnHighGround?: boolean
}

/** Whether `moduleId` is a module that lets a melee chess stand on a ranged tile. */
export function moduleMeleeOnHighGround(modules: readonly PlacementModule[] | null | undefined, moduleId: string | null | undefined): boolean {
  if (typeof moduleId !== "string" || moduleId.length === 0 || !Array.isArray(modules)) return false
  for (const mod of modules) {
    if (mod && mod.uniEquipId === moduleId) return mod.meleeOnHighGround === true
  }
  return false
}

/** Placement class from `position`. Melee stays ground-only unless `meleeOnHighGround` is set. */
export function placementClass(position: string | null | undefined, meleeOnHighGround = false): PlacementClass {
  const kind = typeof position === "string" ? position.toUpperCase() : "ALL"
  if (kind === "MELEE") return meleeOnHighGround ? "all" : "melee"
  if (kind === "RANGED") return "ranged"
  return "all"
}

interface AreaMap {
  readonly BOARD: "board"
  readonly HAND: "hand"
  readonly TEMP: "temp"
  readonly OUTSIDE: "outside"
}

export const AREA: AreaMap = Object.freeze({
  BOARD: "board",
  HAND: "hand",
  TEMP: "temp",
  OUTSIDE: "outside",
})

interface PieceKindMap {
  readonly CHESS: "chess"
  readonly ITEM: "item"
  readonly TOKEN: "token"
}

export const PIECE_KIND: PieceKindMap = Object.freeze({
  CHESS: "chess",
  ITEM: "item",
  TOKEN: "token",
})

/** A skill summon's placed piece also deploys once, free, at battle start. */
export const SKILL_SUMMON_START_DEPLOY: boolean = true

/** Per-bond layer cap. A gain at the cap adds 0. */
export const BOND_LAYER_CAP: number = 999

/**
 * Layers a gain of `gain` adds to a bond that already holds `before`.
 * Non-positive or non-finite gains add 0, except +Infinity, which fills the room left.
 */
export function layerGainRoom(before: number, gain: number): number {
  if (!(gain > 0)) return 0
  const cap = BOND_LAYER_CAP > 0 ? BOND_LAYER_CAP : Infinity
  const held = Number.isFinite(before) && before > 0 ? before : 0
  return Math.max(0, Math.min(gain, cap - held))
}

/** A single hit whose ceil(damage) reaches this on a boss-battle leader is cancelled. */
export const BOSS_HIT_LIMIT: number = 300000

/** Snapshot unit flag bits. */
interface UnitFlagMap {
  readonly BLOCKED: number
  readonly STUNNED: number
  readonly FROZEN: number
  readonly STEALTH: number
  readonly SKILL: number
  readonly SHIELD: number
  readonly INVULN: number
  readonly COLD: number
  readonly SLEEP: number
  readonly FLYING: number
}

export const UF: UnitFlagMap = Object.freeze({
  BLOCKED: 1,
  STUNNED: 2,
  FROZEN: 4,
  STEALTH: 8,
  SKILL: 16,
  SHIELD: 32,
  INVULN: 64,
  COLD: 128,
  SLEEP: 256,
  FLYING: 512,
})

interface AnimationMap {
  readonly IDLE: number
  readonly MOVE: number
  readonly ATTACK: number
  readonly SKILL: number
  readonly DIE: number
  readonly DEPLOY: number
}

export const ANIM: AnimationMap = Object.freeze({
  IDLE: 0,
  MOVE: 1,
  ATTACK: 2,
  SKILL: 3,
  DIE: 4,
  STUN: 5,
  DEPLOY: 6,
})

/** Deploy directions. The same list the battle uses. */
export const DIRS: readonly ["UP", "RIGHT", "DOWN", "LEFT"] = Object.freeze(["UP", "RIGHT", "DOWN", "LEFT"] as const)
export type Dir = (typeof DIRS)[number]

interface ErrorMap {
  readonly BAD_MSG: "BAD_MSG"
  readonly RATE: "RATE"
  readonly NOT_IN_ROOM: "NOT_IN_ROOM"
  readonly ROOM_NOT_FOUND: "ROOM_NOT_FOUND"
  readonly ROOM_FULL: "ROOM_FULL"
  readonly ROOM_STARTED: "ROOM_STARTED"
  readonly NOT_HOST: "NOT_HOST"
  readonly NOT_READY: "NOT_READY"
  readonly WRONG_PHASE: "WRONG_PHASE"
  readonly NO_FUNDS: "NO_FUNDS"
  readonly HAND_FULL: "HAND_FULL"
  readonly BOARD_FULL: "BOARD_FULL"
  readonly BAD_TILE: "BAD_TILE"
  readonly BAD_TARGET: "BAD_TARGET"
  readonly SOLD_OUT: "SOLD_OUT"
  readonly MAX_LEVEL: "MAX_LEVEL"
  readonly NOT_YOUR_TURN: "NOT_YOUR_TURN"
  readonly ALREADY: "ALREADY"
  readonly TEMP_NOT_EMPTY: "TEMP_NOT_EMPTY"
  readonly ELIMINATED: "ELIMINATED"
  readonly SPECTATOR: "SPECTATOR"
  readonly INTERNAL: "INTERNAL"
}

export const ERR: ErrorMap = Object.freeze({
  BAD_MSG: "BAD_MSG",
  RATE: "RATE",
  NOT_IN_ROOM: "NOT_IN_ROOM",
  ROOM_NOT_FOUND: "ROOM_NOT_FOUND",
  ROOM_FULL: "ROOM_FULL",
  ROOM_STARTED: "ROOM_STARTED",
  NOT_HOST: "NOT_HOST",
  NOT_READY: "NOT_READY",
  WRONG_PHASE: "WRONG_PHASE",
  NO_FUNDS: "NO_FUNDS",
  HAND_FULL: "HAND_FULL",
  BOARD_FULL: "BOARD_FULL",
  BAD_TILE: "BAD_TILE",
  BAD_TARGET: "BAD_TARGET",
  SOLD_OUT: "SOLD_OUT",
  MAX_LEVEL: "MAX_LEVEL",
  NOT_YOUR_TURN: "NOT_YOUR_TURN",
  ALREADY: "ALREADY",
  TEMP_NOT_EMPTY: "TEMP_NOT_EMPTY",
  ELIMINATED: "ELIMINATED",
  SPECTATOR: "SPECTATOR",
  INTERNAL: "INTERNAL",
})

export type ErrCode = (typeof ERR)[keyof typeof ERR]

export const ERR_TEXT: Readonly<Record<ErrCode, string>> = {
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
}

interface Emote {
  readonly id: string
  readonly sortId: number
  readonly picId: string
  readonly label: string
}

interface EmoteTheme {
  readonly themeId: string
  readonly dir: string
  readonly sortId: number
  readonly isBasic: boolean
  readonly name: string
  readonly emotes: readonly Emote[]
}

function emo(id: string, sortId: number, picId: string, label: string): Emote {
  return Object.freeze({ id, sortId, picId, label })
}

export const EMOTE_THEMES: readonly EmoteTheme[] = Object.freeze([
  { themeId: "emoticon_autochess_basic", dir: "basic", sortId: 100000, isBasic: true, name: "表情套组：卫戍协议", emotes: [
    emo("autochess_battle_happy", 1001, "pic_happy_battle", "开心"),
    emo("autochess_battle_scared", 1002, "pic_scared_battle", "害怕"),
    emo("autochess_battle_sorry", 1003, "pic_sorry_battle", "对不起"),
    emo("autochess_battle_thanks", 1004, "pic_thanks_battle", "谢谢"),
    emo("autochess_battle_thinking", 1005, "pic_thinking_battle", "思考"),
    emo("autochess_battle_nice_cooperate", 1006, "pic_cooperate_battle", "合作愉快"),
  ] },
  { themeId: "emoticon_originium_slug", dir: "slug", sortId: 1001, isBasic: false, name: "表情套组：虫动", emotes: [
    emo("slug_autochess_battle_nice_work", 2001, "pic_nice_work_battle", "合作愉快！"),
    emo("slug_autochess_battle_thanks", 2002, "pic_thanks_battle", "谢谢！"),
    emo("slug_autochess_battle_sorry", 2003, "pic_sorry_battle", "对不起！"),
    emo("slug_autochess_battle_bye", 2004, "pic_bye_battle", "再见！"),
    emo("slug_autochess_battle_distrust", 2005, "pic_distrust_battle", "？？？"),
    emo("slug_autochess_battle_very_soon", 2006, "pic_very_soon_battle", "很快就好！"),
  ] },
  { themeId: "emoticon_autochess_basic_2", dir: "basic_2", sortId: 100001, isBasic: true, name: "表情套组：卫戍协议", emotes: [
    emo("autochess_battle_noproblem", 1007, "pic_noproblem_battle", "没问题！"),
    emo("autochess_battle_respect", 1008, "pic_respect_battle", "敬礼！"),
    emo("autochess_battle_call", 1009, "pic_call_battle", "欢呼！"),
    emo("autochess_battle_playingcool", 1010, "pic_playingcool_battle", "酷！"),
    emo("autochess_battle_sad", 1011, "pic_sad_battle", "伤心"),
    emo("autochess_battle_dying", 1012, "pic_dying_battle", "快死了"),
  ] },
  { themeId: "emoticon_foolsday_doctor", dir: "fooldoctor", sortId: 1002, isBasic: false, name: "表情套组：博士士", emotes: [
    emo("autochess_battle_fooldoctor_01", 1020, "pic_fooldoctor_01_battle", "博士士 1"),
    emo("autochess_battle_fooldoctor_02", 1021, "pic_fooldoctor_02_battle", "博士士 2"),
    emo("autochess_battle_fooldoctor_03", 1022, "pic_fooldoctor_04_battle", "博士士 3"),
    emo("autochess_battle_fooldoctor_04", 1023, "pic_fooldoctor_05_battle", "博士士 4"),
    emo("autochess_battle_fooldoctor_05", 1024, "pic_fooldoctor_06_battle", "博士士 5"),
    emo("autochess_battle_fooldoctor_06", 1025, "pic_fooldoctor_08_battle", "博士士 6"),
  ] },
  { themeId: "emoticon_foolsday_amiya", dir: "foolamiya", sortId: 1003, isBasic: false, name: "表情套组：米米子", emotes: [
    emo("autochess_battle_foolamiya_01", 1040, "pic_foolamiya_01_battle", "米米子 1"),
    emo("autochess_battle_foolamiya_02", 1041, "pic_foolamiya_02_battle", "米米子 2"),
    emo("autochess_battle_foolamiya_03", 1042, "pic_foolamiya_03_battle", "米米子 3"),
    emo("autochess_battle_foolamiya_04", 1043, "pic_foolamiya_04_battle", "米米子 4"),
    emo("autochess_battle_foolamiya_05", 1044, "pic_foolamiya_05_battle", "米米子 5"),
    emo("autochess_battle_foolamiya_06", 1045, "pic_foolamiya_06_battle", "米米子 6"),
  ] },
  { themeId: "emoticon_foolsday_wisdel", dir: "foolwisdel", sortId: 1004, isBasic: false, name: "表情套组：维维美", emotes: [
    emo("autochess_battle_foolwisdel_01", 1060, "pic_foolwisdel_01_battle", "维维美 1"),
    emo("autochess_battle_foolwisdel_02", 1061, "pic_foolwisdel_02_battle", "维维美 2"),
    emo("autochess_battle_foolwisdel_03", 1062, "pic_foolwisdel_03_battle", "维维美 3"),
    emo("autochess_battle_foolwisdel_04", 1063, "pic_foolwisdel_04_battle", "维维美 4"),
    emo("autochess_battle_foolwisdel_05", 1064, "pic_foolwisdel_05_battle", "维维美 5"),
    emo("autochess_battle_foolwisdel_06", 1065, "pic_foolwisdel_06_battle", "维维美 6"),
  ] },
].map((theme) => Object.freeze({ ...theme, emotes: Object.freeze(theme.emotes) })))

export interface EmoteCatalogEntry extends Emote {
  readonly themeId: string
  readonly dir: string
}

export const EMOTE_CATALOG: readonly EmoteCatalogEntry[] = Object.freeze(
  EMOTE_THEMES.flatMap((theme) => theme.emotes.map((entry) => Object.freeze({ ...entry, themeId: theme.themeId, dir: theme.dir }))),
)

/** Official emote ids. `g.emote` accepts only these. */
export const EMOTES: readonly string[] = Object.freeze(EMOTE_CATALOG.map((entry) => entry.id))

const EMOTE_INDEX: ReadonlyMap<string, EmoteCatalogEntry> = new Map(EMOTE_CATALOG.map((entry) => [entry.id, entry]))

/** Catalog record of an emote id, or null. A wire id such as `__proto__` does not resolve. */
export function emoteInfo(id: unknown): EmoteCatalogEntry | null {
  if (typeof id !== "string") return null
  return EMOTE_INDEX.get(id) ?? null
}

function emoteMap<T>(pick: (entry: EmoteCatalogEntry) => T): Readonly<Record<string, T>> {
  const map = Object.create(null) as Record<string, T>
  for (const entry of EMOTE_CATALOG) map[entry.id] = pick(entry)
  return Object.freeze(map)
}

export const EMOTE_THEME: Readonly<Record<string, string>> = emoteMap((entry) => entry.themeId)
export const EMOTE_LABEL: Readonly<Record<string, string>> = emoteMap((entry) => entry.label)

export function emoteArtGroup(id: unknown): string | null {
  const entry = emoteInfo(id)
  return entry ? `emoticon/${entry.dir}` : null
}

export function emoteArtPath(id: unknown): string | null {
  const entry = emoteInfo(id)
  return entry ? `/assets/ui/emoticon/${entry.dir}/${entry.picId}.png` : null
}

export const EMOTE_COOLDOWN_MS: number = 1000
export const EMOTE_BUBBLE_MS: number = 3000
