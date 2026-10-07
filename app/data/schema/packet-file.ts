/** 一个赛季数据包里的文件。键是索引名，值是磁盘上的文件名。 */
export const PACKET_FILES = {
  config: "config.json",
  chess: "chess.json",
  bonds: "bonds.json",
  garrisons: "garrisons.json",
  items: "items.json",
  bands: "bands.json",
  effects: "effects.json",
  choices: "choices.json",
  enemies: "enemies.json",
  factions: "factions.json",
  waves: "waves.json",
  stages: "stages.json",
  bosses: "bosses.json",
  tokens: "tokens.json",
  tuning: "tuning.json",
  emotes: "emotes.json",
  assets: "assets.json",
  local: "local-assets.json",
} as const

export type PacketName = keyof typeof PACKET_FILES

/** 这些文件的顶层是 `{ [id]: 记录 }`。 */
export const INDEXED_PACKET_NAMES: readonly [
  "chess",
  "bonds",
  "garrisons",
  "items",
  "bands",
  "effects",
  "enemies",
  "waves",
  "stages",
  "bosses",
  "tokens",
] = [
  "chess",
  "bonds",
  "garrisons",
  "items",
  "bands",
  "effects",
  "enemies",
  "waves",
  "stages",
  "bosses",
  "tokens",
]

export type IndexedPacketName = (typeof INDEXED_PACKET_NAMES)[number]

const SEASON_ID_PATTERN: RegExp = /^[a-z][a-z0-9]*$/

export function seasonPacketDirectory(seasonId: string): string {
  if (!SEASON_ID_PATTERN.test(seasonId)) throw new Error(`invalid season id ${seasonId}`)
  return `product/season/${seasonId}`
}

export function packetAddress(seasonId: string, name: PacketName): string {
  if (!SEASON_ID_PATTERN.test(seasonId)) throw new Error(`invalid season id ${seasonId}`)
  return `/data/seasons/${seasonId}/${PACKET_FILES[name]}`
}
