import { randomBytes, randomInt } from "node:crypto"
import { ERR, MAX_SEATS, MAX_SPECTATORS, ROOM_CODE_LEN, modeIdFor, type Difficulty } from "@alliance/contract/match.js"
import { checkLoadout, type ChessRecord } from "@alliance/contract/message.js"
import { encode, isDroppable, isErrCode, sendRaw, sendSession, type HandlerResult, type NetHandler, type NetLog, type Session, type SessionRegistry, type StoredLoadout } from "#server/connection/session.js"
import { getData as defaultGetData, lookup, type PacketData } from "#server/entry/packet.js"
import { Match as DefaultMatch } from "#server/match/flow/index.js"

export const CODE_ALPHABET: string = "ABCDEFGHJKLMNPQRSTUVWXYZ"

export const LOBBY_DEFAULTS: {
  readonly lobbyGraceMs: number
  readonly maxRooms: number
  readonly maxRoomsPerAddr: number
  readonly maxMatchesPerAddr: number
  readonly resyncMinGapMs: number
  readonly soloReconnectWindowMs: number | null
} = Object.freeze({
  lobbyGraceMs: 60_000,
  maxRooms: 1000,
  maxRoomsPerAddr: 16,
  maxMatchesPerAddr: 8,
  resyncMinGapMs: 1000,
  soloReconnectWindowMs: null,
})

export const SOLO_RECONNECT_FALLBACK_SEC: number = 86_400

export const BOT_NAMES: readonly string[] = Object.freeze(["AI·华法琳", "AI·阿米娅", "AI·惊蛰", "AI·杜宾", "AI·凯尔希", "AI·可露希尔"])

export type RoomMode = "solo" | "coop"

export interface Seat {
  seat: number
  playerId: string
  name: string
  isBot: boolean
  ready: boolean
  connected: boolean
  left: boolean
  loadout: StoredLoadout | null
}

export interface SpectatorSeat {
  playerId: string
  name: string
  connected: boolean
}

export interface Replay {
  publicFrame: string | null
  frames: Map<string, string>
  pending: Set<string>
}

export interface MatchSeatInput {
  seat: number
  playerId: string
  name: string
  isBot: boolean
  connected: boolean
  loadout: StoredLoadout | null
}

export interface MatchReply {
  ok?: true
  error?: string
  detail?: string
}

export interface MatchInit {
  roomCode: string
  mode: RoomMode
  difficulty: string
  modeId: string
  seats: MatchSeatInput[]
  spectators: string[]
  seed: number
  matchNo: number
  data: PacketData
  log: NetLog
  now: () => number
  send: (playerId: string, msg: object) => boolean
  broadcast: (msg: object) => void
  onEnd: (summary?: unknown) => void
}

export interface MatchHandle {
  start(): void
  handle(playerId: string, msg: Record<string, unknown>): MatchReply | Promise<unknown> | undefined | void
  onDisconnect?(playerId: string): void
  onReconnect?(playerId: string): void
  onLeave?(playerId: string): void
  addSpectator?(playerId: string): void
  removeSpectator?(playerId: string): void
  setLoadout?(playerId: string, loadout: StoredLoadout): MatchReply | undefined | void
  dispose?(): void
  players?: Map<string, { left?: boolean }>
  ended?: boolean
  finish?(summary: unknown): void
}

export interface MatchConstructor {
  new (opts: MatchInit): MatchHandle
}

export interface LobbySettings {
  lobbyGraceMs: number
  maxRooms: number
  maxRoomsPerAddr: number
  maxMatchesPerAddr: number
  resyncMinGapMs: number
  soloReconnectWindowMs: number | null
}

export interface LobbyOptions {
  lobbyGraceMs?: number
  maxRooms?: number
  maxRoomsPerAddr?: number
  maxMatchesPerAddr?: number
  resyncMinGapMs?: number
  soloReconnectWindowMs?: number | null
}

export interface LobbyInit {
  registry: SessionRegistry
  log?: NetLog
  MatchClass?: MatchConstructor
  getData?: () => PacketData
  now?: () => number
  seedFn?: () => number
  options?: LobbyOptions
}

export interface LobbyStats {
  rooms: number
  matches: number
  humans: number
  bots: number
  spectators: number
}

export interface MatchCtx {
  live: boolean
  ended: boolean
  disposed: boolean
  match: MatchHandle | null
  lastPublic: string | null
  sharedResult: string | null
  results: Map<string, string>
}

type PlayerHook = "onDisconnect" | "onReconnect" | "onLeave" | "addSpectator" | "removeSpectator"

const OK: HandlerResult = { ok: true }

const noopLog: NetLog = { info() {}, warn() {}, error() {}, debug() {} }

function fail(code: string, detail?: string): HandlerResult {
  if (detail) return { error: code, detail }
  return { error: code }
}

function freezeLoadout(loadout: Record<string, { skill: number; module: string | null }>): StoredLoadout {
  const out: Record<string, { skill: number; module: string | null }> = {}
  for (const [id, entry] of Object.entries(loadout)) {
    out[id] = Object.freeze({ skill: entry.skill, module: entry.module ?? null })
  }
  return Object.freeze(out)
}

function chessRecord(record: Record<string, unknown> | null): ChessRecord | null {
  return record as ChessRecord | null
}

