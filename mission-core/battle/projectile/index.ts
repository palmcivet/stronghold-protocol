import type { ProjectileLaunch } from "#port/content.js"
import type { BattleState } from "#battle/state.js"

export function launchProjectile(state: BattleState, projectile: ProjectileLaunch): void {
  state.projectiles.push({
    id: projectile.id,
    sourceId: projectile.sourceId,
    targetId: projectile.targetId,
    amount: projectile.amount,
  })
}
