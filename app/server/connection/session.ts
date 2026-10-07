import { randomBytes } from "node:crypto"
import type { IncomingMessage } from "node:http"
import type { RawData, WebSocket } from "#server/connection/socket.js"
import { C2S, validateC2S } from "#contract/message.js"
import { ERR, ERR_TEXT, NAME_MAX_LEN, PROTOCOL_VERSION, type ErrCode } from "#contract/match.js"
import { clientAddress, type TrustProxy } from "#server/connection/address.js"

export interface NetOptions {
  ratePerSec: number
  rateBurst: number
  abuseDropsPerSec: number
  heartbeatMs: number
  helloTimeoutMs: number
  reconnectWindowMs: number
  snapDropBytes: number
  hardBufferBytes: number
  maxConnections: number
  maxConnectionsPerAddr: number
  maxSessions: number
  heavyPerSec: number
  heavyBurst: number
  trustProxy: TrustProxy
}

export const NET_DEFAULTS: NetOptions = Object.freeze({
  ratePerSec: 40,
  rateBurst: 40,
  abuseDropsPerSec: 400,
  heartbeatMs: 30_000,
  helloTimeoutMs: 30_000,
  reconnectWindowMs: 10 * 60_000,
  snapDropBytes: 1 << 20,
  hardBufferBytes: 16 << 20,
  maxConnections: 2000,
  maxConnectionsPerAddr: 64,
  maxSessions: 20_000,
  heavyPerSec: 2,
  heavyBurst: 6,
  trustProxy: "auto",
})

export const HEAVY_TYPES: ReadonlySet<string> = new Set(["g.watch", "room.loadout", "room.spectate"])

export const CLOSE = Object.freeze({
  REPLACED: 4001,
  HELLO_TIMEOUT: 4002,
  POLICY: 1008,
  SHUTDOWN: 1001,
})

const WS_OPEN = 1
const MAX_RID = 2 ** 31
const PEEK_RID_MAX_BYTES = 2048

export interface NetLog {
  info?(...args: unknown[]): void
  warn?(...args: unknown[]): void
  error?(...args: unknown[]): void
  debug?(...args: unknown[]): void
}

const noopLog: NetLog = { info() {}, warn() {}, error() {}, debug() {} }

export interface StoredLoadout {
  readonly [chessId: string]: { skill: number; module: string | null }
}

/** One player identity. The socket can drop; the token keeps the seat for the reconnect window. */
export class Session {
  readonly playerId: string
  readonly token: string
  name: string
  ws: WebSocket | null = null
  connected = false
  lastSeen: number
  disconnectedAt: number | null
  roomCode: string | null = null
  notice: string | null = null
  pendingResult: string[] | null = null
  resyncAt = -Infinity
  loadout: StoredLoadout | null = null
  addr = "?"
  limitKey: string | null = null
  resumeWindowMs: number | null = null

  constructor(init: { playerId: string; token: string; name: string; now?: number }) {
    this.playerId = init.playerId
    this.token = init.token
    this.name = init.name
    const now = init.now ?? Date.now()
    this.lastSeen = now
    this.disconnectedAt = now
  }
}

export const newToken = (): string => randomBytes(16).toString("hex")

export class SessionRegistry {
  readonly reconnectWindowMs: number
  readonly maxSessions: number
  readonly now: () => number
  private readonly byPlayerId = new Map<string, Session>()
  private readonly byTokenMap = new Map<string, Session>()

  constructor(options: { reconnectWindowMs?: number; maxSessions?: number; now?: () => number } = {}) {
    this.reconnectWindowMs = options.reconnectWindowMs ?? NET_DEFAULTS.reconnectWindowMs
    this.maxSessions = options.maxSessions ?? NET_DEFAULTS.maxSessions
    this.now = options.now ?? Date.now
  }

  get size(): number {
    return this.byPlayerId.size
  }

  create(name: string): Session | null {
    if (this.byPlayerId.size >= this.maxSessions && !this.evictOne()) return null
    let playerId = ""
    do playerId = "p_" + randomBytes(5).toString("hex")
    while (this.byPlayerId.has(playerId))
    let token = ""
    do token = newToken()
    while (this.byTokenMap.has(token))
    const session = new Session({ playerId, token, name, now: this.now() })
    this.byPlayerId.set(playerId, session)
    this.byTokenMap.set(token, session)
    return session
  }