function wireType(msg: object): unknown {
  return "t" in msg ? (msg as { t?: unknown }).t : undefined
}

function isThenable(value: unknown): value is Promise<unknown> {
  return !!value && (typeof value === "object" || typeof value === "function") && typeof (value as { then?: unknown }).then === "function"
}

function errorOf(value: unknown): { error: string; detail?: string } | null {
  if (!value || typeof value !== "object") return null
  const error = (value as { error?: unknown }).error
  if (typeof error !== "string" || !error) return null
  const detail = (value as { detail?: unknown }).detail
  if (typeof detail === "string") return { error, detail }
  return { error }
}

function isDifficulty(value: unknown): value is Difficulty {
  return value === "FUNNY" || value === "NORMAL" || value === "HARD" || value === "ABYSS"
}

function isMode(value: unknown): value is RoomMode {
  return value === "solo" || value === "coop"
}

function seatIndex(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < MAX_SEATS ? value : null
}

function singleReconnectSeconds(data: PacketData): number {
  const config = data.config
  if (!config || typeof config !== "object" || Array.isArray(config)) return SOLO_RECONNECT_FALLBACK_SEC
  const constants = (config as { constants?: unknown }).constants
  if (!constants || typeof constants !== "object" || Array.isArray(constants)) return SOLO_RECONNECT_FALLBACK_SEC
  const sec = (constants as { singleReconnectTime?: unknown }).singleReconnectTime
  return typeof sec === "number" && Number.isFinite(sec) && sec > 0 ? sec : SOLO_RECONNECT_FALLBACK_SEC
}

function liveMember(member: Seat | SpectatorSeat | null): member is Seat | SpectatorSeat {
  if (!member) return false
  if ("isBot" in member && member.isBot) return false
  if ("left" in member && member.left) return false
  return true
}

/** One room: seat slots, host, difficulty, spectators, and at most one running match. */
export class Room {
  readonly code: string
  readonly mode: RoomMode
  difficulty: Difficulty
  hostId: string | null = null
  readonly seats: (Seat | null)[]
  readonly spectators: SpectatorSeat[] = []
  match: MatchHandle | null = null
  matchCtx: MatchCtx | null = null
  matchCount = 0
  lastSummary: unknown = null
  replay: Replay | null = null
  ownerKey: string | null = null
  matchKey: string | null = null
  readonly createdAt: number
  disposed = false

  constructor(code: string, mode: RoomMode, difficulty: Difficulty, now: number) {
    this.code = code
    this.mode = mode
    this.difficulty = difficulty
    this.seats = Array.from({ length: MAX_SEATS }, (): Seat | null => null)
    this.createdAt = now
  }

  seatOf(playerId: string): Seat | null {
    for (const seat of this.seats) if (seat && seat.playerId === playerId) return seat
    return null
  }

  spectatorOf(playerId: string): SpectatorSeat | null {
    return this.spectators.find((seat) => seat.playerId === playerId) ?? null
  }

  freeSeat(): number {
    return this.seats.indexOf(null)
  }

  activeHumans(): Seat[] {
    const humans: Seat[] = []
    for (const seat of this.seats) if (seat && !seat.isBot && !seat.left) humans.push(seat)
    return humans
  }

  toState(): {
    t: "room.state"
    code: string
    hostId: string | null
    mode: RoomMode
    difficulty: Difficulty
    inMatch: boolean
    seats: ({ seat: number; playerId: string; name: string; isBot: boolean; ready: boolean; connected: boolean } | null)[]
    spectators: { playerId: string; name: string; connected: boolean }[]
  } {
    return {
      t: "room.state",
      code: this.code,
      hostId: this.hostId,
      mode: this.mode,
      difficulty: this.difficulty,
      inMatch: !!this.match,
      seats: this.seats.map((seat) => (seat
        ? { seat: seat.seat, playerId: seat.playerId, name: seat.name, isBot: seat.isBot, ready: seat.ready, connected: seat.connected && !seat.left }
        : null)),
      spectators: this.spectators.map((seat) => ({ playerId: seat.playerId, name: seat.name, connected: seat.connected })),
    }
  }
}

/** Room registry. The entry passes an instance to `Network` as its handler. */
export class Lobby implements NetHandler {
  private readonly registry: SessionRegistry
  private readonly log: NetLog
  private readonly MatchClass: MatchConstructor
  private readonly getData: () => PacketData
  private readonly now: () => number
  private readonly seedFn: () => number
  private readonly opts: LobbySettings
  readonly rooms: Map<string, Room> = new Map()
  private readonly graceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private readonly resyncTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private readonly limitLog: { at: number; suppressed: number } = { at: -Infinity, suppressed: 0 }

  constructor(init: LobbyInit) {
    const options = init.options ?? {}
    this.registry = init.registry
    this.log = init.log ?? noopLog
    this.MatchClass = init.MatchClass ?? (DefaultMatch as unknown as MatchConstructor)
    this.getData = init.getData ?? defaultGetData
    this.now = init.now ?? Date.now
    this.seedFn = init.seedFn ?? (() => randomInt(2 ** 32))
    this.opts = {
      lobbyGraceMs: options.lobbyGraceMs ?? LOBBY_DEFAULTS.lobbyGraceMs,
      maxRooms: options.maxRooms ?? LOBBY_DEFAULTS.maxRooms,
      maxRoomsPerAddr: options.maxRoomsPerAddr ?? LOBBY_DEFAULTS.maxRoomsPerAddr,
      maxMatchesPerAddr: options.maxMatchesPerAddr ?? LOBBY_DEFAULTS.maxMatchesPerAddr,
      resyncMinGapMs: options.resyncMinGapMs ?? LOBBY_DEFAULTS.resyncMinGapMs,
      soloReconnectWindowMs: options.soloReconnectWindowMs ?? LOBBY_DEFAULTS.soloReconnectWindowMs,
    }
  }

