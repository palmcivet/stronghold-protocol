import { createRequire } from "node:module"
import type { IncomingMessage } from "node:http"
import type { Duplex } from "node:stream"
import { Network } from "#server/connection/session.js"
import type { WebSocket } from "#server/connection/socket.js"

const require = createRequire(import.meta.url)

export const WS_MAX_PAYLOAD: number = 64 * 1024

export interface SocketServer {
  on(event: "connection", listener: (socket: WebSocket, request: IncomingMessage) => void): void
  on(event: "error", listener: (error: unknown) => void): void
  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer, callback: (socket: WebSocket) => void): void
  emit(event: "connection", socket: WebSocket, request: IncomingMessage): boolean
  close(): void
}

const { WebSocketServer } = require("ws") as {
  WebSocketServer: new (options: {
    noServer?: boolean
    maxPayload?: number
    perMessageDeflate?: boolean
    clientTracking?: boolean
  }) => SocketServer
}

/** WebSocket server for `/ws`. Compression stays off. Inbound frames are capped at 64 KiB. */
export function createWebSocketServer(): SocketServer {
  return new WebSocketServer({ noServer: true, maxPayload: WS_MAX_PAYLOAD, perMessageDeflate: false, clientTracking: false })
}

export function bindWebSocket(server: SocketServer, network: Network): void {
  server.on("connection", (ws, request) => adoptSocket(network, ws, request))
  server.on("error", (cause) => network.log.error?.("[ws] server error", cause))
}

/** Bind one upgraded socket: a frame arrived, a pong arrived, or the socket closed. */
export function adoptSocket(network: Network, ws: WebSocket, request: IncomingMessage | undefined): void {
  const conn = network.open(ws, request)
  if (!conn) return
  ws.on("message", (data, isBinary) => {
    try { network.onFrame(conn, data, isBinary) } catch (cause) { network.log.error?.("[net] frame handler crashed", cause) }
  })
  ws.on("pong", () => network.notePong(conn))
  ws.on("error", (cause) => network.log.debug?.("[net] socket error", cause?.code || cause?.message))
  ws.on("close", () => {
    try { network.onClose(conn) } catch (cause) { network.log.error?.("[net] close handler crashed", cause) }
  })
}
