import type { MissionModule } from "#port/content.js"

export const costModule: MissionModule = {
  id: "cost",
  install(ctx) {
    ctx.registerSystem({
      id: "cost",
      slot: "cost",
      priority: 0,
      run(runCtx) {
        runCtx.emit("cost", {})
      },
    })
  },
}
