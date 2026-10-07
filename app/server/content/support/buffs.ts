import { noteBlocked } from "#server/content/support/blocked.js"

export function aggregateMods(mods: readonly Record<string, number>[] | null | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const entry of mods ?? []) {
    for (const [key, value] of Object.entries(entry)) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue
      out[key] = (out[key] ?? 0) + value
    }
  }
  if (!mods) noteBlocked("buffs.aggregateMods")
  return out
}
