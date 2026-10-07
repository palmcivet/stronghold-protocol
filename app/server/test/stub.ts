import { C2S } from "@alliance/contract/message.js"
import { ERR, EMOTE_COOLDOWN_MS, GEO, PHASE, modeIdFor } from "@alliance/contract/match.js"
import { getConfig, getMode, type PacketData } from "#server/entry/packet.js"
import type { NetLog } from "#server/connection/session.js"

const GAME_TYPES: ReadonlySet<string> = new Set(Object.keys(C2S).filter((type) => type.startsWith("g.")))
const DEFAULT_INFO_CHECK_S = 25
const MAX_TIMER_MS = 2 ** 31 - 1

const noopLog: NetLog = { info() {}, warn() {}, error() {}, debug() {} }

const positive = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback

export interface StubSeat {
  seat: number
  playerId: string
  name: string
  isBot: boolean
  connected: boolean
}

export interface StubOptions {
  roomCode?: string
  mode?: string
  difficulty?: string
  modeId?: string
  seats?: readonly StubSeat[]
  seed?: number
  data?: PacketData | null
  log?: NetLog
  now?: () => number
  send?: (playerId: string, msg: object) => boolean
  broadcast?: (msg: object) => void
  onEnd?: (summary?: unknown) => void
  spectators?: readonly string[]
  matchNo?: number
}

export interface StubPlayer {
  seat: number
  playerId: string
  name: string
  isBot: boolean
  connected: boolean
  left: boolean
  ready: boolean
  lastEmoteAt: number
}

export interface StubSummary {
  stub: true
  victory: false
  roundsPassed: number
  modeId: string
  difficulty: string
  seed: number
  reason: "timeout" | "confirmed"
  players: { playerId: string; seat: number; name: string; isBot: boolean; lp: number; title: null }[]
}

/** Platform test match. Production rooms construct `Match` from `#server/match/flow/index.js`. */
export class StubMatch {
  readonly roomCode: string
  readonly mode: string
  readonly difficulty: string
  readonly modeId: string
  readonly seed: number
  readonly log: NetLog
  readonly now: () => number
  readonly sendFn: (playerId: string, msg: object) => boolean
  readonly broadcastFn: (msg: object) => void
  readonly onEndFn: (summary?: unknown) => void
  lastRound: number
  infoCheckMs: number
  readonly players: Map<string, StubPlayer>
  phase: string
  deadline: number
  timer: ReturnType<typeof setTimeout> | null
  ended: boolean
  disposed: boolean

  constructor(opts: StubOptions) {
    if (!opts || !Array.isArray(opts.seats) || opts.seats.length === 0) throw new TypeError("Match: seats required")
    if (typeof opts.send !== "function" || typeof opts.broadcast !== "function" || typeof opts.onEnd !== "function") {
      throw new TypeError("Match: send/broadcast/onEnd callbacks required")
    }
    this.roomCode = opts.roomCode ?? ""
    this.mode = opts.mode ?? ""
    this.difficulty = opts.difficulty ?? ""
    this.modeId = opts.modeId || modeIdFor(opts.mode ?? "", opts.difficulty ?? "")
    this.seed = (opts.seed ?? 0) >>> 0
    this.log = opts.log ?? noopLog
    this.now = opts.now ?? Date.now
    this.sendFn = opts.send
    this.broadcastFn = opts.broadcast
    this.onEndFn = opts.onEnd
    const data: PacketData = opts.data && typeof opts.data === "object" ? opts.data : {}
    const config = getConfig(data) ?? {}
    const modeCfg = getMode(this.modeId, data) ?? {}
    const lastRound = modeCfg.lastRound
    this.lastRound = typeof lastRound === "number" && Number.isInteger(lastRound) && lastRound > 0
      ? lastRound
      : (this.modeId === "mode_single_funny" ? 9 : 14)
    const timers = config.timers
    const infoCheck = timers && typeof timers === "object" && !Array.isArray(timers)
      ? (timers as { infoCheck?: unknown }).infoCheck
      : undefined
    this.infoCheckMs = Math.min(MAX_TIMER_MS, positive(infoCheck, DEFAULT_INFO_CHECK_S) * 1000)
    this.players = new Map()
    for (const seat of opts.seats) {
      this.players.set(seat.playerId, {
        seat: seat.seat,
        playerId: seat.playerId,
        name: seat.name,
        isBot: !!seat.isBot,
        connected: !!seat.connected,
        left: false,
        ready: !!seat.isBot,
        lastEmoteAt: -Infinity,
      })
    }
    this.phase = PHASE.LOBBY
    this.deadline = 0
    this.timer = null
    this.ended = false
    this.disposed = false
  }

  start(): void {
    if (this.disposed || this.ended || this.phase !== PHASE.LOBBY) return
    this.phase = PHASE.INFO_CHECK
    this.deadline = this.now() + this.infoCheckMs
    this.timer = setTimeout(() => {
      this.timer = null
      this.maybeFinish(true)
    }, this.infoCheckMs)
    this.timer.unref?.()
    this.broadcastFn(this.publicView())
    for (const player of this.players.values()) if (!player.isBot) this.sendFn(player.playerId, this.privateView(player))
  }

