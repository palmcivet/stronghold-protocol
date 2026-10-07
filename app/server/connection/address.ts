import { isIP } from "node:net"
import type { IncomingMessage } from "node:http"

export type TrustProxy = "auto" | boolean

export function normalizeIp(raw: unknown): string {
  if (typeof raw !== "string") return ""
  let text = raw.trim().toLowerCase()
  const withPort = /^\[([^\]]+)\](?::\d+)?$/.exec(text) || /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(text)
  if (withPort?.[1]) text = withPort[1]
  const zone = text.indexOf("%")
  if (zone >= 0) text = text.slice(0, zone)
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text)
  if (mapped?.[1]) text = mapped[1]
  if (isIP(text) === 6) {
    const groups = ipv6Groups(text)
    const mappedV4 = groups && groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff
      ? `${(groups[6] ?? 0) >> 8}.${(groups[6] ?? 0) & 255}.${(groups[7] ?? 0) >> 8}.${(groups[7] ?? 0) & 255}`
      : ""
    if (mappedV4) text = mappedV4
  }
  return isIP(text) ? text : ""
}

export function ipv6Groups(ip: string): number[] | null {
  let text = ip
  const v4 = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text)
  if (v4?.[1]) {
    const octets = v4[1].split(".").map(Number)
    const high = ((octets[0] ?? 0) << 8) | (octets[1] ?? 0)
    const low = ((octets[2] ?? 0) << 8) | (octets[3] ?? 0)
    text = text.slice(0, -v4[1].length) + high.toString(16) + ":" + low.toString(16)
  }
  const halves = text.split("::")
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(":") : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : []
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0
  const groups = [...head, ...new Array(Math.max(0, fill)).fill("0"), ...tail].map((group) => parseInt(group, 16))
  return groups.length === 8 && groups.every((group) => Number.isInteger(group) && group >= 0 && group <= 0xffff) ? groups : null
}

export function isLocalIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number)
    return a === 127 || a === 10 || (a === 172 && (b ?? 0) >= 16 && (b ?? 0) <= 31) || (a === 192 && b === 168)
      || (a === 169 && b === 254) || (a === 100 && (b ?? 0) >= 64 && (b ?? 0) <= 127) || a === 0
  }
  if (isIP(ip) === 6) {
    const groups = ipv6Groups(ip)
    if (!groups) return false
    if (groups.every((group, index) => (index < 7 ? group === 0 : group <= 1))) return true
    return ((groups[0] ?? 0) & 0xfe00) === 0xfc00 || ((groups[0] ?? 0) & 0xffc0) === 0xfe80
  }
  return false
}

export function limitKeyOf(ip: string): string {
  if (isIP(ip) !== 6) return ip
  const groups = ipv6Groups(ip)
  return groups ? `${groups.slice(0, 4).map((group) => group.toString(16)).join(":")}::/64` : ip
}

function headerValue(headers: IncomingMessage["headers"] | undefined, name: string): string | undefined {
  if (!headers) return undefined
  const value = headers[name]
  if (Array.isArray(value)) return value[value.length - 1]
  return value
}

function forwardedAddress(headers: IncomingMessage["headers"] | undefined): string | null {
  for (const name of ["cf-connecting-ip", "x-real-ip"]) {
    const ip = normalizeIp(headerValue(headers, name))
    if (ip) return ip
  }
  const forwarded = headerValue(headers, "x-forwarded-for")
  if (typeof forwarded === "string") {
    const parts = forwarded.split(",")
    const ip = normalizeIp(parts[parts.length - 1])
    if (ip) return ip
  }
  return null
}

export interface ClientAddress {
  readonly ip: string
  readonly key: string | null
}

/** Peer address, or a forwarded address when the proxy policy allows it. Local peers without a forward have no limit key. */
export function clientAddress(req: IncomingMessage | undefined, trustProxy: TrustProxy = "auto"): ClientAddress {
  const peer = normalizeIp(req?.socket?.remoteAddress)
  const local = !peer || isLocalIp(peer)
  if (trustProxy === true || (trustProxy !== false && local)) {
    const forwarded = forwardedAddress(req?.headers)
    if (forwarded) return { ip: forwarded, key: isLocalIp(forwarded) ? null : limitKeyOf(forwarded) }
  }
  if (local) return { ip: peer || "?", key: null }
  return { ip: peer, key: limitKeyOf(peer) }
}