  byToken(token: unknown): Session | null {
    if (typeof token !== "string" || token.length === 0) return null
    const session = this.byTokenMap.get(token)
    if (!session || this.isExpired(session, this.now())) return null
    return session
  }

  byId(playerId: string): Session | null {
    return this.byPlayerId.get(playerId) ?? null
  }

  remove(session: Session): void {
    if (this.byPlayerId.get(session.playerId) === session) this.byPlayerId.delete(session.playerId)
    if (this.byTokenMap.get(session.token) === session) this.byTokenMap.delete(session.token)
  }

  windowOf(session: Session): number {
    const own = session.resumeWindowMs
    return typeof own === "number" && own > this.reconnectWindowMs ? own : this.reconnectWindowMs
  }

  isExpired(session: Session, now: number): boolean {
    return !session.connected && session.disconnectedAt != null && now - session.disconnectedAt > this.windowOf(session)
  }

  sweep(now: number = this.now()): Session[] {
    const expired: Session[] = []
    for (const session of this.byPlayerId.values()) if (this.isExpired(session, now)) expired.push(session)
    for (const session of expired) this.remove(session)
    return expired
  }

  evictOne(): boolean {
    for (const session of this.byPlayerId.values()) {
      if (!session.connected && !session.roomCode) {
        this.remove(session)
        return true
      }
    }
    return false
  }

  all(): IterableIterator<Session> {
    return this.byPlayerId.values()
  }
}

export class TokenBucket {
  private readonly rate: number
  private readonly burst: number
  private tokens: number
  private at: number

  constructor(ratePerSec: number, burst: number, now: number) {
    this.rate = ratePerSec / 1000
    this.burst = burst
    this.tokens = burst
    this.at = now
  }

  take(now: number): boolean {
    const elapsed = Math.max(0, now - this.at)
    this.at = now
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.rate)
    if (this.tokens >= 1) {
      this.tokens -= 1
      return true
    }
    return false
  }
}

export function encode(msg: object): string | null {
  try {
    const text = JSON.stringify(msg)
    return typeof text === "string" ? text : null
  } catch {
    return null
  }
}

const onSendDone = (err?: Error): void => { void err }

export function sendRaw(ws: WebSocket | null | undefined, data: string, options: { droppable?: boolean } = {}): boolean {
  if (!ws || ws.readyState !== WS_OPEN || typeof data !== "string") return false
  try {
    const queued = ws.bufferedAmount
    if (queued > NET_DEFAULTS.hardBufferBytes) {
      ws.terminate()
      return false
    }
    if (options.droppable && queued > NET_DEFAULTS.snapDropBytes) return false
    ws.send(data, onSendDone)
    return true
  } catch {
    return false
  }
}

export function isDroppable(msg: { t?: unknown } | null | undefined): boolean {
  return !!msg && msg.t === "b.snap"
}

export function send(ws: WebSocket | null | undefined, msg: object): boolean {
  const data = encode(msg)
  if (data == null) return false
  return sendRaw(ws, data, { droppable: isDroppable(msg as { t?: unknown }) })
}

export function sendSession(session: Session | null | undefined, msg: object): boolean {
  if (!session || !session.connected) return false
  return send(session.ws, msg)
}

export function validRid(rid: unknown): rid is number {
  return Number.isInteger(rid) && (rid as number) >= 0 && (rid as number) <= MAX_RID
}

export function isErrCode(code: unknown): code is ErrCode {
  return typeof code === "string" && Object.hasOwn(ERR, code)
}

export function errorMsg(code: string, rid?: unknown, detail?: string): { t: "error"; code: string; msg: string; rid?: number; detail?: string } {
  const known = isErrCode(code)
  const frame: { t: "error"; code: string; msg: string; rid?: number; detail?: string } = {
    t: "error",
    code: known ? code : ERR.INTERNAL,
    msg: known ? ERR_TEXT[code] || ERR_TEXT.INTERNAL : ERR_TEXT.INTERNAL,
  }
  if (validRid(rid)) frame.rid = rid
  if (detail) frame.detail = String(detail).slice(0, 120)
  return frame
}