  handle(playerId: string, msg: { t?: string; id?: unknown } | null | undefined): { ok: true } | { error: string } {
    const player = this.players.get(playerId)
    if (!player || player.isBot || player.left) return { error: ERR.NOT_IN_ROOM }
    const type = msg && typeof msg.t === "string" ? msg.t : ""
    if (this.disposed || this.ended || !GAME_TYPES.has(type)) return { error: ERR.WRONG_PHASE }
    if (type === "g.infoReady") {
      if (this.phase !== PHASE.INFO_CHECK) return { error: ERR.WRONG_PHASE }
      if (!player.ready) {
        player.ready = true
        this.broadcastFn(this.publicView())
        this.maybeFinish(false)
      }
    } else if (type === "g.emote") {
      const now = this.now()
      if (now - player.lastEmoteAt >= EMOTE_COOLDOWN_MS) {
        player.lastEmoteAt = now
        this.broadcastFn({ t: "m.emote", playerId, id: msg?.id })
      }
    }
    return { ok: true }
  }

  onDisconnect(playerId: string): void {
    const player = this.players.get(playerId)
    if (!player || player.isBot || this.disposed) return
    player.connected = false
    if (!this.ended) this.broadcastFn(this.publicView())
  }

  onReconnect(playerId: string): void {
    const player = this.players.get(playerId)
    if (!player || player.isBot || player.left || this.disposed) return
    const wasConnected = player.connected
    player.connected = true
    this.sendFn(playerId, this.publicView())
    this.sendFn(playerId, this.privateView(player))
    if (!this.ended && !wasConnected) this.broadcastFn(this.publicView())
  }

  onLeave(playerId: string): void {
    const player = this.players.get(playerId)
    if (!player || player.isBot || player.left || this.disposed) return
    player.left = true
    player.connected = false
    if (this.ended) return
    this.broadcastFn(this.publicView())
    this.maybeFinish(false)
  }

  dispose(): void {
    this.disposed = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  // MARK: stub flow

  /** End once every remaining human is ready, or once the INFO_CHECK deadline has passed. */
  maybeFinish(deadlinePassed: boolean): void {
    if (this.ended || this.disposed) return
    if (!deadlinePassed) {
      for (const player of this.players.values()) if (!player.isBot && !player.left && !player.ready) return
    }
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    const humansLeft = [...this.players.values()].some((player) => !player.isBot && !player.left)
    this.ended = true
    this.phase = PHASE.RESULT
    this.deadline = 0
    const summary: StubSummary = {
      stub: true,
      victory: false,
      roundsPassed: 0,
      modeId: this.modeId,
      difficulty: this.difficulty,
      seed: this.seed,
      reason: deadlinePassed ? "timeout" : "confirmed",
      players: [...this.players.values()].map((player) => ({
        playerId: player.playerId,
        seat: player.seat,
        name: player.name,
        isBot: player.isBot,
        lp: 0,
        title: null,
      })),
    }
    if (humansLeft) {
      this.broadcastFn(this.publicView())
      this.broadcastFn({ t: "m.result", ...summary })
    }
    this.onEndFn(summary)
  }

  publicView(): object {
    return {
      t: "m.public",
      phase: this.phase,
      round: 0,
      lastRound: this.lastRound,
      deadline: this.phase === PHASE.INFO_CHECK ? this.deadline : 0,
      serverNow: this.now(),
      modeId: this.modeId,
      difficulty: this.difficulty,
      stageId: null,
      factions: [],
      disabledBonds: [],
      bannedChess: [],
      bossId: null,
      players: [...this.players.values()].map((player) => ({
        playerId: player.playerId,
        seat: player.seat,
        name: player.name,
        isBot: player.isBot,
        connected: player.isBot || (player.connected && !player.left),
        alive: true,
        lp: 0,
        bandId: null,
        shopLevel: 1,
        boardCount: 0,
        ready: player.ready,
        bonds: [],
        fieldId: null,
        status: player.left ? "left" : player.ready ? "ready" : "deciding",
      })),
      fields: [],
      stub: true,
      message: "对局核心尚未实现（平台占位 STUB）：全员确认本局信息或倒计时结束后将直接结算。",
    }
  }

  privateView(player: StubPlayer): object {
    return {
      t: "m.private",
      playerId: player.playerId,
      seat: player.seat,
      alive: true,
      lp: 0,
      funds: 0,
      bandId: null,
      ready: player.ready,
      canReady: true,
      shop: {
        level: 1,
        maxLevel: 6,
        upgradePrice: 0,
        refreshPrice: 0,
        freeRefreshes: 0,
        frozen: false,
        slots: [],
        rewardOffer: null,
      },
      hand: new Array(GEO.HAND_SIZE).fill(null),
      temp: new Array(GEO.TEMP_SIZE).fill(null),
      board: [],
      deployCap: 0,
      deployCount: 0,
      bonds: [],
      effects: [],
      nextEnemies: [],
      stats: { dmgDealt: 0, kills: 0, leaks: 0, gold: 0, refreshes: 0, merges: 0 },
      stub: true,
    }
  }
}
