import { getChess, getData, getToken, type PacketData } from "#server/entry/packet.js"
import { noteBlocked } from "#server/content/support/blocked.js"

export function normalizeSkill(skill: unknown): unknown {
  return skill ?? null
}

export function normalizeChess(chess: unknown): unknown {
  return chess ?? null
}

export function normalizeRoute(route: unknown): unknown {
  return route ?? null
}

export function isShopItem(id: unknown, data: PacketData = getData()): boolean {
  const record = typeof id === "string" ? data.items : null
  if (!record || typeof record !== "object" || Array.isArray(record)) return false
  const item = (record as Record<string, unknown>)[String(id)]
  if (!item || typeof item !== "object") return false
  const shop = (item as { shop?: unknown; inShop?: unknown }).shop ?? (item as { inShop?: unknown }).inShop
  return shop !== false
}

export function withUnitLoadouts(data: unknown): unknown {
  noteBlocked("simdata.withUnitLoadouts")
  return data
}

export function getChessRecord(id: unknown, data?: PacketData): Record<string, unknown> | null {
  return getChess(id, data)
}

export function getTokenRecord(id: unknown, data?: PacketData): Record<string, unknown> | null {
  return getToken(id, data)
}

export function hasGeneratedData(): boolean {
  const chess = getData().chess
  return !!chess && typeof chess === "object" && Object.keys(chess).length > 0
}

export class DataSource {
  readonly data: PacketData
  constructor(data: PacketData = getData()) {
    this.data = data
  }
  rawChess(id: string): Record<string, unknown> | null {
    const table = this.data.chess
    if (!table || typeof table !== "object" || Array.isArray(table)) return null
    const record = (table as Record<string, unknown>)[id]
    return record && typeof record === "object" ? record as Record<string, unknown> : null
  }
  rawToken(id: string): Record<string, unknown> | null {
    const table = this.data.tokens
    if (!table || typeof table !== "object" || Array.isArray(table)) return null
    const record = (table as Record<string, unknown>)[id]
    return record && typeof record === "object" ? record as Record<string, unknown> : null
  }
  chessIds(): string[] {
    const table = this.data.chess
    if (!table || typeof table !== "object" || Array.isArray(table)) return []
    return Object.keys(table)
  }
  getChess(id: string): Record<string, unknown> | null {
    return this.rawChess(id)
  }
  getToken(id: string): Record<string, unknown> | null {
    return this.rawToken(id)
  }
}

export function getDefaultSource(): DataSource {
  return new DataSource(getData())
}