  getRoom(code: string): Room | null {
    return this.rooms.get(String(code).toUpperCase()) ?? null
  }

  stats(): LobbyStats {
    let matches = 0
    let humans = 0
    let bots = 0
    let spectators = 0
    for (const room of this.rooms.values()) {
      if (room.match) matches++
      for (const seat of room.seats) {
        if (!seat || seat.left) continue
        if (seat.isBot) bots++
        else humans++
      }
      spectators += room.spectators.length
    }
    return { rooms: this.rooms.size, matches, humans, bots, spectators }
  }

  // MARK: net handler

  onHello(session: Session, info: { resumed: boolean; repeat: boolean }): void {
    if (!info.resumed && !info.repeat) return
    const room = this.roomOf(session)
    if (!room) {
      if (session.notice) {
        sendSession(session, { t: "room.closed", reason: session.notice })
        session.notice = null
      }
      if (session.pendingResult) {
        for (const frame of session.pendingResult) if (frame) sendRaw(session.ws, frame)
        session.pendingResult = null
      }
      return
    }
    session.notice = null
    session.pendingResult = null
    const seat = room.seatOf(session.playerId) ?? room.spectatorOf(session.playerId)
    if (!seat) return
    this.clearGrace(session.playerId)
    let changed = !seat.connected
    seat.connected = true
    if (!room.match && seat.name !== session.name) {
      seat.name = session.name
      changed = true
    }
    if (!room.hostId) {
      this.migrateHost(room)
      changed = true
    }
    if (changed) this.broadcastState(room)
    else this.sendState(room, session)
    this.resync(session, !info.resumed)
  }

  onMessage(session: Session, msg: Record<string, unknown>): HandlerResult {
    switch (msg.t) {
      case "room.create": return this.create(session, msg)
      case "room.join": return this.join(session, msg)
      case "room.leave": return this.leave(session)
      case "room.ready": return this.ready(session, msg)
      case "room.setDifficulty": return this.setDifficulty(session, msg)
      case "room.addBot": return this.addBot(session)
      case "room.removeBot": return this.removeBot(session, msg)
      case "room.kick": return this.kick(session, msg)
      case "room.start": return this.start(session)
      case "room.loadout": return this.loadout(session, msg)
      case "room.spectate": return this.spectate(session, msg)
      case "room.removeSpectator": return this.removeSpectator(session, msg)
      default:
        if (typeof msg.t === "string" && msg.t.startsWith("g.")) return this.routeGame(session, msg)
        return fail(ERR.BAD_MSG, `unhandled type ${String(msg.t).slice(0, 32)}`)
    }
  }

  onDisconnect(session: Session): void {
    this.clearResync(session.playerId)
    const room = this.roomOf(session)
    session.resumeWindowMs = room && room.match && room.mode === "solo" ? this.soloResumeWindowMs() : null
    if (!room) return
    const player = room.seatOf(session.playerId)
    const seat = player ?? room.spectatorOf(session.playerId)
    if (!seat) return
    seat.connected = false
    if (room.match) {
      if (player) this.callMatch(room, "onDisconnect", session.playerId)
    } else this.startGrace(room, seat)
    this.broadcastState(room)
  }

  onExpire(session: Session): void {
    session.notice = null
    session.pendingResult = null
    this.clearResync(session.playerId)
    const code = session.roomCode
    session.roomCode = null
    const room = code ? this.rooms.get(code) : undefined
    if (room) this.removeMember(room, session.playerId)
  }

  shutdown(reason = "shutdown"): void {
    for (const room of [...this.rooms.values()]) this.disposeRoom(room, reason)
    for (const timer of this.graceTimers.values()) clearTimeout(timer)
    this.graceTimers.clear()
    for (const timer of this.resyncTimers.values()) clearTimeout(timer)
    this.resyncTimers.clear()
  }

  // MARK: room messages

  private create(session: Session, msg: Record<string, unknown>): HandlerResult {
    const mode = msg.mode
    const difficulty = msg.difficulty
    if (!isMode(mode)) return fail(ERR.BAD_MSG, "bad mode")
    if (!isDifficulty(difficulty)) return fail(ERR.BAD_MSG, "bad difficulty")
    const cur = this.roomOf(session)
    if (cur && cur.match) return fail(ERR.ROOM_STARTED, "leave your running match first")
    if (this.rooms.size >= this.opts.maxRooms) return fail(ERR.INTERNAL, "too many rooms")
    const key = session.limitKey || null
    if (key && this.opts.maxRoomsPerAddr > 0) {
      const leaving = cur && cur.ownerKey === key && cur.activeHumans().length === 1 && !cur.spectatorOf(session.playerId) ? 1 : 0
      if (this.countRooms((room) => room.ownerKey === key) - leaving >= this.opts.maxRoomsPerAddr) {
        this.limitWarn(`room limit (${this.opts.maxRoomsPerAddr}) reached for ${session.addr}`)
        return fail(ERR.RATE, "too many rooms from your network")
      }
    }
    const code = this.genCode()
    if (!code) return fail(ERR.INTERNAL, "no room code available")
    if (cur) this.removeMember(cur, session.playerId)
    const room = new Room(code, mode, difficulty, this.now())
    room.ownerKey = key
    room.seats[0] = this.humanSeat(0, session)
    room.hostId = session.playerId
    this.rooms.set(code, room)
    session.roomCode = code
    session.notice = null
    session.pendingResult = null
    this.log.info?.(`[lobby] ${code} created (${mode}/${difficulty}) by ${session.name}`)
    this.broadcastState(room)
    return OK
  }

