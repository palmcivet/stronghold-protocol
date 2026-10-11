import type { MissionModule } from "#port/module.js"
import { redeployWhenReady } from "#unit/deploy/command.js"
import { engineOf } from "#unit/record/index.js"

export { REDEPLOY_MUL_ATTRIBUTE, redeployDuration } from "#unit/deploy/command.js"

export const redeployModule: MissionModule = {
  id: "redeploy",
  install(ctx) {
    ctx.registerSystem({
      id: "redeploy",
      slot: "redeploy",
      priority: 0,
      run(runCtx) {
        const { world: state } = engineOf(runCtx)
        for (const unit of state.units.values()) {
          if (!unit.downed || unit.removed) continue
          redeployWhenReady(runCtx, unit)
        }
      },
    })
  },
}
