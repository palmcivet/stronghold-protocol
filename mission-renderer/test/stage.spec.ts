import { describe, expect, it } from "vitest"
import { TICK, type BattleEvent, type BattleSnapshot } from "arknights-mission-core"
import type { MissionMap } from "#contract/view.js"
import type { MissionPointerEvent } from "#contract/pointer.js"
import { createMissionStage } from "#runtime/stage/index.js"
import { recordDuel } from "#test/actor/fixture.js"

const MAP: MissionMap = {
  cols: 3,
  rows: 1,
  tiles: [0, 1, 2].map((x) => ({ x, y: 0, height: x === 2 ? 1 : 0, deployable: true, walkableBy: ["ground"] })),
}

const duel = recordDuel(40, 1000)
const attackTick = duel.findIndex((tick) => tick.events.some((event) => event.type === "attack") && tick.snapshot.tick > 5)

function push(stage: ReturnType<typeof createMissionStage>, snapshot: BattleSnapshot, events: readonly BattleEvent[]) {
  stage.dispatch({ type: "push-snapshot", snapshot })
  for (const event of events) stage.dispatch({ type: "push-event", event })
}

describe("mission stage", () => {
  it("keeps waiting events and the newest snapshot when the update mode changes", () => {
    const stage = createMissionStage(MAP)
    const before = duel[attackTick - 2]!
    const frame = duel[attackTick]!
    push(stage, before.snapshot, frame.events)
    stage.dispatch({ type: "set-update-mode", mode: "local", speed: 1, delay: 0 })
    stage.update(TICK / 2)
    expect(stage.view.events).toEqual([])
    stage.dispatch({ type: "set-update-mode", mode: "local", speed: 4 })
    expect(stage.view.speed).toBe(4)
    stage.dispatch({ type: "set-update-mode", mode: "external" })
    expect(stage.view.units).toBe(before.snapshot.units)
    stage.update(TICK)
    expect(stage.view.events).toEqual(frame.events)
  })

  it("changes the speed of the render clock without dropping buffered frames", () => {
    const stage = createMissionStage(MAP)
    stage.dispatch({ type: "set-update-mode", mode: "local", speed: 1, delay: 0 })
    for (const tick of duel.slice(0, 10)) push(stage, tick.snapshot, tick.events)
    stage.dispatch({ type: "set-speed", speed: 3 })
    expect(stage.view.speed).toBe(3)
    stage.update(TICK)
    expect(stage.view.units.length).toBe(2)
    stage.dispatch({ type: "set-speed", speed: 100 })
    expect(stage.view.speed).toBe(20)
  })

  it("draws the highlighted tiles on the board at the surface height and clears them on reset", () => {
    const stage = createMissionStage(MAP, { terrain: { view: null } })
    stage.dispatch({ type: "set-highlights", tiles: [{ x: 0, y: 0 }, { x: 2, y: 0 }] })
    const squares = stage.terrain!.highlights.children
    expect(squares.map((square) => square.position.x)).toEqual([0, 2])
    expect(squares[1]!.position.y).toBeGreaterThan(squares[0]!.position.y)
    expect(stage.terrain!.surfaceHeight(2, 0)).toBeGreaterThan(0)
    stage.dispatch({ type: "reset" })
    expect(stage.terrain!.highlights.children).toEqual([])
  })

  it("streams pointer presses, moves and releases with what lies under them", () => {
    const events: MissionPointerEvent[] = []
    const stage = createMissionStage(MAP, { onPointer: (event) => void events.push(event) })
    push(stage, duel[0]!.snapshot, [])
    expect(stage.pointer("down", 32, 32)).toEqual({ phase: "down", screenX: 32, screenY: 32, hit: { type: "unit", unitId: "g" } })
    stage.pointer("move", 160, 32)
    stage.pointer("up", -5, -5)
    expect(events.map((event) => [event.phase, event.hit])).toEqual([
      ["down", { type: "unit", unitId: "g" }],
      ["move", { type: "tile", x: 2, y: 0 }],
      ["up", { type: "empty" }],
    ])
  })
})
