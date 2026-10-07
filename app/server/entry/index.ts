import http from "node:http"
import type { IncomingMessage, ServerResponse } from "node:http"
import os from "node:os"
import { CLOSE, NET_DEFAULTS, Network, SessionRegistry, type NetLog, type NetOptions } from "#server/connection/session.js"
import { bindWebSocket, createWebSocketServer, WS_MAX_PAYLOAD } from "#server/connection/ws.js"
import { applySecurityHeaders, healthzBody, MAX_URL_LENGTH, rejectTarget, requestTarget, sendError, sendJson, type HealthCounters } from "#server/connection/http.js"
import { getData, loadData, type DataLog, type PacketData } from "#server/entry/packet.js"
import { Lobby, type MatchConstructor } from "#server/room/index.js"

export { WS_MAX_PAYLOAD }

export interface ServerOptions {
  port?: number
  host?: string
  quiet?: boolean
  log?: NetLog
  dataDir?: string
  build?: string | null
  MatchClass?: MatchConstructor
  seedFn?: () => number
  lobbyGraceMs?: number
  reconnectWindowMs?: number
  soloReconnectWindowMs?: number | null
  heartbeatMs?: number
  helloTimeoutMs?: number
  ratePerSec?: number
  rateBurst?: number
  abuseDropsPerSec?: number
  maxConnections?: number
  maxConnectionsPerAddr?: number
  maxRooms?: number
  maxRoomsPerAddr?: number
  maxMatchesPerAddr?: number
  resyncMinGapMs?: number
  heavyPerSec?: number
  heavyBurst?: number
  trustProxy?: NetOptions["trustProxy"]
}

export interface RunningServer {
  port: number
  host: string
  url: string
  server: http.Server
  lobby: Lobby
  network: Network
  registry: SessionRegistry
  close: () => Promise<void>
}

const noopLog: NetLog = { info() {}, warn() {}, error() {}, debug() {} }

export function parseTrustProxy(value: string | undefined): NetOptions["trustProxy"] {
  const text = String(value ?? "").trim().toLowerCase()
  if (["1", "true", "yes", "on", "always"].includes(text)) return true
  if (["0", "false", "no", "off", "never"].includes(text)) return false
  return "auto"
}

export function resolveBuild(value: string | null | undefined): string | null {
  if (typeof value === "string" && value.length > 0) return value
  return null
}

export function lanUrls(port: number): string[] {
  const out: string[] = []
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      const family = address.family as string | number
      if ((family === "IPv4" || family === 4) && !address.internal) out.push(`http://${address.address}:${port}`)
    }
  }
  return out
}

