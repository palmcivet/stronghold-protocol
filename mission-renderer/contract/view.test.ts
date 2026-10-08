import { describe, expect, it } from "vitest"
import type { MissionStageCommand, MissionView, MissionPointerHit } from "./view.js"

describe("mission renderer contract", () => {
  it("represents all stage inputs without app-specific fields", () => {
    const commands: readonly MissionStageCommand[] = [
      { type: "set-map", map: { cols: 2, rows: 2, tiles: [] } },
      { type: "set-camera", camera: { x: 0, y: 0, width: 2, height: 2, margin: 1 } },
      { type: "set-highlights", tiles: [{ x: 1, y: 1 }] },
      { type: "set-update-mode", mode: "local" },
      { type: "reset" },
    ]

    expect(commands.map((command) => command.type)).toEqual([
      "set-map",
      "set-camera",
      "set-highlights",
      "set-update-mode",
      "reset",
    ])
  })

  it("keeps pointer results discriminated", () => {
    const hits: readonly MissionPointerHit[] = [
      { type: "unit", unitId: "guard" },
      { type: "tile", x: 1, y: 2 },
      { type: "empty" },
    ]

    expect(hits).toHaveLength(3)
    expect(hits[0]).toEqual({ type: "unit", unitId: "guard" })
  })

  it("exposes a stable initial view shape", () => {
    const view: MissionView = {
      map: null,
      camera: null,
      snapshot: null,
      units: [],
      events: [],
      highlightedTiles: [],
      updateMode: "external",
    }

    expect(view).toMatchObject({
      map: null,
      snapshot: null,
      highlightedTiles: [],
      updateMode: "external",
    })
  })
})
