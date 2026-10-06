// 从 excel/audio_data.json 取出单位音效、BGM 和界面音效。
// 一条路径列表就是银行本身：mixOf 用这份数组的引用找回播放概率和音量。

const prefixPattern: RegExp = /^audio\/sound_beta_2\//i

export function assetToPath(asset: unknown): string | null {
  if (typeof asset !== "string" || !asset) return null
  const path = asset.replace(prefixPattern, "").replace(/\\/g, "/").toLowerCase()
  if (!path || path.includes("..")) return null
  return path.endsWith(".mp3") ? path : path + ".mp3"
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000

export interface BankMix {
  readonly p?: number
  readonly vol?: number
}

export function bankMix(sounds: unknown, path: string): BankMix | null {
  let total = 0
  let real = 0
  let volume = 1
  let found = false
  for (const item of Array.isArray(sounds) ? sounds : []) {
    const sound = item && typeof item === "object" ? (item as Record<string, unknown>) : null
    const weight = Number(sound?.["weight"])
    const wt = Number.isFinite(weight) && weight > 0 ? weight : 0
    total += wt
    const file = assetToPath(sound?.["asset"])
    if (!file) continue
    real += wt
    if (!found && file === path) {
      found = true
      const lo = Number(sound?.["minVolume"])
      const hi = Number(sound?.["maxVolume"])
      if (Number.isFinite(lo) && Number.isFinite(hi) && lo >= 0 && hi >= 0) volume = round3((lo + hi) / 2)
    }
  }
  const out: { p?: number; vol?: number } = {}
  if (total > 0 && real < total) out.p = round3(real / total)
  if (volume !== 1) out.vol = volume
  return Object.keys(out).length ? out : null
}

export interface BgmTrack {
  readonly intro: string | null
  readonly loop: string
}

export interface AudioIndex {
  readonly bank: (name: string) => readonly string[]
  readonly bgm: (name: string) => BgmTrack | null
  readonly unitBanks: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>
  readonly skillBanks: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>
  readonly mixOf: (paths: readonly string[] | null | undefined) => BankMix | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function indexAudio(audioData: unknown): AudioIndex {
  const root = asRecord(audioData)
  const banks = new Map<string, string[]>()
  const mixes = new WeakMap<object, BankMix>()
  const fxBanks = Array.isArray(root?.["soundFXBanks"]) ? root["soundFXBanks"] : []
  for (const item of fxBanks) {
    const row = asRecord(item)
    const name = row && typeof row["name"] === "string" ? row["name"] : null
    if (!name) continue
    const sounds = row?.["sounds"]
    const paths = (Array.isArray(sounds) ? sounds : []).map((sound) => assetToPath(asRecord(sound)?.["asset"])).filter((path): path is string => path !== null)
    let list = banks.get(name)
    if (!list) {
      list = []
      banks.set(name, list)
    }
    for (const path of paths) if (!list.includes(path)) list.push(path)
    if (list.length && !mixes.has(list)) {
      const mix = bankMix(sounds, list[0] ?? "")
      if (mix) mixes.set(list, mix)
    }
  }
  const aliasRow = asRecord(root?.["bankAlias"]) ?? {}
  const bank = (name: string, depth = 0): readonly string[] => {
    const direct = banks.get(name)
    if (direct && direct.length) return direct
    const next = aliasRow[name]
    if (depth < 4 && typeof next === "string") return bank(next, depth + 1)
    return []
  }
  const bgmBanks = new Map<string, BgmTrack>()
  const bgmRows = Array.isArray(root?.["bgmBanks"]) ? root["bgmBanks"] : []
  for (const item of bgmRows) {
    const row = asRecord(item)
    if (!row || typeof row["name"] !== "string" || typeof row["loop"] !== "string") continue
    const loop = assetToPath(row["loop"])
    if (!loop) continue
    const intro = typeof row["intro"] === "string" ? assetToPath(row["intro"]) : null
    bgmBanks.set(row["name"], { intro, loop })
  }
  const bgm = (name: string, depth = 0): BgmTrack | null => {
    const direct = bgmBanks.get(name)
    if (direct) return direct
    const next = aliasRow[name]
    if (depth < 4 && typeof next === "string") return bgm(next, depth + 1)
    return null
  }
  const unitBanks = new Map<string, Map<string, readonly string[]>>()
  const skillBanks = new Map<string, Map<string, readonly string[]>>()
  const addUnit = (name: string, paths: readonly string[]): void => {
    const parts = name.split(".")
    const head = parts[0]
    const event = parts[1]
    const unit = parts[2]
    if (!head || !event || !unit || parts.length < 3 || head !== "battle") return
    if (/^ON_SKILL_(START|FINISH|SPECIAL_POINT)$/.test(event)) {
      const skillId = parts.slice(2).join(".")
      let table = skillBanks.get(skillId)
      if (!table) {
        table = new Map()
        skillBanks.set(skillId, table)
      }
      table.set(event, paths)
      return
    }
    if (!/^(char|enemy|token|trap)_/.test(unit)) return
    const key = event + (parts.length > 3 ? "." + parts.slice(3).join(".") : "")
    let table = unitBanks.get(unit)
    if (!table) {
      table = new Map()
      unitBanks.set(unit, table)
    }
    table.set(key, paths)
  }
  for (const [name, paths] of banks) if (paths.length) addUnit(name, paths)
  for (const name of Object.keys(aliasRow)) {
    if (banks.has(name)) continue
    const paths = bank(name)
    if (paths.length) addUnit(name, paths)
  }
  const mixOf = (paths: readonly string[] | null | undefined): BankMix | null => {
    if (!paths || typeof paths !== "object") return null
    return mixes.get(paths) ?? null
  }
  return { bank, bgm, unitBanks, skillBanks, mixOf }
}

function abilityOrder(a: string, b: string): number {
  const na = a.split(".").length
  const nb = b.split(".").length
  if (na !== nb) return na - nb
  return a.localeCompare(b, "en", { numeric: true })
}

function firstMatching(
  banks: ReadonlyMap<string, readonly string[]>,
  event: string,
  abilities: readonly string[],
  ok: (paths: readonly string[]) => boolean = () => true,
): readonly string[] | null {
  const keys = [...banks.keys()].filter((key) => key.startsWith(event + "."))
  for (const ability of abilities) {
    const exact = `${event}.${ability}`
    const direct = banks.get(exact)
    if (direct?.length && ok(direct)) return direct
    const numbered = keys.filter((key) => key.startsWith(exact + ".")).sort(abilityOrder)
    for (const key of numbered) {
      const paths = banks.get(key)
      if (paths?.length && ok(paths)) return paths
    }
  }
  return null
}

const skillModeFile: RegExp = /_(d|h|s)\d*\.mp3$/i

export function normalModeBank(paths: readonly string[] | null | undefined): boolean {
  return Array.isArray(paths) && paths.length > 0 && !paths.some((path) => skillModeFile.test(path))
}

export interface UnitSfx {
  attack?: readonly string[]
  hit?: readonly string[]
  die?: readonly string[]
  born?: readonly string[]
}

export interface UnitSfxOptions {
  readonly operator?: boolean
  readonly projectile?: {
    readonly born?: readonly string[]
    readonly hit?: readonly string[]
  }
}

export function pickUnitSfx(banks: ReadonlyMap<string, readonly string[]> | undefined, options: UnitSfxOptions = {}): UnitSfx {
  const out: UnitSfx = {}
  const projectile = options.projectile ?? {}
  if ((!banks || !banks.size) && !projectile.born?.length && !projectile.hit?.length) return out
  const table = banks ?? new Map<string, readonly string[]>()
  const ok = options.operator ? normalModeBank : (): boolean => true
  const attackLike = (event: string): readonly string[] | null => {
    const keys = [...table.keys()]
      .filter((key) => key.startsWith(event + ".") && /attack|combat/i.test(key.slice(event.length + 1).split(".")[0] ?? ""))
      .sort(abilityOrder)
    for (const key of keys) {
      const paths = table.get(key)
      if (paths?.length && ok(paths)) return paths
    }
    return null
  }
  const exact = (event: string): readonly string[] | null =>
    ["attack", "combat"].map((ability) => table.get(`${event}.${ability}`)).find((paths) => paths?.length && ok(paths)) ?? null
  const own = (paths: readonly string[] | undefined): readonly string[] | null => (paths?.length && ok(paths) ? paths : null)
  const plain = options.operator ? (exact("ON_ABILITY_START") ?? exact("ON_ABILITY_ON")) : null
  const attack =
    plain ??
    firstMatching(table, "ON_ABILITY_START", ["attack", "combat"], ok) ??
    firstMatching(table, "ON_ABILITY_ON", ["attack", "combat"], ok) ??
    own(projectile.born) ??
    attackLike("ON_ABILITY_START") ??
    attackLike("ON_ABILITY_ON")
  const hit = firstMatching(table, "ON_ABILITY_HIT", ["attack", "combat"], ok) ?? own(projectile.hit) ?? attackLike("ON_ABILITY_HIT")
  if (attack) out.attack = attack
  if (hit) out.hit = hit
  const die = table.get("ON_UNIT_DEAD")
  const born = table.get("ON_UNIT_BORN")
  if (die?.length) out.die = die
  if (born?.length) out.born = born
  return out
}

export type SoundSpec = { readonly path: string } | { readonly bank: string }

export const uiSfx: Readonly<Record<string, SoundSpec>> = Object.freeze({
  click: { path: "general/g_ui/g_ui_btn_h.mp3" },
  back: { path: "general/g_ui/g_ui_btn_u.mp3" },
  confirm: { path: "general/g_ui/g_ui_confirm_h.mp3" },
  tab: { path: "general/g_ui/g_ui_tabswitch.mp3" },
  pick: { path: "general/g_ui/g_ui_pick.mp3" },
  drop: { path: "general/g_ui/g_ui_unpick.mp3" },
  error: { path: "general/g_ui/g_ui_scwarning.mp3" },
  buy: { bank: "battle.ON_ACT1AUTOCHESS_MAGIC_PLACE_HAND" },
  sell: { bank: "ui.ON_ACT1AUTOCHESS_GETMONEY" },
  income: { bank: "ui.ON_ACT1AUTOCHESS_GETMONEY" },
  refresh: { path: "general/g_ui/g_ui_rtargetrefresh.mp3" },
  freeze: { bank: "ui.ON_ACT1AUTOCHESS_SHOP_LOCK" },
  levelup: { bank: "ui.ON_ACT1AUTOCHESS_SHOP_UPGRADE" },
  merge: { bank: "battle.ON_ACT1AUTOCHESS_CHAR_BONUS" },
  equip: { bank: "battle.ON_ACT1AUTOCHESS_EQUIP_DONE" },
  itemMerge: { bank: "battle.ON_ACT1AUTOCHESS_EQUIP_BONUS" },
  bondUp: { bank: "battle.ON_ACT1AUTOCHESS_ADD_BOND" },
  artPlace: { bank: "battle.ON_ACT1AUTOCHESS_MAGIC_PLACE_BATTLE" },
  ready: { bank: "ui.ON_ACT1AUTOCHESS_PLAYER_READY" },
  timer: { bank: "ui.ON_ACT1AUTOCHESS_COUNTDOWN" },
  draft: { bank: "ui.ON_ACT1AUTOCHESS_STRATEGY" },
  yourTurn: { bank: "ui.ON_ACT1AUTOCHESS_YOURTURN" },
  yourTurnCircle: { bank: "ui.ON_ACT1AUTOCHESS_YOURTURN_CIRCLE" },
  target: { bank: "ui.ON_ACT1AUTOCHESS_TARGET" },
  broadcast: { bank: "ui.ON_ACT1AUTOCHESS_BROADCASTHINT" },
  danger: { bank: "battle.ON_ACT1AUTOCHESS_ENTER_DANGER" },
  emote: { bank: "ui.ON_ACT1AUTOCHESS_EMOJIDIALOGUE" },
  roundStart: { bank: "ui.ON_ACT1AUTOCHESS_ROUNDSTART" },
  rest: { bank: "ui.ON_ACT1AUTOCHESS_REST" },
  battleStart: { bank: "ui.ON_ACT1AUTOCHESS_BATTLESTART" },
  battleStartBoss: { bank: "ui.ON_ACT1AUTOCHESS_BATTLESTART_BOSS" },
  bossRoundTeam: { bank: "ui.ON_ACT1AUTOCHESS_BOSSROUND_TEAM" },
  bossRoundSingle: { bank: "ui.ON_ACT1AUTOCHESS_BOSSROUND_SINGLE" },
  bossRoundSecret: { bank: "ui.ON_ACT1AUTOCHESS_BOSSROUND_SECRET" },
  killBoss: { bank: "ui.ON_ACT1AUTOCHESS_KILLBOSS" },
  killBossAll: { bank: "ui.ON_ACT1AUTOCHESS_KILLBOSS_ALL" },
  killBossNormal: { bank: "ui.ON_ACT1AUTOCHESS_KILLBOSS_NORMAL" },
  defenceStart: { bank: "ui.ON_ACT1AUTOCHESS_DEFENCE_START" },
  defenceUnite: { bank: "ui.ON_ACT1AUTOCHESS_DEFENCE_UNITE" },
  battleOverReduce: { bank: "ui.ON_ACT1AUTOCHESS_BATTLEOVER_REDUCE" },
  battleOverNoReduce: { bank: "ui.ON_ACT1AUTOCHESS_BATTLEOVER_NOREDUCE" },
  battleOverNormal: { bank: "ui.ON_ACT1AUTOCHESS_BATTLEOVER_NORMAL" },
  goFirst: { bank: "ui.ON_ACT1AUTOCHESS_GOFIRST" },
  disconnect: { bank: "ui.ON_ACT1AUTOCHESS_DISCONNECT" },
  settlementSucceed: { bank: "ui.ON_ACT1AUTOCHESS_SETTLEMENT_SUCCEED" },
  settlementFail: { bank: "ui.ON_ACT1AUTOCHESS_SETTLEMENT_FAIL" },
  settlementTeam: { bank: "ui.ON_ACT1AUTOCHESS_SETTLEMENT_TEAM" },
  settlementBossSign: { bank: "ui.ON_ACT1AUTOCHESS_SETTLEMENT_BOSSSIGN" },
  goodEvaluation: { bank: "ui.ON_ACT1AUTOCHESS_GOODEVALUATION" },
  load: { bank: "ui.ON_ACT1AUTOCHESS_LOAD" },
  start: { bank: "ui.ON_ACT1AUTOCHESS_START" },
  matchSucceed: { bank: "ui.ON_ACT1AUTOCHESS_MATCH_SUCCEED" },
  matchFail: { bank: "ui.ON_ACT1AUTOCHESS_MATCH_FAIL" },
  matchCancel: { bank: "ui.ON_ACT1AUTOCHESS_MATCH_CANCEL" },
  joinRoom: { bank: "ui.ON_ACT1AUTOCHESS_PLAYER_JOINROOM" },
})

export const battleSfx: Readonly<Record<string, SoundSpec>> = Object.freeze({
  deploy: { path: "battle/b_char/b_char_set.mp3" },
  tokenDeploy: { path: "battle/b_char/b_char_tokenset.mp3" },
  charDie: { path: "battle/b_char/b_char_dead.mp3" },
  enemyDie: { path: "battle/b_enemy/b_enemy_dead_n.mp3" },
  enemyDieHeavy: { path: "battle/b_enemy/b_enemy_dead_h.mp3" },
  enemyHit: { path: "enemy/e_imp/e_imp_general_w.mp3" },
  heal: { bank: "battle.ON_MODIFIER_HEAL" },
  win: { path: "battle/b_ui/b_ui_win.mp3" },
  lose: { path: "battle/b_ui/b_ui_lose.mp3" },
  killCoin: { bank: "battle.ON_CUSTOM_TRIGGER.autochess_kill_gain_coin" },
})

export function resolveSpec(spec: SoundSpec, bank: (name: string) => readonly string[]): readonly string[] {
  if ("path" in spec) return [spec.path]
  return bank(spec.bank)
}

export const voiceDirs: Readonly<Record<string, string>> = Object.freeze({
  cn: "voice_cn",
  jp: "voice",
  en: "voice_en",
  kr: "voice_kr",
})

export type VoiceLang = "cn" | "jp" | "en" | "kr"

export const voiceSlotNames: Readonly<Record<string, string>> = Object.freeze({
  BATTLE_START: "start",
  BATTLE_FACE_ENEMY: "faceEnemy",
  BATTLE_SELECT: "select",
  BATTLE_PLACE: "place",
  BATTLE_SKILL_1: "skill1",
  BATTLE_SKILL_2: "skill2",
  BATTLE_SKILL_3: "skill3",
  BATTLE_SKILL_4: "skill4",
  SQUAD: "squad",
  SQUAD_FIRST: "squadFirst",
  FOUR_STAR: "resultFour",
  THREE_STAR: "resultThree",
  TWO_STAR: "resultTwo",
  LOSE: "resultLose",
  GACHA: "gacha",
})

export const voiceBattleSlots: readonly string[] = Object.freeze([
  "start",
  "faceEnemy",
  "select",
  "place",
  "skill1",
  "skill2",
  "skill3",
  "skill4",
  "resultFour",
  "resultThree",
  "resultTwo",
  "resultLose",
])

export const voicePrepSlots: readonly string[] = Object.freeze(["gacha", "squad", "squadFirst"])

export function indexVoice(
  charword: unknown,
  lang = "CN",
  only: Iterable<string> | null = null,
): Map<string, Record<string, string[]>> {
  const keep = only ? new Set(only) : null
  const out = new Map<string, Record<string, string[]>>()
  const words = asRecord(asRecord(charword)?.["charWords"])
  if (!words) return out
  const seen = new Map<string, Map<string, Map<string, { index: number; asset: string }>>>()
  for (const item of Object.values(words)) {
    const row = asRecord(item)
    if (!row) continue
    const charId = typeof row["charId"] === "string" ? row["charId"] : ""
    const placeType = typeof row["placeType"] === "string" ? row["placeType"] : ""
    const slot = voiceSlotNames[placeType]
    const voiceId = typeof row["voiceId"] === "string" ? row["voiceId"] : ""
    if (!charId || !slot || (keep && !keep.has(slot)) || !voiceId.startsWith(`${lang}_`)) continue
    if (row["wordKey"] !== charId) continue
    const voiceAsset = typeof row["voiceAsset"] === "string" ? row["voiceAsset"] : ""
    if (!voiceAsset) continue
    let slots = seen.get(charId)
    if (!slots) {
      slots = new Map()
      seen.set(charId, slots)
    }
    let lines = slots.get(slot)
    if (!lines) {
      lines = new Map()
      slots.set(slot, lines)
    }
    const index = typeof row["voiceIndex"] === "number" && Number.isFinite(row["voiceIndex"]) ? row["voiceIndex"] : 0
    const prev = lines.get(voiceId)
    if (!prev || index < prev.index) lines.set(voiceId, { index, asset: voiceAsset })
  }
  for (const [charId, slots] of seen) {
    const record: Record<string, string[]> = {}
    for (const [slot, lines] of slots) {
      record[slot] = [...lines.values()].sort((a, b) => a.index - b.index).map((line) => line.asset)
    }
    out.set(charId, record)
  }
  return out
}
