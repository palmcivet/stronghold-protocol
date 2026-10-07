import { INDEXED_PACKET_NAMES, type IndexedPacketName, type PacketName } from "#schema/packet-file.js"

export interface PacketDocuments {
  readonly [file: string]: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** 只读对象自身的记录。`constructor` 这类原型名不会命中。 */
export function lookupRecord(documents: PacketDocuments, file: IndexedPacketName, id: string): Record<string, unknown> | null {
  if (id.length === 0) return null
  const map = asRecord(documents[file])
  if (!map || !Object.hasOwn(map, id)) return null
  return asRecord(map[id])
}

export function readDocument(documents: PacketDocuments, file: PacketName): unknown {
  return Object.hasOwn(documents, file) ? documents[file] : null
}

export function lookupMode(documents: PacketDocuments, modeId: string): Record<string, unknown> | null {
  const config = asRecord(readDocument(documents, "config"))
  if (!config) return null
  const modes = asRecord(config["modes"])
  if (!modes || !Object.hasOwn(modes, modeId)) return null
  return asRecord(modes[modeId])
}

export function indexedNames(): readonly IndexedPacketName[] {
  return INDEXED_PACKET_NAMES
}