const STRIP_RANGES: readonly (readonly [number, number])[] = [
  [0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff],
]
const hexEscape = (n: number): string => "\\u" + n.toString(16).padStart(4, "0")
const STRIP_RE = new RegExp("[" + STRIP_RANGES.map(([start, end]) => (start === end ? hexEscape(start) : `${hexEscape(start)}-${hexEscape(end)}`)).join("") + "]", "g")
const LONE_SURROGATE_RE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g

export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  let text = raw.normalize("NFC").replace(LONE_SURROGATE_RE, "").replace(/\s+/g, " ").replace(STRIP_RE, "").replace(/ {2,}/g, " ").trim()
  text = [...text].slice(0, NAME_MAX_LEN).join("").trim()
  return text.length > 0 ? text : null
}

export interface HandlerResult {
  ok?: true
  error?: string
  detail?: string
}

export interface NetHandler {
  onHello?(session: Session, info: { resumed: boolean; repeat: boolean }): void
  onMessage(session: Session, msg: Record<string, unknown>): HandlerResult | undefined | void
  routeGame?(session: Session, msg: Record<string, unknown>): HandlerResult | undefined | void
  onDisconnect?(session: Session): void
  onExpire?(session: Session): void
}

export class Connection {
  readonly ws: WebSocket
  readonly ip: string
  readonly key: string | null
  readonly openedAt: number
  alive = true
  session: Session | null = null
  readonly bucket: TokenBucket
  readonly heavy: TokenBucket
  dropWindowAt: number
  drops = 0
  closing = false

  constructor(ws: WebSocket, addr: { ip: string; key: string | null }, now: number, opts: NetOptions) {
    this.ws = ws
    this.ip = addr.ip
    this.key = addr.key
    this.openedAt = now
    this.bucket = new TokenBucket(opts.ratePerSec, opts.rateBurst, now)
    this.heavy = new TokenBucket(opts.heavyPerSec, opts.heavyBurst, now)
    this.dropWindowAt = now
  }

  close(code: number, reason: string): void {
    this.closing = true
    try { this.ws.close(code, reason) } catch { /* ignore */ }
  }
}

export class Network {
  readonly registry: SessionRegistry
  readonly handler: NetHandler
  readonly log: NetLog
  readonly now: () => number
  readonly opts: NetOptions
  private readonly conns = new Map<WebSocket, Connection>()
  private readonly connsPerKey = new Map<string, number>()
  closed = false
  private readonly heartbeatTimer: ReturnType<typeof setInterval>
  private readonly sweepTimer: ReturnType<typeof setInterval>

  constructor(options: {
    registry: SessionRegistry
    handler: NetHandler
    log?: NetLog
    now?: () => number
    options?: Partial<NetOptions>
  }) {
    this.registry = options.registry
    this.handler = options.handler
    this.log = options.log ?? noopLog
    this.now = options.now ?? Date.now
    this.opts = { ...NET_DEFAULTS, ...options.options }
    this.heartbeatTimer = setInterval(() => this.heartbeat(), this.opts.heartbeatMs)
    this.heartbeatTimer.unref?.()
    const sweepMs = Math.max(20, Math.min(15_000, Math.floor(this.opts.reconnectWindowMs / 4)))
    this.sweepTimer = setInterval(() => this.sweep(), sweepMs)
    this.sweepTimer.unref?.()
  }

  get connectionCount(): number {
    return this.conns.size
  }

  admission(req: IncomingMessage): null | "shutdown" | "full" | "per-address" {
    if (this.closed) return "shutdown"
    if (this.conns.size >= this.opts.maxConnections) return "full"
    const { key } = clientAddress(req, this.opts.trustProxy)
    const cap = this.opts.maxConnectionsPerAddr
    if (key && cap > 0 && (this.connsPerKey.get(key) ?? 0) >= cap) return "per-address"
    return null
  }

  /** Register a socket that `connection/ws` has already upgraded. Returns null when the process is closing. */
  open(ws: WebSocket, req: IncomingMessage | undefined): Connection | null {
    if (this.closed) {
      try { ws.close(CLOSE.SHUTDOWN, "server shutdown") } catch { /* ignore */ }
      return null
    }
    const conn = new Connection(ws, clientAddress(req, this.opts.trustProxy), this.now(), this.opts)
    this.conns.set(ws, conn)
    if (conn.key) this.connsPerKey.set(conn.key, (this.connsPerKey.get(conn.key) ?? 0) + 1)
    return conn
  }