  private join(session: Session, msg: Record<string, unknown>): HandlerResult {
    const raw = typeof msg.code === "string" ? msg.code : ""
    const norm = raw.trim().toUpperCase()
    const room = norm.length === ROOM_CODE_LEN ? this.rooms.get(norm) : undefined
    if (!room) return fail(ERR.ROOM_NOT_FOUND)
    const cur = this.roomOf(session)
    if (cur === room && !room.spectatorOf(session.playerId)) {
      this.sendState(room, session)
      return OK
    }
    if (cur && cur.match) return fail(ERR.ROOM_STARTED, "leave your running match first")
    if (room.match) return fail(ERR.ROOM_STARTED)
    if (room.mode === "solo") return fail(ERR.ROOM_FULL, "solo room")
    const idx = room.freeSeat()
    if (idx < 0) return fail(ERR.ROOM_FULL)
    if (cur) this.removeMember(cur, session.playerId)
    room.seats[idx] = this.humanSeat(idx, session)
    session.roomCode = room.code
    session.notice = null
    session.pendingResult = null
    if (!room.hostId) room.hostId = session.playerId
    this.broadcastState(room)
    return OK
  }

  private leave(session: Session): HandlerResult {
    const room = this.roomOf(session)
    if (!room) return fail(ERR.NOT_IN_ROOM)
    this.removeMember(room, session.playerId)
    return OK
  }

  private spectate(session: Session, msg: Record<string, unknown>): HandlerResult {
    const raw = typeof msg.code === "string" ? msg.code : ""
    const norm = raw.trim().toUpperCase()
    const room = norm.length === ROOM_CODE_LEN ? this.rooms.get(norm) : undefined
    if (!room) return fail(ERR.ROOM_NOT_FOUND)
    const cur = this.roomOf(session)
    if (cur === room) {
      if (!room.spectatorOf(session.playerId)) return fail(ERR.ALREADY, "seated as a player")
      this.sendState(room, session)
      return OK
    }
    if (cur && cur.match) return fail(ERR.ROOM_STARTED, "leave your running match first")
    if (room.mode === "solo") return fail(ERR.ROOM_FULL, "solo room")
    if (room.spectators.length >= MAX_SPECTATORS) return fail(ERR.ROOM_FULL, "no free spectator seat")
    if (cur) this.removeMember(cur, session.playerId)
    room.spectators.push({ playerId: session.playerId, name: session.name, connected: session.connected })
    session.roomCode = room.code
    session.notice = null
    session.pendingResult = null
    this.broadcastState(room)
    if (room.match) this.callMatch(room, "addSpectator", session.playerId)
    return OK
  }

