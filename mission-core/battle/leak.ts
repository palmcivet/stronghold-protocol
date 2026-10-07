import type { MissionModule } from "#port/content.js"
import { emit } from "#battle/state.js"
import { releaseBlock } from "#battle/block.js"
import { sessionOf } from "#battle/session.js"

export const leakModule: MissionModule = {
  id: "leak",
  install(ctx) {
    ctx.registerSystem({
      id: "leak",
      slot: "enemy",
      priority: 0.4,
      run(runCtx) {
        const session = sessionOf(runCtx)
        const { state } = session
        for (const unit of state.units.values()) {
          if (unit.side !== "enemy" || !unit.fielded || unit.downed) continue
          const tile = state.grid.at(unit.x, unit.y)
          if (!tile?.objective) continue
          releaseBlock(state, unit, { registry: session.registry, ctx: runCtx })
          unit.fielded = false
          emit(state, "leak", { unitId: unit.id })
        }
      },
    })
  },
}
