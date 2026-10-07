import { noteBlocked } from "#server/content/support/blocked.js"

export function performAttack(..._args: unknown[]): void {
  noteBlocked("ai.performAttack")
}

export function effectiveProfile(unit: unknown): unknown {
  noteBlocked("ai.effectiveProfile")
  return unit
}

export function compileRoute(route: unknown): unknown {
  noteBlocked("ai.compileRoute")
  return route ?? null
}
