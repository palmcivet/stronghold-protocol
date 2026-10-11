import type { MissionModule } from "#port/module.js"
import { emit } from "#kernel/event/index.js"
import { releaseBlock } from "#unit/block/index.js"
import { engineOf, removeUnit } from "#unit/record/index.js"
import { gridOf } from "#field/grid/index.js"

export const leakModule: MissionModule = {
  id: "leak",
  install(ctx) {
    ctx.registerSystem({
      id: "leak",
      slot: "enemy",
      priority: 0.4,
      run(runCtx) {
        const session = engineOf(runCtx)
        const { world: state } = session
        // 先取这一拍开始时的名单：订阅者在 leak 里放进的单位等下一拍。
        for (const unit of [...state.units.values()]) {
          if (unit.side !== "enemy" || !unit.fielded || unit.downed) continue
          const tile = gridOf(state).at(unit.x, unit.y)
          if (!tile?.objective) continue
          releaseBlock(state, unit, { registry: session.registry, ctx: runCtx })
          unit.fielded = false
          emit(state, "leak", { unitId: unit.id })
          removeUnit(state, unit.id)
        }
      },
    })
  },
}
