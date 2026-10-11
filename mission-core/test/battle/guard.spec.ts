import { expect, test } from "vitest"
import { createBattle, leakModule, type Battle, type ContentContext, type MissionModule, type TileSpec } from "arknights-mission-core"
import { SCENARIOS } from "#test/golden/scenario.js"
import { digest } from "#test/replay.js"
import { ally, spec } from "#test/fixture.js"

function script(act: (ctx: ContentContext) => void): MissionModule {
  return {
    id: "script",
    install(ctx) {
      ctx.registerSystem({
        id: "script",
        slot: "finale",
        priority: 0,
        run(runCtx) {
          act(runCtx)
        },
      })
    },
  }
}

test("推进中再调用 step 报错，这一拍照常走完", () => {
  let battle: Battle | null = null
  const errors: string[] = []
  battle = createBattle(spec({ modules: ["script"] }), [
    script(() => {
      try {
        battle?.step()
      } catch (cause) {
        errors.push(cause instanceof Error ? cause.message : String(cause))
      }
    }),
  ])
  battle.step()
  battle.step()
  expect(errors).toEqual(["step called while the battle is stepping", "step called while the battle is stepping"])
  expect(battle.snapshot().tick).toBe(2)
})

test("没人取走时事件一直留着，取走时一条不少", () => {
  const battle = createBattle(
    spec({ modules: ["script"], cost: { ally: { initial: 0, regen: 0, cap: 1000 }, enemy: { initial: 0, regen: 0, cap: 0 } } }),
    [script((ctx) => ctx.addCost("ally", 1))],
  )
  battle.drainEvents()
  for (let tick = 0; tick < 500; tick += 1) battle.step()
  expect(battle.drainEvents().filter((event) => event.type === "cost")).toHaveLength(500)
})

test("同一份规格建的几场交替推进，与各自单独推进一致", () => {
  const alone = SCENARIOS.map((scenario) => {
    const battle = createBattle(scenario.spec(), scenario.modules())
    const events: string[] = []
    for (let tick = 0; tick < scenario.ticks; tick += 1) {
      battle.step()
      events.push(digest(battle.drainEvents()))
    }
    return events
  })
  const specs = SCENARIOS.map((scenario) => scenario.spec())
  const battles = SCENARIOS.map((scenario, index) => createBattle(specs[index] ?? scenario.spec(), scenario.modules()))
  const twin = SCENARIOS.map((scenario, index) => createBattle(specs[index] ?? scenario.spec(), scenario.modules()))
  const mixed = SCENARIOS.map((): string[] => [])
  const longest = Math.max(...SCENARIOS.map((scenario) => scenario.ticks))
  for (let tick = 0; tick < longest; tick += 1) {
    SCENARIOS.forEach((scenario, index) => {
      if (tick >= scenario.ticks) return
      twin[index]?.step()
      twin[index]?.drainEvents()
      const battle = battles[index]
      if (!battle) return
      battle.step()
      mixed[index]?.push(digest(battle.drainEvents()))
    })
  }
  expect(mixed).toEqual(alone)
})

test("攻速为 0 或非数、攻击间隔为 0 时，间隔按上下限与缺省值取有限值，照常出手", () => {
  const hits: string[] = []
  const battle = createBattle(
    spec({
      modules: ["script"],
      tiles: [
        { x: 0, y: 0, height: 0, deployable: true, walkableBy: ["ground"] },
        { x: 1, y: 0, height: 0, deployable: true, walkableBy: ["ground"] },
      ],
      units: [
        ally("zero", { attributes: { hp: 100, atk: 1, def: 0, aspd: 0, bat: 0 } }),
        ally("junk", { attributes: { hp: 100, atk: 1, def: 0, aspd: Number.NaN, bat: -1 } }),
        ally("foe", { side: "enemy", x: 1, attributes: { hp: 1e9, atk: 0, def: 0, moveSpeed: 0 } }),
      ],
    }),
    [
      script((ctx) => {
        if (ctx.tick() !== 0) return
        ctx.startTimer("zero", "attack")
        ctx.startTimer("junk", "attack")
      }),
    ],
  )
  for (let tick = 0; tick < 300; tick += 1) battle.step()
  for (const event of battle.drainEvents()) if (event.type === "attack-hit") hits.push(event.data.unitId)
  expect(hits.filter((id) => id === "zero").length).toBeGreaterThan(0)
  expect(hits.filter((id) => id === "junk").length).toBeGreaterThan(0)
  const foe = battle.snapshot().units.find((unit) => unit.id === "foe")
  expect(Number.isFinite(foe?.attributes.hp)).toBe(true)
})

test("叠加溢出的乘算修饰让属性退回缺省值（atk 是 0），不出现非有限值", () => {
  const seen: number[] = []
  const battle = createBattle(spec({ modules: ["script"], units: [ally("a", { attributes: { hp: 100, atk: 10, def: 0 } })] }), [
    script((ctx) => {
      if (ctx.tick() === 0) {
        ctx.setModifier("a", "x", [{ attribute: "atk", op: "mul", value: 1e300 }])
        ctx.setModifier("a", "y", [{ attribute: "atk", op: "mul", value: 1e300 }])
      }
      seen.push(ctx.attribute("a", "atk"))
    }),
  ])
  battle.step()
  expect(seen).toEqual([0])
})

function ground(x: number, objective = false): TileSpec {
  return { x, y: 0, height: 0, deployable: true, walkableBy: ["ground"], ...(objective ? { objective: true } : {}) }
}

test("泄漏时再放一个站在保护目标上的敌人，它下一拍才泄漏，同一拍里不循环", () => {
  let next = 0
  const relay: MissionModule = {
    id: "relay",
    install(ctx) {
      ctx.subscribe("leak", (_event, live) => {
        next += 1
        live.spawnUnit(
          ally(`runner-${next}`, {
            side: "enemy",
            x: 1,
            attributes: { hp: 100, moveSpeed: 60 },
            route: { checkpoints: [], end: { x: 1, y: 0 } },
          }),
        )
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["leak", "relay"],
      tiles: [ground(0), ground(1, true)],
      units: [ally("runner-0", { side: "enemy", attributes: { hp: 100, moveSpeed: 60 }, route: { checkpoints: [], end: { x: 1, y: 0 } } })],
    }),
    [leakModule, relay],
  )
  const perTick: number[] = []
  for (let tick = 0; tick < 4; tick += 1) {
    battle.step()
    perTick.push(battle.drainEvents().filter((event) => event.type === "leak").length)
  }
  expect(perTick).toEqual([1, 1, 1, 1])
})

test("路线点在场地之外时夹到场地边上，飞行敌人走完路线并泄漏，不悬停在边界", () => {
  const battle = createBattle(
    spec({
      modules: ["leak"],
      tiles: [ground(0), ground(1, true)],
      units: [
        ally("flyer", {
          side: "enemy",
          motion: "FLY",
          attributes: { hp: 100, moveSpeed: 2 },
          route: { checkpoints: [{ type: "move", x: 0, y: -5 }], end: { x: 9, y: 0 } },
        }),
      ],
    }),
    [leakModule],
  )
  const leaks: number[] = []
  for (let tick = 0; tick < 120; tick += 1) {
    battle.step()
    if (battle.drainEvents().some((event) => event.type === "leak")) leaks.push(tick)
  }
  expect(leaks).toHaveLength(1)
})
