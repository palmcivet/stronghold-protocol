import { describe, expect, it } from "vitest"
import { createViewLoop, MISSION_VIEW_SYSTEM_ORDER, type ViewSystem, type MissionViewSystemId } from "#runtime/stage/loop.js"

const recorder = (ids: readonly MissionViewSystemId[]) => {
  const ran: MissionViewSystemId[] = []
  const systems: ViewSystem<number>[] = ids.map((id) => ({ id, run: () => void ran.push(id) }))
  return { ran, systems }
}

describe("view loop", () => {
  it("fixes the frame order from ingest to release", () => {
    expect(MISSION_VIEW_SYSTEM_ORDER).toEqual(["ingest", "lifecycle", "position", "facing", "skeleton", "hud", "effect", "audio", "cull", "release"])
  })

  it("runs the systems in the fixed order whatever order they are given in", () => {
    const { ran, systems } = recorder(["release", "audio", "ingest", "skeleton", "lifecycle"])
    const loop = createViewLoop(systems)
    expect(loop.order).toEqual(["ingest", "lifecycle", "skeleton", "audio", "release"])
    loop.run(0)
    loop.run(1)
    expect(ran).toEqual(["ingest", "lifecycle", "skeleton", "audio", "release", "ingest", "lifecycle", "skeleton", "audio", "release"])
  })

  it("refuses an unknown or repeated system id", () => {
    expect(() => createViewLoop([{ id: "paint" as MissionViewSystemId, run: () => undefined }])).toThrow(RangeError)
    expect(() => createViewLoop(recorder(["hud", "hud"]).systems)).toThrow(/twice/)
  })
})
