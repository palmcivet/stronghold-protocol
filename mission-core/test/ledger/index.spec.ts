import { expect, test } from "vitest"
import { createBattle, leakModule, type Battle, type ContentContext, type LedgerRow, type MissionModule, type TileSpec } from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

function ground(x: number, objective = false): TileSpec {
  return { x, y: 0, height: 0, deployable: true, walkableBy: ["ground"], ...(objective ? { objective: true } : {}) }
}

/** 在第 0 拍跑一次 act。 */
function script(act: (ctx: ContentContext) => void): MissionModule {
  return {
    id: "script",
    install(ctx) {
      ctx.registerSystem({
        id: "script",
        slot: "finale",
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() === 0) act(runCtx)
        },
      })
    },
  }
}

function row(patch: Partial<LedgerRow>): LedgerRow {
  return { kills: 0, leaks: 0, damage: 0, healing: 0, deaths: 0, total: 0, killedInTotal: 0, leakedInTotal: 0, resolved: 0, ...patch }
}

test("伤害（实际扣掉的生命，不含溢出）、击倒与治疗按单位的 owner 记账，同阵营伤害不记，全场合计包含没有 owner 的单位", () => {
  const battle = createBattle(
    spec({
      modules: ["script"],
      units: [
        ally("p1", { owner: "alice", attributes: { hp: 100, atk: 10, def: 0 } }),
        ally("p2", { owner: "bob", attributes: { hp: 100, atk: 10, def: 0 } }),
        ally("neutral", { attributes: { hp: 100, atk: 10, def: 0 } }),
        ally("foe", { side: "enemy", attributes: { hp: 50, atk: 0, def: 0 } }),
        ally("other", { side: "enemy", attributes: { hp: 50, atk: 0, def: 0 } }),
      ],
      spawns: [
        { atTick: 99, unit: ally("late", { side: "enemy" }) },
        { atTick: 99, unit: ally("extra", { side: "enemy" }), inTotal: false },
      ],
    }),
    [
      script((ctx) => {
        ctx.dealDamage({ sourceId: "p1", targetId: "foe", amount: 30, kind: "true" })
        ctx.dealDamage({ sourceId: "p2", targetId: "foe", amount: 30, kind: "true" })
        ctx.dealDamage({ sourceId: "neutral", targetId: "other", amount: 50, kind: "true" })
        ctx.dealDamage({ sourceId: "p1", targetId: "p2", amount: 40, kind: "true" })
        ctx.heal("p2", 25, { sourceId: "p1" })
      }),
    ],
  )
  battle.step()
  expect(battle.ledger()).toEqual({
    battle: row({ kills: 2, damage: 100, healing: 25, total: 3, killedInTotal: 2, resolved: 2 }),
    owners: {
      alice: row({ damage: 30, healing: 25 }),
      bob: row({ kills: 1, damage: 20 }),
    },
  })
})

test("漏出记给漏出的单位，计入总数的敌人才算进 resolved", () => {
  const battle = createBattle(
    spec({
      modules: ["leak"],
      tiles: [ground(0), ground(1, true)],
      units: [
        ally("runner", {
          side: "enemy",
          owner: "lane-a",
          attributes: { hp: 100, moveSpeed: 60 },
          route: { checkpoints: [], end: { x: 1, y: 0 } },
        }),
      ],
    }),
    [leakModule],
  )
  battle.step()
  expect(battle.ledger()).toEqual({
    battle: row({ leaks: 1, total: 1, leakedInTotal: 1, resolved: 1 }),
    owners: { "lane-a": row({ leaks: 1, total: 1, leakedInTotal: 1, resolved: 1 }) },
  })
})

test("友方倒下记给倒下的单位", () => {
  const battle = createBattle(
    spec({
      modules: ["script"],
      units: [ally("p1", { owner: "alice", attributes: { hp: 10, atk: 0, def: 0 } }), ally("foe", { side: "enemy" })],
    }),
    [script((ctx) => ctx.dealDamage({ sourceId: "foe", targetId: "p1", amount: 99, kind: "true" }))],
  )
  battle.step()
  expect(battle.ledger().owners).toEqual({ alice: row({ deaths: 1 }) })
  expect(battle.ledger().battle).toEqual(row({ deaths: 1, damage: 10, total: 1 }))
})

test("resolved 只数计入总数的敌人：漏一个、打死一个、打死会分裂的，分裂子体与不计数的出场项不动它", () => {
  const resolved: string[] = []
  const split: MissionModule = {
    id: "split",
    install(ctx) {
      ctx.subscribe("downed", (event, live) => {
        if (event.data.unitId !== "mother") return
        live.spawnUnit(ally("child-1", { side: "enemy", x: 2, attributes: { hp: 10, moveSpeed: 0 } }))
        live.spawnUnit(ally("child-2", { side: "enemy", x: 2, attributes: { hp: 10, moveSpeed: 0 } }))
      })
    },
  }
  const plan: Record<number, (ctx: ContentContext) => void> = {
    1: (ctx) => ctx.dealDamage({ sourceId: "guard", targetId: "plain", amount: 99, kind: "true" }),
    2: (ctx) => ctx.dealDamage({ sourceId: "guard", targetId: "mother", amount: 99, kind: "true" }),
    3: (ctx) => {
      ctx.dealDamage({ sourceId: "guard", targetId: "child-1", amount: 99, kind: "true" })
      ctx.dealDamage({ sourceId: "guard", targetId: "child-2", amount: 99, kind: "true" })
      ctx.dealDamage({ sourceId: "guard", targetId: "echo", amount: 99, kind: "true" })
    },
  }
  // plan 的系统在建好之后才运行，那时 battle 已经赋值。
  const battle: Battle = createBattle(
    spec({
      modules: ["leak", "split", "plan"],
      tiles: [ground(0), ground(1, true), ground(2)],
      units: [
        ally("guard", { owner: "alice", x: 2 }),
        ally("runner", { side: "enemy", attributes: { hp: 100, moveSpeed: 60 }, route: { checkpoints: [], end: { x: 1, y: 0 } } }),
        ally("plain", { side: "enemy", x: 2, attributes: { hp: 10, moveSpeed: 0 } }),
      ],
      spawns: [
        { atTick: 0, unit: ally("mother", { side: "enemy", x: 2, attributes: { hp: 10, moveSpeed: 0 } }) },
        { atTick: 0, unit: ally("echo", { side: "enemy", x: 2, attributes: { hp: 10, moveSpeed: 0 } }), inTotal: false },
      ],
    }),
    [
      leakModule,
      split,
      {
        id: "plan",
        install(ctx) {
          ctx.registerSystem({
            id: "plan",
            slot: "finale",
            priority: 0,
            run(runCtx) {
              plan[runCtx.tick()]?.(runCtx)
              const row = battle.ledger().battle
              resolved.push(`${row.resolved}/${row.total}`)
            },
          })
        },
      },
    ],
  )
  for (let tick = 0; tick < 5; tick += 1) battle.step()
  expect(resolved).toEqual(["1/3", "2/3", "3/3", "3/3", "3/3"])
  expect(battle.ledger().battle).toEqual(row({ kills: 5, leaks: 1, total: 3, killedInTotal: 2, leakedInTotal: 1, resolved: 3, damage: 50 }))
  expect(battle.ledger().owners).toEqual({ alice: row({ kills: 5, damage: 50 }) })
})
