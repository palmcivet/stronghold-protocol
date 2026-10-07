import { expect, test } from "vitest"
import {
  TICK,
  createBattle,
  type ContentContext,
  type MissionModule,
  type TileSpec,
  type UnitSpec,
} from "arknights-mission-core"
import { ally, spec } from "../fixture.js"

const lane: readonly TileSpec[] = [0, 1, 2, 3].map((x) => ({
  x,
  y: 0,
  height: 0,
  deployable: true,
  walkableBy: ["ground"],
}))

function hpOf(battle: ReturnType<typeof createBattle>, id: string): number {
  return battle.snapshot().units.find((unit) => unit.id === id)?.attributes.hp ?? Number.NaN
}

function attackModule(run: (ctx: ContentContext) => void): MissionModule {
  return {
    id: "case",
    install(ctx) {
      ctx.registerSystem({
        id: "case",
        slot: "schedule",
        priority: 1,
        run,
      })
    },
  }
}

test("攻速改变两次命中的间隔", () => {
  const gaps = (aspd: number): number => {
    const hits: number[] = []
    const module = attackModule((ctx) => {
      ctx.subscribe("attack-hit", (event) => {
        hits.push(event.tick)
      })
      if (ctx.tick() === 0) ctx.startTimer("a", "attack")
    })
    const battle = createBattle(
      spec({
        modules: ["case"],
        tiles: lane,
        units: [
          ally("a", { attributes: { hp: 100, atk: 10, def: 0, aspd } }),
          ally("e", { side: "enemy", x: 1, y: 0, attributes: { hp: 5000, def: 0 } }),
        ],
      }),
      [module],
    )
    for (let step = 0; step < 40; step += 1) battle.step()
    expect(hits.length).toBeGreaterThanOrEqual(2)
    return (hits[1] ?? 0) - (hits[0] ?? 0)
  }
  expect(gaps(100) * TICK).toBeCloseTo(1, 5)
  expect(gaps(200) * TICK).toBeCloseTo(0.5, 5)
})

test("没有片段时前摇是 0，命中后停 0.35 秒", () => {
  const hits: number[] = []
  const phases: string[] = []
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.subscribe("attack-hit", (event) => {
        hits.push(event.tick)
      })
      ctx.registerSystem({
        id: "arm",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          if (runCtx.tick() === 0) runCtx.startTimer("a", "attack")
        },
      })
      ctx.registerSystem({
        id: "watch",
        slot: "ally",
        priority: 10,
        run(runCtx) {
          phases.push(String(runCtx.timerView("a", "attack").phase))
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["case"],
      tiles: lane,
      units: [
        ally("a", { attributes: { hp: 100, atk: 10, def: 0, aspd: 100 } }),
        ally("e", { side: "enemy", x: 1, y: 0, attributes: { hp: 5000, def: 0 } }),
      ],
    }),
    [module],
  )
  for (let step = 0; step < 31; step += 1) battle.step()
  expect(hits[0]).toBe(0)
  expect(phases[0]).toBe("recovery")
  expect(phases[10]).toBe("recovery")
  expect(phases[11]).toBe("idle")
  expect(hits[1]).toBe(30)
  expect(hpOf(battle, "e")).toBeLessThan(5000)
})

test("有片段时前摇和后摇按命中点和时长", () => {
  const hits: number[] = []
  const phases: string[] = []
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.subscribe("attack-hit", (event) => {
        hits.push(event.tick)
      })
      ctx.registerSystem({
        id: "arm",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          if (runCtx.tick() === 0) runCtx.startTimer("a", "attack")
        },
      })
      ctx.registerSystem({
        id: "watch",
        slot: "ally",
        priority: 10,
        run(runCtx) {
          phases.push(String(runCtx.timerView("a", "attack").phase))
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["case"],
      tiles: lane,
      units: [
        ally("a", {
          attributes: { hp: 100, atk: 10, def: 0, aspd: 100 },
          attackClip: { duration: 0.2, hit: 0.1 },
        }),
        ally("e", { side: "enemy", x: 1, y: 0, attributes: { hp: 5000, def: 0 } }),
      ],
    }),
    [module],
  )
  for (let step = 0; step < 8; step += 1) battle.step()
  expect(phases[0]).toBe("windup")
  expect(phases[2]).toBe("windup")
  expect(hits).toEqual([3])
  expect(phases[3]).toBe("recovery")
  expect(phases[5]).toBe("recovery")
  expect(phases[6]).toBe("idle")
  expect(hpOf(battle, "e")).toBe(4990)
})

