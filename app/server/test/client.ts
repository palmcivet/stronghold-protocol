import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

export interface Frame {
  [key: string]: any
}

interface ClientSocket {
  readonly readyState: number
  send(data: string | Buffer, options?: { binary?: boolean }): void
  close(): void
  terminate(): void
  once(event: "open", listener: () => void): void
  once(event: "error", listener: (error: Error) => void): void
  on(event: "close", listener: (code: number, reason: Buffer) => void): void
  on(event: "error", listener: (error: Error) => void): void
  on(event: "message", listener: (data: Buffer | ArrayBuffer | Buffer[] | string, isBinary: boolean) => void): void
}

interface ClientCtor {
  new (url: string, options?: object): ClientSocket
  readonly OPEN: number
  readonly CLOSED: number
}

const { WebSocket } = require("ws") as { WebSocket: ClientCtor }

const REPLY_TYPES: ReadonlySet<string> = new Set(["ok", "error", "welcome", "pong"])

export interface ConnectOptions {
  timeout?: number
  wsOptions?: object
}

export interface CloseInfo {
  code: number
  reason: string
}

interface Waiter {
  match: (msg: Frame) => boolean
  resolve: (msg: Frame) => void
}

/** Promise-based WebSocket client. Inbound JSON frames land in an inbox that `waitFor` consumes. */
export class TestClient {
  private readonly ws: ClientSocket
  readonly inbox: Frame[] = []
  readonly log: Frame[] = []
  private readonly waiters: Waiter[] = []
  private nextRid = 1
  closeInfo: CloseInfo | null = null
  readonly closed: Promise<CloseInfo>
  id = ""
  token = ""
  welcome: Frame | null = null

  static connect(url: string, options: ConnectOptions = {}): Promise<TestClient> {
    const timeout = options.timeout ?? 3000
    const wsOptions = options.wsOptions ?? {}
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, wsOptions)
      const timer = setTimeout(() => {
        ws.terminate()
        reject(new Error(`connect timeout ${url}`))
      }, timeout)
      ws.once("open", () => {
        clearTimeout(timer)
        resolve(new TestClient(ws))
      })
      ws.once("error", (error) => {
        clearTimeout(timer)
        reject(error)
      })
    })
  }

  constructor(ws: ClientSocket) {
    this.ws = ws
    this.closed = new Promise((resolve) => {
      ws.on("close", (code, reason) => {
        this.closeInfo = { code, reason: reason.toString() }
        resolve(this.closeInfo)
      })
    })
    ws.on("error", () => {})
    ws.on("message", (data, isBinary) => {
      if (isBinary) return
      let msg: Frame
      try {
        msg = JSON.parse(Buffer.isBuffer(data) ? data.toString() : String(data)) as Frame
      } catch {
        return
      }
      this.log.push(msg)
      const index = this.waiters.findIndex((waiter) => waiter.match(msg))
      const waiter = index >= 0 ? this.waiters.splice(index, 1)[0] : undefined
      if (waiter) waiter.resolve(msg)
      else this.inbox.push(msg)
    })
  }

  get isOpen(): boolean {
    return this.ws.readyState === WebSocket.OPEN
  }

  /** Assigns `rid` unless the message already has one. `rid: null` omits it. */
  send(msg: Frame): number | undefined {
    const out: Frame = { ...msg }
    if (out.rid === undefined) out.rid = this.nextRid++
    if (out.rid === null) delete out.rid
    this.ws.send(JSON.stringify(out))
    return typeof out.rid === "number" ? out.rid : undefined
  }

  sendRaw(data: string | Buffer, options: { binary?: boolean } = {}): void {
    this.ws.send(data, { binary: options.binary ?? false })
  }

  waitFor(type: string | null, predicate: (msg: Frame) => boolean = () => true, timeout = 2000): Promise<Frame> {
    const match = (msg: Frame): boolean => (type == null || msg.t === type) && predicate(msg)
    const index = this.inbox.findIndex(match)
    const found = index >= 0 ? this.inbox.splice(index, 1)[0] : undefined
    if (found) return Promise.resolve(found)
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        match,
        resolve: (msg) => {
          clearTimeout(timer)
          resolve(msg)
        },
      }
      const timer = setTimeout(() => {
        const at = this.waiters.indexOf(waiter)
        if (at >= 0) this.waiters.splice(at, 1)
        const recent = this.log.slice(-8).map((msg) => msg.t + (msg.code ? `:${msg.code}` : "")).join(", ")
        reject(new Error(`timeout waiting for ${type ?? "any"} (recent: ${recent || "none"})`))
      }, timeout)
      this.waiters.push(waiter)
    })
  }

  async expectNone(type: string | null, predicate: (msg: Frame) => boolean = () => true, ms = 150): Promise<void> {
    const got = await this.waitFor(type, predicate, ms).catch(() => null)
    if (got) throw new Error(`unexpected ${got.t}: ${JSON.stringify(got).slice(0, 200)}`)
  }

  request(msg: Frame, timeout = 2000): Promise<Frame> {
    const rid = this.send({ ...msg, rid: this.nextRid++ })
    return this.waitFor(null, (frame) => REPLY_TYPES.has(frame.t) && frame.rid === rid, timeout)
  }

  async hello(name: string, token?: string, extra: Frame = {}): Promise<Frame> {
    const body: Frame = { t: "hello", name, version: 1, ...extra }
    if (token) body.token = token
    const reply = await this.request(body)
    if (reply.t !== "welcome") throw new Error(`hello failed: ${JSON.stringify(reply)}`)
    return reply
  }

  clearInbox(): void {
    this.inbox.length = 0
  }

  async close(): Promise<CloseInfo | null> {
    if (this.ws.readyState === WebSocket.CLOSED) return this.closeInfo
    this.ws.close()
    return this.closed
  }

  async terminate(): Promise<CloseInfo> {
    this.ws.terminate()
    return this.closed
  }
}

export async function connectAs(url: string, name: string, token?: string): Promise<{ client: TestClient; welcome: Frame }> {
  const client = await TestClient.connect(url)
  const welcome = await client.hello(name, token)
  return { client, welcome }
}
