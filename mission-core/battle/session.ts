import type { ContentContext } from "#port/content.js"
import type { BattleRegistry } from "#kernel/registry/index.js"
import type { BattleState } from "#battle/state.js"

interface BattleSession {
  readonly state: BattleState
  readonly registry: BattleRegistry
}

const sessions = new WeakMap<ContentContext, BattleSession>()

export function bindSession(ctx: ContentContext, state: BattleState, registry: BattleRegistry): void {
  sessions.set(ctx, { state, registry })
}

export function sessionOf(ctx: ContentContext): BattleSession {
  const session = sessions.get(ctx)
  if (!session) throw new Error("battle session is not bound")
  return session
}