  reply(conn: Connection, msg: object): boolean {
    return send(conn.ws, msg)
  }

  onFrame(conn: Connection, data: RawData, isBinary: boolean): void {
    if (conn.closing || this.closed) return
    const now = this.now()
    conn.alive = true
    if (conn.session && conn.session.ws === conn.ws) conn.session.lastSeen = now

    if (!conn.bucket.take(now)) {
      if (now - conn.dropWindowAt >= 1000) {
        conn.dropWindowAt = now
        conn.drops = 0
      }
      if (++conn.drops > this.opts.abuseDropsPerSec) {
        this.log.warn?.(`[net] closing flooding socket ${conn.ip}`)
        conn.close(CLOSE.POLICY, "rate limit")
        return
      }
      this.reply(conn, errorMsg(ERR.RATE, peekRid(data, isBinary)))
      return
    }

    if (isBinary) {
      this.reply(conn, errorMsg(ERR.BAD_MSG, undefined, "binary frame"))
      return
    }
    let msg: unknown
    try { msg = JSON.parse(frameText(data)) } catch {
      this.reply(conn, errorMsg(ERR.BAD_MSG, undefined, "invalid json"))
      return
    }
    const record = msg && typeof msg === "object" && !Array.isArray(msg) ? msg as Record<string, unknown> : null
    const rid = record ? record.rid : undefined
    if (!record || typeof record.t !== "string" || !Object.hasOwn(C2S, record.t)) {
      const label = record ? String(record.t).slice(0, 32) : typeof msg
      this.reply(conn, errorMsg(ERR.BAD_MSG, rid, `unknown type ${label}`))
      return
    }
    const reason = validateC2S(record)
    if (reason) {
      this.reply(conn, errorMsg(ERR.BAD_MSG, rid, reason))
      return
    }

    if (record.t === "ping") {
      const pong: { t: "pong"; c: unknown; s: number; rid?: number } = { t: "pong", c: record.c, s: now }
      if (validRid(rid)) pong.rid = rid
      this.reply(conn, pong)
      return
    }
    if (record.t === "hello") {
      this.onHelloMsg(conn, record, now)
      return
    }
    if (!conn.session) {
      this.reply(conn, errorMsg(ERR.BAD_MSG, rid, "hello required"))
      return
    }
    if (HEAVY_TYPES.has(record.t) && !conn.heavy.take(now)) {
      this.reply(conn, errorMsg(ERR.RATE, rid, `${record.t} too often`))
      return
    }

    let result: HandlerResult | undefined | void
    try {
      if (record.t.startsWith("b.") && typeof this.handler.routeGame === "function") result = this.handler.routeGame(conn.session, record)
      else result = this.handler.onMessage(conn.session, record)
    } catch (cause) {
      this.log.error?.(`[net] handler crashed on ${record.t}`, cause)
      result = { error: ERR.INTERNAL }
    }
    if (result && result.error) {
      if (record.t === "b.progress" && !validRid(rid)) return
      this.reply(conn, errorMsg(isErrCode(result.error) ? result.error : ERR.INTERNAL, rid, result.detail))
    } else if (validRid(rid)) this.reply(conn, { t: "ok", rid })
  }

  notePong(conn: Connection): void {
    conn.alive = true
    if (conn.session && conn.session.ws === conn.ws) conn.session.lastSeen = this.now()
  }

