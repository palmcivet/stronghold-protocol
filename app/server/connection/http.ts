import type { IncomingMessage, ServerResponse } from "node:http"
import { APP_VERSION, PROTOCOL_VERSION } from "#contract/match.js"

export const MAX_URL_LENGTH: number = 4096

export interface HealthCounters {
  readonly rooms: number
  readonly matches: number
  readonly humans: number
  readonly bots: number
  readonly spectators: number
}

export interface HealthzBody extends HealthCounters {
  readonly ok: true
  readonly version: number
  readonly app: string
  readonly uptimeSec: number
  readonly build: string | null
  readonly sockets: number
  readonly sessions: number
}

export function applySecurityHeaders(response: ServerResponse): void {
  response.setHeader("X-Content-Type-Options", "nosniff")
  response.setHeader("Referrer-Policy", "same-origin")
}

function sendText(request: IncomingMessage, response: ServerResponse, status: number, text: string): void {
  const body = Buffer.from(text)
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": request.method === "HEAD" ? body.length : body.length,
    "Cache-Control": "no-store",
  })
  if (request.method === "HEAD") response.end()
  else response.end(body)
}

export function sendError(request: IncomingMessage, response: ServerResponse, status: number, text: string): void {
  sendText(request, response, status, text)
}

export function sendJson(request: IncomingMessage, response: ServerResponse, status: number, body: unknown): void {
  const encoded = Buffer.from(JSON.stringify(body))
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": encoded.length,
    "Cache-Control": "no-store",
  })
  if (request.method === "HEAD") response.end()
  else response.end(encoded)
}

export function healthzBody(input: {
  startedAt: number
  build: string | null
  sockets: number
  sessions: number
  counters: HealthCounters
  now?: number
}): HealthzBody {
  const now = input.now ?? Date.now()
  return {
    ok: true,
    version: PROTOCOL_VERSION,
    app: APP_VERSION,
    uptimeSec: Math.round((now - input.startedAt) / 1000),
    build: input.build,
    sockets: input.sockets,
    sessions: input.sessions,
    ...input.counters,
  }
}

export interface RequestTarget {
  readonly path: string
  readonly query: string
}

function withoutHash(value: string): string {
  const hash = value.indexOf("#")
  return hash >= 0 ? value.slice(0, hash) : value
}

/** Origin-form path, or the path of an absolute-form target. `null` when the absolute form does not parse. */
export function requestTarget(url: string | undefined): RequestTarget | null {
  let text = url || "/"
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    try {
      const parsed = new URL(text)
      text = parsed.pathname + parsed.search
    } catch {
      return null
    }
  }
  const queryAt = text.indexOf("?")
  if (queryAt >= 0) return { path: withoutHash(text.slice(0, queryAt)), query: withoutHash(text.slice(queryAt + 1)) }
  return { path: withoutHash(text), query: "" }
}

/** `null` when the target is acceptable. Otherwise the status to send before any body. */
export function rejectTarget(method: string | undefined, url: string | undefined): { status: number; text: string; allow?: boolean } | null {
  if ((url ?? "/").length > MAX_URL_LENGTH) return { status: 414, text: "请求地址过长 · URI too long" }
  if (method !== "GET" && method !== "HEAD") return { status: 405, text: "不支持的请求方法 · Method not allowed", allow: true }
  return null
}
