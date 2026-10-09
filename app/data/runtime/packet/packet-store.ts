import { PACKET_FILES, type PacketName } from "#schema/packet-file.js"
import { PacketReadError, type PacketFiles } from "#runtime/port/packet-files.js"
import type { PacketDocuments } from "./record-index.js"

export interface LoadedPackets {
  readonly documents: PacketDocuments
  readonly missing: readonly PacketName[]
}

function freezeValue(root: unknown): unknown {
  const stack: unknown[] = [root]
  const seen = new Set<object>()
  while (stack.length > 0) {
    const value = stack.pop()
    if (value === null || typeof value !== "object" || seen.has(value)) continue
    seen.add(value)
    if (Array.isArray(value)) {
      for (const item of value) if (item !== null && typeof item === "object") stack.push(item)
    } else {
      for (const item of Object.values(value)) if (item !== null && typeof item === "object") stack.push(item)
    }
    Object.freeze(value)
  }
  return root
}

function documentKey(name: PacketName): string {
  return PACKET_FILES[name].slice(0, -".json".length)
}

/** 读一个赛季目录里的 JSON，并冻结结果。缺的预期文件列在 missing。 */
export async function readSeasonPackets(
  files: PacketFiles,
  directory: string,
  expected: readonly PacketName[],
): Promise<LoadedPackets> {
  const names = await files.readDir(directory)
  const documents: Record<string, unknown> = {}
  for (const name of names) {
    if (!name.toLowerCase().endsWith(".json")) continue
    const key = name.slice(0, -".json".length)
    const text = await files.readText(`${directory}/${name}`)
    try {
      documents[key] = JSON.parse(text) as unknown
    } catch (cause) {
      throw new PacketReadError(`${directory}/${name}`, cause instanceof Error ? cause.message : String(cause))
    }
  }
  const missing = expected.filter((name) => !Object.hasOwn(documents, documentKey(name)))
  return {
    documents: freezeValue(documents) as PacketDocuments,
    missing,
  }
}
