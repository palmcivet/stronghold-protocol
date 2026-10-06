import type { MissionModule } from "#port/content.js"

export const redeployModule: MissionModule = {
  id: "redeploy",
  install(ctx) {
    ctx.registerSystem({
      id: "redeploy",
      slot: "redeploy",
      priority: 0,
      run(runCtx) {
        runCtx.advanceStartedTimers("redeploy")
        runCtx.emit("redeploy", {})
      },
    })
  },
}
