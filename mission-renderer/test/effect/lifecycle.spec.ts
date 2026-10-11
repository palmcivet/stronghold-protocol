import { describe, expect, it } from "vitest"
import type { BattleEvent } from "arknights-mission-core"
import type { MissionCue } from "#contract/cue.js"
import { createActorWorld, type ActorFrame } from "#actor/entity/index.js"
import { createMissionCueBindings } from "#effect/binding.js"
import { createEffectLayer } from "#effect/layer.js"
import { createMissionEffectTable, type MissionEffectKind } from "#effect/table.js"
import { createMissionStage } from "#runtime/stage/index.js"

interface Spark {
  readonly serial: number
  left: number
  cue: MissionCue<"hit"> | null
}

/** A kind that lasts `seconds` and logs every lifecycle call; a hit on no target has nothing to draw. */
function sparkKind(log: string[], seconds: number): MissionEffectKind<"hit", Spark> {
  let serial = 0
  return {
    id: "test:spark",
    accepts: ["hit"],
    create: () => {
      serial += 1
      log.push(`create ${serial}`)
      return { serial, left: 0, cue: null }
    },
    start(spark, cue) {
      log.push(`start ${spark.serial} ${cue.key}`)
      spark.left = seconds
      spark.cue = cue
      return cue.data.targetId !== ""
    },
    update(spark, deltaSeconds) {
      spark.left -= deltaSeconds
      log.push(`update ${spark.serial}`)
      return spark.left > 0
    },
    end(spark) {
      log.push(`end ${spark.serial}`)
      spark.cue = null
    },
    dispose(spark) {
      log.push(`dispose ${spark.serial}`)
    },
  }
}

/** 只带 targetId 的事件：spark 只读这一个字段。 */
function hit(tick: number, targetId = ""): BattleEvent {
  return { tick, type: "hit", data: { targetId } } as BattleEvent
}

function frame(events: readonly BattleEvent[] = []): ActorFrame {
  return { deltaSeconds: 0.25, units: [], moving: new Set(), events }
}

function layered(seconds = 0.5) {
  const log: string[] = []
  const unbound: string[] = []
  const table = createMissionEffectTable()
  table.register(sparkKind(log, seconds))
  const bindings = createMissionCueBindings()
  bindings.bind("hit", { effect: "test:spark", sound: "hit" })
  const layer = createEffectLayer(createActorWorld(), { table, bindings, onUnboundCue: (key) => void unbound.push(key) })
  return { log, unbound, layer, table, bindings }
}

describe("effect lifecycle", () => {
  it("creates an instance for a cue, updates it until it ends, then returns it to the pool for the next cue", () => {
    const { log, layer } = layered()
    layer.system.run(frame([hit(1, "e")]))
    expect(layer.live().get("test:spark")).toBe(1)
    layer.system.run(frame())
    layer.system.run(frame())
    expect(layer.live().size).toBe(0)
    expect(layer.idle("test:spark")).toBe(1)
    layer.system.run(frame([hit(4, "e")]))
    expect(log).toEqual(["create 1", "start 1 hit", "update 1", "update 1", "end 1", "start 1 hit"])
  })

  it("ends an instance at once when its cue has nothing to draw", () => {
    const { log, layer } = layered()
    layer.system.run(frame([hit(1)]))
    expect(log).toEqual(["create 1", "start 1 hit", "end 1"])
    expect(layer.idle("test:spark")).toBe(1)
  })

  it("reports an unbound key once and draws nothing for it or for a cue bound to no effect", () => {
    const { log, unbound, layer } = layered()
    const mod = { tick: 1, type: "my-mod:doll-swap", data: {} } as unknown as BattleEvent
    const loss = { tick: 1, type: "loss", data: { unitId: "g", amount: 1, hp: 1 } } as BattleEvent
    layer.system.run(frame([mod, mod, loss]))
    layer.system.run(frame([mod]))
    expect(log).toEqual([])
    expect(unbound).toEqual(["my-mod:doll-swap"])
  })

  it("seals the table and the bindings", () => {
    const { table, bindings } = layered()
    expect(table.sealed && bindings.sealed).toBe(true)
    expect(() => bindings.bind("heal", { effect: null, sound: null })).toThrow(/sealed/)
  })

  it("ends playing effects and disposes the pooled ones on clear", () => {
    const { log, layer } = layered(10)
    layer.system.run(frame([hit(1, "e"), hit(1, "f")]))
    layer.clear()
    expect(log.slice(-4)).toEqual(["end 1", "end 2", "dispose 1", "dispose 2"])
    expect(layer.live().size).toBe(0)
  })

  it("refuses to create a stage whose bindings name a missing effect kind", () => {
    const cues = createMissionCueBindings()
    cues.bind("cue:snow-storm", { effect: "my-mod:storm", sound: null })
    expect(() => createMissionStage(null, { cues })).toThrow(/not registered/)
  })
})