  private removeSpectator(session: Session, msg: Record<string, unknown>): HandlerResult {
    const room = this.roomOf(session)
    if (!room) return fail(ERR.NOT_IN_ROOM)
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST)
    const playerId = typeof msg.playerId === "string" ? msg.playerId : ""
    if (!room.spectatorOf(playerId)) return fail(ERR.BAD_TARGET, "not a spectator of this room")
    const target = this.registry.byId(playerId)
    const wasHere = !!target && target.roomCode === room.code
    const replay = this.replayFor(room, playerId)
    this.removeMember(room, playerId)
    if (wasHere && target) {
      if (target.connected) sendSession(target, { t: "room.closed", reason: "kicked" })
      else {
        target.notice = "kicked"
        target.pendingResult = replay
      }
    }
    return OK
  }

  private ready(session: Session, msg: Record<string, unknown>): HandlerResult {
    const room = this.roomOf(session)
    if (!room) return fail(ERR.NOT_IN_ROOM)
    if (room.spectatorOf(session.playerId)) return fail(ERR.SPECTATOR)
    if (room.match) return fail(ERR.ROOM_STARTED)
    if (typeof msg.ready !== "boolean") return fail(ERR.BAD_MSG, "bad ready")
    this.dropReplay(room, session.playerId)
    const seat = room.seatOf(session.playerId)
    if (!seat) return fail(ERR.NOT_IN_ROOM)
    if (seat.ready !== msg.ready) {
      seat.ready = msg.ready
      this.broadcastState(room)
    }
    return OK
  }

  private setDifficulty(session: Session, msg: Record<string, unknown>): HandlerResult {
    const room = this.roomOf(session)
    if (!room) return fail(ERR.NOT_IN_ROOM)
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST)
    if (room.match) return fail(ERR.ROOM_STARTED)
    if (!isDifficulty(msg.difficulty)) return fail(ERR.BAD_MSG, "bad difficulty")
    this.dropReplay(room, session.playerId)
    if (room.difficulty !== msg.difficulty) {
      room.difficulty = msg.difficulty
      for (const seat of room.seats) if (seat && !seat.isBot && seat.playerId !== room.hostId) seat.ready = false
      this.broadcastState(room)
    }
    return OK
  }

  private addBot(session: Session): HandlerResult {
    const room = this.roomOf(session)
    if (!room) return fail(ERR.NOT_IN_ROOM)
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST)
    if (room.match) return fail(ERR.ROOM_STARTED)
    this.dropReplay(room, session.playerId)
    if (room.mode === "solo") return fail(ERR.ROOM_FULL, "solo rooms cannot have AI teammates")
    const idx = room.freeSeat()
    if (idx < 0) return fail(ERR.ROOM_FULL)
    const used = new Set<string>()
    for (const seat of room.seats) if (seat?.isBot) used.add(seat.name)
    const name = BOT_NAMES.find((candidate) => !used.has(candidate)) ?? `AI·${idx + 1}`
    let playerId = ""
    do playerId = "ai_" + randomBytes(4).toString("hex")
    while (room.seatOf(playerId))
    room.seats[idx] = { seat: idx, playerId, name, isBot: true, ready: true, connected: true, left: false, loadout: null }
    this.broadcastState(room)
    return OK
  }

  private removeBot(session: Session, msg: Record<string, unknown>): HandlerResult {
    const room = this.roomOf(session)
    if (!room) return fail(ERR.NOT_IN_ROOM)
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST)
    if (room.match) return fail(ERR.ROOM_STARTED)
    this.dropReplay(room, session.playerId)
    const seat = seatIndex(msg.seat)
    const target = seat == null ? undefined : room.seats[seat]
    if (!target || !target.isBot) return fail(ERR.BAD_TARGET, "seat does not hold an AI")
    room.seats[target.seat] = null
    this.broadcastState(room)
    return OK
  }

  private kick(session: Session, msg: Record<string, unknown>): HandlerResult {
    const room = this.roomOf(session)
    if (!room) return fail(ERR.NOT_IN_ROOM)
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST)
    if (room.match) return fail(ERR.ROOM_STARTED)
    this.dropReplay(room, session.playerId)
    const seat = seatIndex(msg.seat)
    const playerId = typeof msg.playerId === "string" ? msg.playerId : ""
    if (seat == null || !playerId) return fail(ERR.BAD_MSG, "bad kick")
    const target = room.seats[seat]
    if (!target || target.left) return fail(ERR.BAD_TARGET, "seat holds no player")
    if (target.playerId !== playerId) return fail(ERR.BAD_TARGET, "seat changed hands")
    if (target.isBot) return fail(ERR.BAD_TARGET, "seat holds an AI (room.removeBot)")
    if (target.playerId === session.playerId) return fail(ERR.BAD_TARGET, "cannot kick yourself")
    const kicked = this.registry.byId(target.playerId)
    const wasHere = !!kicked && kicked.roomCode === room.code
    const replay = this.replayFor(room, target.playerId)
    const kickedName = target.name
    this.removeMember(room, target.playerId)
    if (wasHere && kicked) {
      if (kicked.connected) sendSession(kicked, { t: "room.closed", reason: "kicked" })
      else {
        kicked.notice = "kicked"
        kicked.pendingResult = replay
      }
    }
    this.log.info?.(`[lobby] ${room.code} ${kickedName} removed by the host`)
    return OK
  }

  private start(session: Session): HandlerResult {
    const room = this.roomOf(session)
    if (!room) return fail(ERR.NOT_IN_ROOM)
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST)
    if (room.match) return fail(ERR.ROOM_STARTED)
    const humans = room.activeHumans()
    for (const seat of humans) {
      if (seat.playerId !== room.hostId && (!seat.connected || !seat.ready)) return fail(ERR.NOT_READY)
    }
    const bots = room.seats.filter((seat): seat is Seat => !!seat && seat.isBot)
    if (humans.length < 1 || (room.mode === "solo" && (humans.length !== 1 || bots.length > 0))) {
      return fail(ERR.BAD_MSG, "invalid seat configuration")
    }
    const key = session.limitKey || null
    if (key && this.opts.maxMatchesPerAddr > 0 && this.countRooms((item) => !!item.match && item.matchKey === key) >= this.opts.maxMatchesPerAddr) {
      this.limitWarn(`match limit (${this.opts.maxMatchesPerAddr}) reached for ${session.addr}`)
      return fail(ERR.RATE, "too many running matches from your network")
    }
    return this.startMatch(room, key)
  }

  private loadout(session: Session, msg: Record<string, unknown>): HandlerResult {
    const data = this.safeData()
    const checked = checkLoadout(msg.entries, (id: string) => chessRecord(lookup("chess", id, data)))
    if (!checked.ok) return fail(isErrCode(checked.error) ? checked.error : ERR.BAD_MSG, checked.detail)
    const loadout = freezeLoadout(checked.loadout)
    session.loadout = loadout
    const room = this.roomOf(session)
    if (!room) return OK
    const seat = room.seatOf(session.playerId)
    if (seat) seat.loadout = loadout
    if (!room.match || !seat) return OK
    if (typeof room.match.setLoadout !== "function") return fail(ERR.ROOM_STARTED, "stored for the next match")
    let result: unknown
    try {
      result = room.match.setLoadout(session.playerId, loadout)
    } catch (cause) {
      this.log.error?.(`[lobby] ${room.code} match.setLoadout threw`, cause)
      return fail(ERR.INTERNAL)
    }
    const error = errorOf(result)
    if (error) return fail(isErrCode(error.error) ? error.error : ERR.INTERNAL, error.detail)
    return OK
  }

  // MARK: match

  private startMatch(room: Room, key: string | null = null): HandlerResult {
    const host = room.hostId ? room.seatOf(room.hostId) : null
    if (host) host.ready = true
    const seats: MatchSeatInput[] = []
    for (const seat of room.seats) {
      if (!seat) continue
      seats.push({
        seat: seat.seat,
        playerId: seat.playerId,
        name: seat.name,
        isBot: seat.isBot,
        connected: seat.connected,
        loadout: seat.isBot ? null : seat.loadout,
      })
    }
    const ctx: MatchCtx = {
      live: true,
      ended: false,
      disposed: false,
      match: null,
      lastPublic: null,
      sharedResult: null,
      results: new Map(),
    }
    let seed = 0
    try {
      seed = this.seedFn() >>> 0
    } catch {
      seed = randomInt(2 ** 32)
    }
    try {
      const match = new this.MatchClass({
        roomCode: room.code,
        mode: room.mode,
        difficulty: room.difficulty,
        modeId: modeIdFor(room.mode, room.difficulty),
        seats,
        spectators: room.spectators.map((seat) => seat.playerId),
        seed,
        matchNo: room.matchCount + 1,
        data: this.safeData(),
        log: this.log,
        now: this.now,
        send: (playerId, msg) => (ctx.live ? this.matchSend(room, ctx, playerId, msg) : false),
        broadcast: (msg) => {
          if (ctx.live) this.matchBroadcast(room, ctx, msg)
        },
        onEnd: (summary) => this.onMatchEnd(room, ctx, summary),
      })
      ctx.match = match
      room.match = match
      room.matchCtx = ctx
      room.matchKey = key
      room.replay = null
      room.matchCount++
      this.log.info?.(`[lobby] ${room.code} match #${room.matchCount} starting (${room.mode}/${room.difficulty}, ${seats.length} seats, seed ${seed})`)
      this.broadcastState(room)
      match.start()
    } catch (cause) {
      this.log.error?.(`[lobby] ${room.code} match failed to start`, cause)
      if (room.matchCtx === ctx) {
        room.match = null
        room.matchCtx = null
        room.matchKey = null
      }
      this.disposeMatchCtx(ctx)
      this.broadcastState(room)
      return fail(ERR.INTERNAL, "match failed to start")
    }
    return OK
  }

  private onMatchEnd(room: Room, ctx: MatchCtx, summary: unknown): void {
    if (ctx.ended || !ctx.live || room.matchCtx !== ctx || room.disposed) return
    ctx.ended = true
    room.lastSummary = summary ?? null
    room.match = null
    room.matchCtx = null
    room.matchKey = null
    room.replay = this.buildReplay(room, ctx)
    setImmediate(() => this.disposeMatchCtx(ctx))
    this.log.info?.(`[lobby] ${room.code} match #${room.matchCount} ended`)
    for (let i = 0; i < room.seats.length; i++) {
      const seat = room.seats[i]
      if (!seat || seat.isBot) continue
      if (seat.left) {
        room.seats[i] = null
        continue
      }
      seat.ready = false
      if (!seat.connected) this.startGrace(room, seat)
    }
    for (const seat of room.spectators) if (!seat.connected) this.startGrace(room, seat)
    const host = room.hostId ? room.seatOf(room.hostId) : null
    if (!host || host.isBot || host.left) this.migrateHost(room)
    if (room.activeHumans().length === 0) this.disposeRoom(room, "empty")
    else this.broadcastState(room)
  }

  private matchSend(room: Room, ctx: MatchCtx, playerId: string, msg: object): boolean {
    if (wireType(msg) === "m.result") {
      const data = encode(msg)
      if (data != null) ctx.results.set(playerId, data)
    }
    return this.sendToPlayer(room, playerId, msg)
  }

  private matchBroadcast(room: Room, ctx: MatchCtx, msg: object): void {
    const data = this.broadcastRoom(room, msg)
    if (data == null) return
    const type = wireType(msg)
    if (type === "m.public") ctx.lastPublic = data
    else if (type === "m.result") ctx.sharedResult = data
  }

  private buildReplay(room: Room, ctx: MatchCtx): Replay | null {
    const frames = new Map<string, string>()
    for (const member of [...room.seats, ...room.spectators]) {
      if (!liveMember(member)) continue
      const frame = ctx.results.get(member.playerId) ?? ctx.sharedResult
      if (frame) frames.set(member.playerId, frame)
    }
    if (frames.size === 0) return null
    return { publicFrame: ctx.lastPublic, frames, pending: new Set(frames.keys()) }
  }

  private replayFor(room: Room, playerId: string): string[] | null {
    const replay = room.replay
    if (!replay || !replay.pending.has(playerId)) return null
    const frames: string[] = []
    if (replay.publicFrame) frames.push(replay.publicFrame)
    const own = replay.frames.get(playerId)
    if (own) frames.push(own)
    return frames
  }

  private dropReplay(room: Room, playerId: string): void {
    const replay = room.replay
    if (!replay || !replay.pending.delete(playerId)) return
    replay.frames.delete(playerId)
    if (replay.pending.size === 0) room.replay = null
  }

  private resync(session: Session, coalesce: boolean): void {
    const playerId = session.playerId
    if (coalesce) {
      if (this.resyncTimers.has(playerId)) return
      const last = Number.isFinite(session.resyncAt) ? session.resyncAt : -Infinity
      const wait = last + this.opts.resyncMinGapMs - this.now()
      if (wait > 0) {
        const timer = setTimeout(() => {
          this.resyncTimers.delete(playerId)
          this.runResync(session)
        }, wait)
        timer.unref?.()
        this.resyncTimers.set(playerId, timer)
        return
      }
    } else {
      this.clearResync(playerId)
    }
    this.runResync(session)
  }

  private runResync(session: Session): void {
    if (!session.connected || this.registry.byId(session.playerId) !== session) return
    const room = this.roomOf(session)
    if (!room) return
    session.resyncAt = this.now()
    if (room.match) {
      this.callMatch(room, room.spectatorOf(session.playerId) ? "addSpectator" : "onReconnect", session.playerId)
      return
    }
    const frames = this.replayFor(room, session.playerId)
    if (frames) for (const frame of frames) sendRaw(session.ws, frame)
  }

  private clearResync(playerId: string): void {
    const timer = this.resyncTimers.get(playerId)
    if (timer) {
      clearTimeout(timer)
      this.resyncTimers.delete(playerId)
    }
  }

  private limitWarn(text: string): void {
    const now = this.now()
    if (now - this.limitLog.at < 10_000) {
      this.limitLog.suppressed++
      return
    }
    const more = this.limitLog.suppressed ? ` (+${this.limitLog.suppressed} similar refusals)` : ""
    this.limitLog.at = now
    this.limitLog.suppressed = 0
    this.log.warn?.(`[lobby] ${text}${more}`)
  }

  private countRooms(pred: (room: Room) => boolean): number {
    let count = 0
    for (const room of this.rooms.values()) if (pred(room)) count++
    return count
  }

  routeGame(session: Session, msg: Record<string, unknown>): HandlerResult {
    const room = this.roomOf(session)
    if (!room) return fail(ERR.NOT_IN_ROOM)
    if (!room.match) return fail(ERR.WRONG_PHASE, "no running match")
    const type = typeof msg.t === "string" ? msg.t : ""
    if (type === "g.leave") {
      this.removeMember(room, session.playerId)
      return OK
    }
    if (type !== "g.watch" && room.spectatorOf(session.playerId)) return fail(ERR.SPECTATOR)
    let result: unknown
    try {
      result = room.match.handle(session.playerId, msg)
    } catch (cause) {
      this.log.error?.(`[lobby] ${room.code} match.handle(${type}) threw`, cause)
      return fail(ERR.INTERNAL)
    }
    if (isThenable(result)) {
      this.log.error?.(`[lobby] ${room.code} match.handle(${type}) returned a Promise; it must be synchronous`)
      Promise.resolve(result).catch((cause) => this.log.error?.(`[lobby] ${room.code} match.handle(${type}) rejected`, cause))
      return OK
    }
    const error = errorOf(result)
    if (error) return fail(isErrCode(error.error) ? error.error : ERR.INTERNAL, error.detail)
    return OK
  }

  private callMatch(room: Room, method: PlayerHook, playerId: string): void {
    const match = room.match
    if (!match) return
    const direct = match[method]
    const fn = typeof direct === "function"
      ? direct
      : method === "onLeave" && typeof match.onDisconnect === "function" ? match.onDisconnect : null
    if (!fn) return
    try {
      fn.call(match, playerId)
    } catch (cause) {
      this.log.error?.(`[lobby] ${room.code} match.${method} threw`, cause)
    }
  }

  private disposeMatchCtx(ctx: MatchCtx): void {
    if (ctx.disposed) return
    ctx.disposed = true
    ctx.live = false
    try {
      ctx.match?.dispose?.()
    } catch (cause) {
      this.log.error?.("[lobby] match.dispose threw", cause)
    }
  }

  private safeData(): PacketData {
    try {
      return this.getData()
    } catch (cause) {
      this.log.error?.("[lobby] getData failed", cause)
      return Object.freeze({})
    }
  }

  soloResumeWindowMs(): number {
    const option = this.opts.soloReconnectWindowMs
    if (typeof option === "number" && Number.isFinite(option) && option > 0) return option
    return singleReconnectSeconds(this.safeData()) * 1000
  }

  // MARK: membership

  private roomOf(session: Session): Room | null {
    if (!session.roomCode) return null
    const room = this.rooms.get(session.roomCode)
    const seat = room ? room.seatOf(session.playerId) : null
    if (room && !seat && room.spectatorOf(session.playerId)) return room
    if (!room || !seat || seat.left || seat.isBot) {
      session.roomCode = null
      return null
    }
    return room
  }

  private humanSeat(idx: number, session: Session): Seat {
    return {
      seat: idx,
      playerId: session.playerId,
      name: session.name,
      isBot: false,
      ready: false,
      connected: session.connected,
      left: false,
      loadout: session.loadout ?? null,
    }
  }

  private removeMember(room: Room, playerId: string): void {
    const session = this.registry.byId(playerId)
    if (session && session.roomCode === room.code) session.roomCode = null
    this.clearGrace(playerId)
    this.dropReplay(room, playerId)
    if (this.freeSpectatorSeat(room, playerId)) return
    const seat = room.seatOf(playerId)
    if (!seat || seat.isBot || seat.left || room.disposed) return
    if (room.match) {
      seat.left = true
      seat.connected = false
      seat.ready = false
      this.callMatch(room, "onLeave", playerId)
    } else {
      room.seats[seat.seat] = null
    }
    if (room.disposed) return
    if (room.hostId === playerId) this.migrateHost(room)
    if (room.activeHumans().length === 0) this.disposeRoom(room, "empty")
    else this.broadcastState(room)
  }

  private freeSpectatorSeat(room: Room, playerId: string): boolean {
    const index = room.spectators.findIndex((seat) => seat.playerId === playerId)
    if (index < 0) return false
    room.spectators.splice(index, 1)
    if (room.disposed) return true
    this.callMatch(room, "removeSpectator", playerId)
    this.broadcastState(room)
    return true
  }

  private migrateHost(room: Room): void {
    const humans = room.activeHumans()
    const pick = humans.find((seat) => seat.connected) ?? humans[0] ?? null
    const prev = room.hostId
    room.hostId = pick ? pick.playerId : null
    if (pick && prev !== pick.playerId) this.log.info?.(`[lobby] ${room.code} host → ${pick.name}`)
  }

  private startGrace(room: Room, seat: { playerId: string }): void {
    const playerId = seat.playerId
    this.clearGrace(playerId)
    const timer = setTimeout(() => {
      this.graceTimers.delete(playerId)
      if (room.disposed || room.match) return
      const member = room.seatOf(playerId) ?? room.spectatorOf(playerId)
      if (!member || member.connected) return
      const session = this.registry.byId(playerId)
      if (session && session.roomCode === room.code) {
        session.notice = "timeout"
        session.pendingResult = this.replayFor(room, playerId)
      }
      this.removeMember(room, playerId)
    }, this.opts.lobbyGraceMs)
    timer.unref?.()
    this.graceTimers.set(playerId, timer)
  }

  private clearGrace(playerId: string): void {
    const timer = this.graceTimers.get(playerId)
    if (timer) {
      clearTimeout(timer)
      this.graceTimers.delete(playerId)
    }
  }

  private disposeRoom(room: Room, reason: string): void {
    if (room.disposed) return
    room.disposed = true
    if (this.rooms.get(room.code) === room) this.rooms.delete(room.code)
    const ctx = room.matchCtx
    room.match = null
    room.matchCtx = null
    room.matchKey = null
    room.replay = null
    for (const seat of room.seats) {
      if (!seat || seat.isBot) continue
      this.clearGrace(seat.playerId)
      const session = this.registry.byId(seat.playerId)
      if (!session || session.roomCode !== room.code) continue
      session.roomCode = null
      if (seat.left || reason === "empty") continue
      if (session.connected) sendSession(session, { t: "room.closed", reason })
      else session.notice = reason
    }
    for (const seat of room.spectators) {
      this.clearGrace(seat.playerId)
      const session = this.registry.byId(seat.playerId)
      if (!session || session.roomCode !== room.code) continue
      session.roomCode = null
      if (session.connected) sendSession(session, { t: "room.closed", reason })
      else session.notice = reason
    }
    if (ctx) this.disposeMatchCtx(ctx)
    this.log.info?.(`[lobby] ${room.code} disposed (${reason})`)
  }

  private genCode(): string | null {
    for (let attempt = 0; attempt < 1000; attempt++) {
      let code = ""
      for (let i = 0; i < ROOM_CODE_LEN; i++) code += CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length))
      if (!this.rooms.has(code)) return code
    }
    return null
  }

  // MARK: send

  private *memberSessions(room: Room): Generator<Session> {
    for (const member of [...room.seats, ...room.spectators]) {
      if (!liveMember(member)) continue
      const session = this.registry.byId(member.playerId)
      if (session && session.connected && session.roomCode === room.code) yield session
    }
  }

  private broadcastState(room: Room): void {
    if (room.disposed) return
    const data = encode(room.toState())
    if (data == null) return
    for (const session of this.memberSessions(room)) sendRaw(session.ws, data)
  }

  private sendState(room: Room, session: Session): void {
    sendSession(session, room.toState())
  }

  private broadcastRoom(room: Room, msg: object): string | null {
    if (room.disposed) return null
    const data = encode(msg)
    if (data == null) {
      this.log.error?.(`[lobby] ${room.code} unserializable broadcast ${String(wireType(msg))}`)
      return null
    }
    const droppable = isDroppable({ t: wireType(msg) })
    for (const session of this.memberSessions(room)) sendRaw(session.ws, data, { droppable })
    return data
  }

  private sendToPlayer(room: Room, playerId: string, msg: object): boolean {
    if (room.disposed) return false
    const seat = room.seatOf(playerId) ?? room.spectatorOf(playerId)
    if (!liveMember(seat)) return false
    const session = this.registry.byId(playerId)
    if (!session || session.roomCode !== room.code) return false
    return sendSession(session, msg)
  }
}