test("前摇被眩晕取消则不结算伤害，技力相位不被这次取消推动", () => {
  let before = { phase: "", elapsed: -1 }
  let after = { phase: "", elapsed: -1 }
  const module: MissionModule = {
    id: "case",
    install(ctx) {
      ctx.registerSystem({
        id: "arm",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          if (runCtx.tick() === 0) runCtx.startTimer("a", "attack")
        },
      })
      ctx.registerSystem({
        id: "stun",
        slot: "status",
        priority: 1,
        run(runCtx) {
          if (runCtx.tick() !== 1) return
          const view = runCtx.timerView("a", "skill-point")
          before = { phase: String(view.phase), elapsed: Number(view.elapsed) }
          runCtx.applyStatus("a", "stun")
          const next = runCtx.timerView("a", "skill-point")
          after = { phase: String(next.phase), elapsed: Number(next.elapsed) }
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["case"],
      tiles: lane,
      units: [
        ally("a", {
          attributes: { hp: 100, atk: 40, def: 0, aspd: 100, spRecovery: 30 },
          attackClip: { duration: 0.2, hit: 0.1 },
          skills: [
            {
              id: "s",
              body: "instant",
              trigger: "NEVER",
              spCost: 100,
              duration: 0,
              ammo: 0,
              spType: "attack",
            },
          ],
        }),
        ally("e", { side: "enemy", x: 1, y: 0, attributes: { hp: 100, def: 0 } }),
      ],
    }),
    [module],
  )
  for (let step = 0; step < 6; step += 1) battle.step()
  expect(hpOf(battle, "e")).toBe(100)
  expect(after).toEqual(before)
  expect(before.elapsed).toBe(1)
  expect(before.phase).toBe("recover")
})

test("没有目标不打出这一下", () => {
  const hits: number[] = []
  const battle = createBattle(
    spec({
      modules: ["case"],
      tiles: lane,
      units: [ally("a", { attributes: { hp: 100, atk: 10, def: 0 } })],
    }),
    [
      attackModule((ctx) => {
        ctx.subscribe("attack-hit", (event) => {
          hits.push(event.tick)
        })
        if (ctx.tick() === 0) ctx.startTimer("a", "attack")
      }),
    ],
  )
  for (let step = 0; step < 5; step += 1) battle.step()
  expect(hits).toEqual([])
  expect(battle.snapshot().units[0]?.attributes.hp).toBe(100)
})

test("阻回不取消攻击，敌人在敌人行动槽里打出伤害", () => {
  const battle = createBattle(
    spec({
      modules: ["case"],
      tiles: lane,
      units: [
        ally("e", { side: "enemy", x: 0, y: 0, facing: "RIGHT", attributes: { hp: 100, atk: 10, def: 0 } }),
        ally("a", { x: 1, y: 0, facing: "LEFT", attributes: { hp: 80, def: 0 } }),
      ],
    }),
    [
      attackModule((ctx) => {
        ctx.registerStatus({
          id: "stop-sp",
          flags: ["noSp"],
          modifiers: [],
          immunity: [],
          stackCap: 1,
          cancels: [],
          duration: 0,
        })
        if (ctx.tick() !== 0) return
        ctx.applyStatus("e", "stop-sp")
        ctx.startTimer("e", "attack")
      }),
    ],
  )
  battle.step()
  expect(hpOf(battle, "a")).toBe(70)
})

test("不能打空的攻击不选飞行单位，隐匿要显形才打得到", () => {
  const flyers = (tags: readonly string[]): { ground: number; flyer: number } => {
    const battle = createBattle(
      spec({
        modules: ["case"],
        tiles: lane,
        units: [
          ally("a", {
            tags,
            attackRange: [
              { x: 1, y: 0 },
              { x: 2, y: 0 },
            ],
            attributes: { hp: 100, atk: 10, def: 0 },
          }),
          ally("ground", { side: "enemy", x: 1, y: 0, attributes: { hp: 40, def: 0 } }),
          ally("flyer", { side: "enemy", x: 2, y: 0, motion: "FLY", attributes: { hp: 40, def: 0 } }),
        ],
      }),
      [attackModule((ctx) => {
        if (ctx.tick() === 0) ctx.startTimer("a", "attack")
      })],
    )
    battle.step()
    return { ground: hpOf(battle, "ground"), flyer: hpOf(battle, "flyer") }
  }
  expect(flyers([])).toEqual({ ground: 30, flyer: 40 })
  const onlyAir = createBattle(
    spec({
      modules: ["case"],
      tiles: lane,
      units: [
        ally("a", { tags: ["canHitFly"], attributes: { hp: 100, atk: 10, def: 0 } }),
        ally("flyer", { side: "enemy", x: 1, y: 0, motion: "FLY", attributes: { hp: 40, def: 0 } }),
      ],
    }),
    [attackModule((ctx) => {
      if (ctx.tick() === 0) ctx.startTimer("a", "attack")
    })],
  )
  onlyAir.step()
  expect(hpOf(onlyAir, "flyer")).toBe(30)

  const hidden = createBattle(
    spec({
      modules: ["case"],
      tiles: lane,
      units: [
        ally("a", { attributes: { hp: 100, atk: 10, def: 0 } }),
        ally("e", { side: "enemy", x: 1, y: 0, attributes: { hp: 40, def: 0 } }),
      ],
    }),
    [
      attackModule((ctx) => {
        if (ctx.tick() === 0) {
          ctx.applyStatus("e", "stealth")
          ctx.startTimer("a", "attack")
          return
        }
        if (ctx.tick() === 3) ctx.applyStatus("e", "reveal")
      }),
    ],
  )
  for (let step = 0; step < 3; step += 1) hidden.step()
  expect(hpOf(hidden, "e")).toBe(40)
  hidden.step()
  expect(hpOf(hidden, "e")).toBe(30)
})

test("被自己阻挡、站在范围外的敌人仍然打得到", () => {
  const units: UnitSpec[] = [
    ally("a", {
      attackRange: [{ x: 1, y: 0 }],
      blocking: ["held"],
      attributes: { hp: 100, atk: 10, def: 0 },
    }),
    ally("held", { side: "enemy", x: 2, y: 0, blockedBy: "a", attributes: { hp: 40, def: 0 } }),
    ally("free", { side: "enemy", x: 3, y: 0, attributes: { hp: 40, def: 0 } }),
  ]
  const battle = createBattle(spec({ modules: ["case"], tiles: lane, units }), [
    attackModule((ctx) => {
      if (ctx.tick() === 0) ctx.startTimer("a", "attack")
    }),
  ])
  battle.step()
  expect(hpOf(battle, "held")).toBe(30)
  expect(hpOf(battle, "free")).toBe(40)
})
