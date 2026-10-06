export type JsonMap = Readonly<Record<string, unknown>>

export function asMap(value: unknown): JsonMap | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null
  return value as JsonMap
}

export function own(map: JsonMap | null, key: string): unknown {
  if (!map || key.length === 0 || !Object.hasOwn(map, key)) return undefined
  return map[key]
}

export function asText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}