  onHelloMsg(conn: Connection, msg: Record<string, unknown>, now: number): void {
    const rid = msg.rid
    if (msg.version != null && msg.version !== PROTOCOL_VERSION) {
      this.reply(conn, errorMsg(ERR.BAD_MSG, rid, `version mismatch: server ${PROTOCOL_VERSION}`))
      return
    }
    const name = sanitizeName(msg.name)
    if (!name) {
      this.reply(conn, errorMsg(ERR.BAD_MSG, rid, "bad field name"))
      return
    }

    let session = conn.session
    let resumed = false
    const repeat = !!session
    if (!session) {
      session = msg.token ? this.registry.byToken(msg.token) : null
      if (session) {
        resumed = true
        if (session.ws && session.ws !== conn.ws) this.detachReplaced(session.ws)
      } else {
        session = this.registry.create(name)
        if (!session) {
          this.reply(conn, errorMsg(ERR.INTERNAL, rid, "server full"))
          return
        }
      }
      conn.session = session
      session.ws = conn.ws
      session.connected = true
      session.disconnectedAt = null
    }
    session.name = name
    session.lastSeen = now
    session.addr = conn.ip
    session.limitKey = conn.key

    const welcome: { t: "welcome"; playerId: string; token: string; name: string; serverNow: number; version: number; resumed: boolean; rid?: number } = {
      t: "welcome",
      playerId: session.playerId,
      token: session.token,
      name: session.name,
      serverNow: now,
      version: PROTOCOL_VERSION,
      resumed,
    }
    if (validRid(rid)) welcome.rid = rid
    this.reply(conn, welcome)
    try {
      this.handler.onHello?.(session, { resumed, repeat })
    } catch (cause) {
      this.log.error?.("[net] onHello crashed", cause)
    }
  }

  detachReplaced(oldWs: WebSocket): void {
    const old = this.conns.get(oldWs)
    if (old) {
      old.session = null
      old.close(CLOSE.REPLACED, "session replaced")
    } else {
      try { oldWs.close(CLOSE.REPLACED, "session replaced") } catch { /* ignore */ }
    }
  }

  onClose(conn: Connection): void {
    if (this.conns.delete(conn.ws) && conn.key) {
      const left = (this.connsPerKey.get(conn.key) ?? 1) - 1
      if (left > 0) this.connsPerKey.set(conn.key, left)
      else this.connsPerKey.delete(conn.key)
    }
    const session = conn.session
    conn.session = null
    if (!session || session.ws !== conn.ws) return
    session.ws = null
    session.connected = false
    session.disconnectedAt = this.now()
    if (this.closed) return
    try { this.handler.onDisconnect?.(session) } catch (cause) { this.log.error?.("[net] onDisconnect crashed", cause) }
  }

  heartbeat(): void {
    const now = this.now()
    for (const conn of this.conns.values()) {
      try {
        if (conn.closing) {
          if (!conn.alive) conn.ws.terminate()
          conn.alive = false
          continue
        }
        if (!conn.session && now - conn.openedAt > this.opts.helloTimeoutMs) {
          conn.close(CLOSE.HELLO_TIMEOUT, "hello timeout")
          continue
        }
        if (!conn.alive) {
          conn.ws.terminate()
          continue
        }
        conn.alive = false
        conn.ws.ping()
      } catch (cause) {
        const error = cause as { message?: string }
        this.log.debug?.("[net] heartbeat error", error?.message)
      }
    }
  }

  sweep(): void {
    let expired: Session[]
    try { expired = this.registry.sweep(this.now()) } catch (cause) {
      this.log.error?.("[net] sweep crashed", cause)
      return
    }
    for (const session of expired) {
      try { this.handler.onExpire?.(session) } catch (cause) { this.log.error?.("[net] onExpire crashed", cause) }
    }
  }

  close(code: number = CLOSE.SHUTDOWN, reason = "server shutdown"): void {
    if (this.closed) return
    this.closed = true
    clearInterval(this.heartbeatTimer)
    clearInterval(this.sweepTimer)
    for (const conn of this.conns.values()) {
      conn.close(code, reason)
      const timer = setTimeout(() => { try { conn.ws.terminate() } catch { /* ignore */ } }, 1000)
      timer.unref?.()
    }
  }
}

function frameText(data: RawData): string {
  if (typeof data === "string") return data
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8")
  return Buffer.from(data as Buffer).toString("utf8")
}

function frameLength(data: RawData): number {
  if (typeof data === "string") return Buffer.byteLength(data)
  if (Array.isArray(data)) return data.reduce((sum, chunk) => sum + chunk.length, 0)
  return Buffer.from(data as Buffer).length
}

function peekRid(data: RawData, isBinary: boolean): unknown {
  if (isBinary || !data || frameLength(data) > PEEK_RID_MAX_BYTES) return undefined
  try {
    const parsed: unknown = JSON.parse(frameText(data))
    return parsed && typeof parsed === "object" ? (parsed as { rid?: unknown }).rid : undefined
  } catch {
    return undefined
  }
}