function makeLogger(quiet: boolean): NetLog {
  if (quiet) return noopLog
  return {
    info: (...args) => console.log(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
    debug: process.env.DEBUG ? (...args) => console.debug(...args) : () => {},
  }
}

export async function startServer(opts: ServerOptions = {}): Promise<RunningServer> {
  const port = opts.port ?? (process.env.PORT != null && process.env.PORT !== "" ? Number(process.env.PORT) : 3000)
  const host = opts.host ?? process.env.HOST ?? "0.0.0.0"
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError(`invalid PORT ${port}`)
  const log = opts.log ?? makeLogger(!!opts.quiet)
  const data: PacketData = opts.dataDir ? loadData(opts.dataDir, { log: log as DataLog }) : getData({ log: log as DataLog })
  const build = resolveBuild(opts.build ?? process.env.BUILD ?? process.env.SP_BUILD)

  const netOptions: Partial<NetOptions> = {}
  if (opts.reconnectWindowMs != null) netOptions.reconnectWindowMs = opts.reconnectWindowMs
  if (opts.heartbeatMs != null) netOptions.heartbeatMs = opts.heartbeatMs
  if (opts.helloTimeoutMs != null) netOptions.helloTimeoutMs = opts.helloTimeoutMs
  if (opts.ratePerSec != null) netOptions.ratePerSec = opts.ratePerSec
  if (opts.rateBurst != null) netOptions.rateBurst = opts.rateBurst
  if (opts.maxConnections != null) netOptions.maxConnections = opts.maxConnections
  if (opts.abuseDropsPerSec != null) netOptions.abuseDropsPerSec = opts.abuseDropsPerSec
  if (opts.maxConnectionsPerAddr != null) netOptions.maxConnectionsPerAddr = opts.maxConnectionsPerAddr
  if (opts.heavyPerSec != null) netOptions.heavyPerSec = opts.heavyPerSec
  if (opts.heavyBurst != null) netOptions.heavyBurst = opts.heavyBurst
  netOptions.trustProxy = opts.trustProxy ?? parseTrustProxy(process.env.TRUST_PROXY)
  const registry = new SessionRegistry({ reconnectWindowMs: netOptions.reconnectWindowMs ?? NET_DEFAULTS.reconnectWindowMs })
  const lobbyOptions: {
    lobbyGraceMs?: number
    maxRooms?: number
    maxRoomsPerAddr?: number
    maxMatchesPerAddr?: number
    resyncMinGapMs?: number
    soloReconnectWindowMs?: number | null
  } = {}
  for (const key of ["lobbyGraceMs", "maxRooms", "maxRoomsPerAddr", "maxMatchesPerAddr", "resyncMinGapMs", "soloReconnectWindowMs"] as const) {
    if (opts[key] != null) lobbyOptions[key] = opts[key]
  }
  const lobby = new Lobby({
    registry,
    log,
    ...(opts.MatchClass ? { MatchClass: opts.MatchClass } : {}),
    getData: () => data,
    ...(opts.seedFn ? { seedFn: opts.seedFn } : {}),
    options: lobbyOptions,
  })
  const network = new Network({ registry, handler: lobby, log, options: netOptions })
  const startedAt = Date.now()
  const sockets = createWebSocketServer()
  bindWebSocket(sockets, network)

  const server = http.createServer((request, response) => {
    applySecurityHeaders(response)
    handleRequest(request, response).catch((cause) => {
      log.error?.("[http] request failed", cause)
      sendError(request, response, 500, "服务器内部错误 · Internal error")
    })
  })

  async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = request.url || "/"
    const rejected = rejectTarget(request.method, url)
    if (rejected) {
      if (rejected.allow) response.setHeader("Allow", "GET, HEAD")
      sendError(request, response, rejected.status, rejected.text)
      return
    }
    const target = requestTarget(url)
    if (!target) {
      sendError(request, response, 400, "请求地址无效 · Bad request")
      return
    }
    if (target.path === "/healthz") {
      const counters: HealthCounters = lobby.stats()
      sendJson(request, response, 200, healthzBody({
        startedAt,
        build,
        sockets: network.connectionCount,
        sessions: registry.size,
        counters,
      }))
      return
    }
    sendError(request, response, 404, "未找到 · Not found")
  }

  server.on("clientError", (error: NodeJS.ErrnoException, socket) => {
    if (error?.code === "ECONNRESET") {
      socket.destroy()
      return
    }
    try {
      if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n")
      else socket.destroy()
    } catch { /* ignore */ }
  })

  server.on("upgrade", (request, socket, head) => {
    const duplex = socket
    duplex.on("error", () => {})
    const url = request.url || "/"
    const reject = (status: number, text: string): void => {
      try { duplex.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`) } catch { duplex.destroy() }
    }
    if (url.length > MAX_URL_LENGTH) {
      reject(414, "URI Too Long")
      return
    }
    const target = requestTarget(url)
    if (!target || target.path !== "/ws") {
      reject(404, "Not Found")
      return
    }
    const refused = network.admission(request)
    if (refused === "per-address") {
      reject(429, "Too Many Requests")
      return
    }
    if (refused) {
      reject(503, "Service Unavailable")
      return
    }
    try {
      sockets.handleUpgrade(request, duplex, head, (ws) => {
        sockets.emit("connection", ws, request)
      })
    } catch (cause) {
      log.error?.("[ws] upgrade failed", cause)
      duplex.destroy()
    }
  })

  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (cause: Error): void => {
        server.off("listening", onListening)
        reject(cause)
      }
      const onListening = (): void => {
        server.off("error", onError)
        resolve()
      }
      server.once("error", onError)
      server.once("listening", onListening)
      server.listen(port, host)
    })
  } catch (cause) {
    network.close()
    throw cause
  }
  server.on("error", (cause) => log.error?.("[http] server error", cause))

  const address = server.address()
  const actualPort = typeof address === "object" && address ? address.port : port
  const url = `http://${host === "0.0.0.0" || host === "::" ? "localhost" : host}:${actualPort}`

  let closing: Promise<void> | null = null
  function close(): Promise<void> {
    if (closing) return closing
    closing = (async () => {
      try { lobby.shutdown("shutdown") } catch (cause) { log.error?.("[shutdown] lobby", cause) }
      network.close(CLOSE.SHUTDOWN, "server shutdown")
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
        server.closeIdleConnections?.()
        setTimeout(() => { server.closeAllConnections?.() }, 500).unref()
      })
      try { sockets.close() } catch { /* ignore */ }
    })()
    return closing
  }

  return { port: actualPort, host, url, server, lobby, network, registry, close }
}
