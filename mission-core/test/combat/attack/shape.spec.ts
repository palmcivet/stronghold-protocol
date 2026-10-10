import { expect, test } from "vitest"
import {
  BOOMERANG_RETURN_SPEED,
  CHAIN_HEAL_RADIUS,
  PROJECTILE_KIND_SPEEDS,
  PROJECTILE_SPEED,
  TICK,
  createBattle,
  type MissionModule,
  type TileSpec,
} from "arknights-mission-core"
import { engineOf } from "#unit/record/index.js"
import { ally, spec } from "#test/fixture.js"

const wide: readonly TileSpec[] = [0, 1, 2, 3, 4, 5, 6].flatMap((x) =>
  [0, 1].map((y) => ({ x, y, height: 0, deployable: true, walkableBy: ["ground"] })),
)

function hpOf(battle: ReturnType<typeof createBattle>, id: string): number {
  return battle.snapshot().units.find((unit) => unit.id === id)?.attributes.hp ?? Number.NaN
}

function arm(extra?: (ctx: Parameters<MissionModule["install"]>[0]) => void): MissionModule {
  return {
    id: "case",
    install(ctx) {
      extra?.(ctx)
      ctx.registerSystem({
        id: "arm",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          if (runCtx.tick() === 0) runCtx.startTimer("a", "attack")
        },
      })
    },
  }
}

test("投射物种类的速度是数据", () => {
  expect(PROJECTILE_KIND_SPEEDS).toEqual({ arrow: 14, bolt: 11, orb: 10, bomb: 8, boomerang: 15 })
  expect(BOOMERANG_RETURN_SPEED).toBe(3.75)
  expect(PROJECTILE_SPEED).toBe(12)
  expect(CHAIN_HEAL_RADIUS).toBe(2.5)
})

test("溅射打中半径内的人，圈外不动", () => {
  const battle = createBattle(
    spec({
      modules: ["case"],
      tiles: wide,
      units: [
        ally("a", {
          attributes: { hp: 100, atk: 40, def: 0 },
          attackShape: { damage: "arts", splash: { radius: 1.1 } },
          tags: ["canHitFly"],
        }),
        ally("e", { side: "enemy", x: 1, y: 0, attributes: { hp: 200, maxHp: 200, def: 0, res: 0 } }),
        ally("near", { side: "enemy", x: 1, y: 1, attributes: { hp: 200, maxHp: 200, def: 0, res: 0 } }),
        ally("far", { side: "enemy", x: 4, y: 0, attributes: { hp: 200, maxHp: 200, def: 0, res: 0 } }),
      ],
    }),
    [arm()],
  )
  battle.step()
  expect(hpOf(battle, "e")).toBe(160)
  expect(hpOf(battle, "near")).toBe(160)
  expect(hpOf(battle, "far")).toBe(200)
})

test("溅射跳过没破隐的隐匿敌人，显形之后打得到", () => {
  const open = (statuses: readonly string[]) =>
    createBattle(
      spec({
        modules: ["case"],
        tiles: wide,
        units: [
          ally("a", { attributes: { hp: 100, atk: 40, def: 0 }, attackShape: { damage: "arts", splash: { radius: 1.1 } } }),
          ally("e", { side: "enemy", x: 1, y: 0, attributes: { hp: 200, maxHp: 200, def: 0, res: 0 } }),
          ally("near", { side: "enemy", x: 1, y: 1, attributes: { hp: 200, maxHp: 200, def: 0, res: 0 } }),
        ],
      }),
      [
        arm((ctx) =>
          ctx.registerSystem({
            id: "veil",
            slot: "schedule",
            priority: 0,
            run(runCtx) {
              if (runCtx.tick() === 0) for (const status of statuses) runCtx.applyStatus("near", status)
            },
          }),
        ),
      ],
    )
  const hidden = open(["stealth"])
  hidden.step()
  expect(hpOf(hidden, "e")).toBe(160)
  expect(hpOf(hidden, "near")).toBe(200)
  const revealed = open(["stealth", "reveal"])
  revealed.step()
  expect(hpOf(revealed, "e")).toBe(160)
  expect(hpOf(revealed, "near")).toBe(160)
})

test("只打旁人时主目标吃全额，其他人吃倍率", () => {
  const open = (othersOnly: boolean) => {
    const battle = createBattle(
      spec({
        modules: ["case"],
        tiles: wide,
        units: [
          ally("a", {
            attributes: { hp: 100, atk: 40, def: 0 },
            attackShape: { splash: { radius: 1.1, scale: 0.5, othersOnly } },
          }),
          ally("e", { side: "enemy", x: 1, y: 0, attributes: { hp: 200, def: 0 } }),
          ally("near", { side: "enemy", x: 1, y: 1, attributes: { hp: 200, def: 0 } }),
        ],
      }),
      [arm()],
    )
    battle.step()
    return [hpOf(battle, "e"), hpOf(battle, "near")]
  }
  expect(open(true)).toEqual([160, 180])
  expect(open(false)).toEqual([180, 180])
})

test("只打地面时跳过飞行单位", () => {
  const battle = createBattle(
    spec({
      modules: ["case"],
      tiles: wide,
      units: [
        ally("a", {
          attributes: { hp: 100, atk: 30, def: 0 },
          tags: ["canHitFly"],
          attackShape: { splash: { radius: 1.1, groundOnly: true } },
        }),
        ally("e", { side: "enemy", x: 1, y: 0, attributes: { hp: 100, def: 0 } }),
        ally("fly", { side: "enemy", x: 1, y: 1, motion: "FLY", attributes: { hp: 100, def: 0 } }),
      ],
    }),
    [arm()],
  )
  battle.step()
  expect(hpOf(battle, "e")).toBe(70)
  expect(hpOf(battle, "fly")).toBe(100)
})

test("弹射按距离跳，并给停顿", () => {
  let pause = 0
  const battle = createBattle(
    spec({
      modules: ["case"],
      tiles: wide,
      units: [
        ally("a", {
          attributes: { hp: 100, atk: 100, def: 0 },
          attackShape: { bounce: { count: 3, falloff: 0.15, radius: 1.7, pause: 0.5 } },
        }),
        ally("e1", { side: "enemy", x: 1, y: 0, attributes: { hp: 1000, def: 0 } }),
        ally("e2", { side: "enemy", x: 2, y: 0, attributes: { hp: 1000, def: 0 } }),
        ally("e3", { side: "enemy", x: 3, y: 0, attributes: { hp: 1000, def: 0 } }),
        ally("e4", { side: "enemy", x: 6, y: 0, attributes: { hp: 1000, def: 0 } }),
      ],
    }),
    [
      arm((ctx) => {
        ctx.registerSystem({
          id: "pause",
          slot: "ally",
          priority: 10,
          run(runCtx) {
            if (runCtx.tick() !== 0) return
            const unit = engineOf(runCtx).world.units.get("e2")
            pause = unit?.statuses.find((status) => status.id === "sluggish")?.remaining ?? 0
          },
        })
      }),
    ],
  )
  battle.step()
  expect(hpOf(battle, "e1")).toBe(900)
  expect(hpOf(battle, "e2")).toBe(915)
  expect(hpOf(battle, "e3")).toBe(927.75)
  expect(hpOf(battle, "e4")).toBe(1000)
  expect(pause).toBe(Math.round(0.5 / TICK))
})

test("治疗链从生命比例最低的人跳", () => {
  const battle = createBattle(
    spec({
      modules: ["case"],
      tiles: wide,
      units: [
        ally("a", {
          attributes: { hp: 1000, maxHp: 1000, atk: 100, def: 0 },
          attackShape: { damage: "heal", chain: { count: 3, falloff: 0.25 } },
        }),
        ally("low", { x: 1, y: 0, attributes: { hp: 100, maxHp: 1000 } }),
        ally("mid", { x: 2, y: 0, attributes: { hp: 200, maxHp: 1000 } }),
        ally("high", { x: 3, y: 0, attributes: { hp: 400, maxHp: 1000 } }),
      ],
    }),
    [arm()],
  )
  battle.step()
  expect(hpOf(battle, "low")).toBe(200)
  expect(hpOf(battle, "mid")).toBe(275)
  expect(hpOf(battle, "high")).toBe(456.25)
})

test("治疗人数只治疗这么多个受伤友方", () => {
  const battle = createBattle(
    spec({
      modules: ["case"],
      tiles: wide,
      units: [
        ally("a", {
          attributes: { hp: 1000, maxHp: 1000, atk: 20, def: 0 },
          attackRange: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
          attackShape: { damage: "heal", healCount: 2 },
        }),
        ally("low", { x: 1, y: 0, attributes: { hp: 10, maxHp: 100 } }),
        ally("mid", { x: 2, y: 0, attributes: { hp: 40, maxHp: 100 } }),
        ally("high", { x: 3, y: 0, attributes: { hp: 70, maxHp: 100 } }),
        ally("foe", { side: "enemy", x: 1, y: 1, attributes: { hp: 10, maxHp: 100, def: 0 } }),
      ],
    }),
    [arm()],
  )
  battle.step()
  expect(hpOf(battle, "low")).toBe(30)
  expect(hpOf(battle, "mid")).toBe(60)
  expect(hpOf(battle, "high")).toBe(70)
  expect(hpOf(battle, "foe")).toBe(10)
})

test("锁定范围立刻打中范围内每一个人", () => {
  const shots: string[] = []
  const battle = createBattle(
    spec({
      modules: ["case"],
      tiles: wide,
      units: [
        ally("a", {
          attributes: { hp: 100, atk: 10, def: 0 },
          attackRange: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
          attackShape: { lockRange: true, projectile: "bolt" },
        }),
        ally("e1", { side: "enemy", x: 1, y: 0, attributes: { hp: 50, def: 0 } }),
        ally("e2", { side: "enemy", x: 2, y: 0, attributes: { hp: 50, def: 0 } }),
        ally("e3", { side: "enemy", x: 3, y: 0, attributes: { hp: 50, def: 0 } }),
      ],
    }),
    [
      arm((ctx) => {
        ctx.subscribe("projectile", () => {
          shots.push("fly")
        })
      }),
    ],
  )
  battle.step()
  expect(hpOf(battle, "e1")).toBe(40)
  expect(hpOf(battle, "e2")).toBe(40)
  expect(hpOf(battle, "e3")).toBe(40)
  expect(shots).toEqual([])
})

test("箭按种类速度飞到后才结算，目标中途离场则消掉", () => {
  let hitTick = -1
  const flown = createBattle(
    spec({
      modules: ["case"],
      tiles: wide,
      units: [
        ally("a", {
          attributes: { hp: 100, atk: 40, def: 0 },
          attackRange: [{ x: 4, y: 0 }],
          attackShape: { projectile: "arrow" },
        }),
        ally("e", { side: "enemy", x: 4, y: 0, attributes: { hp: 100, def: 0 } }),
      ],
    }),
    [
      arm((ctx) => {
        ctx.subscribe("damaged", (event) => {
          hitTick = event.tick
        })
      }),
    ],
  )
  for (let step = 0; step < 12 && hitTick < 0; step += 1) flown.step()
  expect(hitTick).toBe(8)
  expect(hpOf(flown, "e")).toBe(60)

  const dropped = createBattle(
    spec({
      modules: ["case"],
      tiles: wide,
      units: [
        ally("a", {
          attributes: { hp: 100, atk: 40, def: 0 },
          attackRange: [{ x: 4, y: 0 }],
          attackShape: { projectile: "arrow" },
        }),
        ally("e", { side: "enemy", x: 4, y: 0, attributes: { hp: 10, def: 0 } }),
        ally("near", { side: "enemy", x: 4, y: 1, attributes: { hp: 80, def: 0 } }),
      ],
    }),
    [
      arm((ctx) => {
        ctx.registerSystem({
          id: "kill",
          slot: "schedule",
          priority: 0,
          run(runCtx) {
            if (runCtx.tick() !== 1) return
            runCtx.dealDamage({ sourceId: "a", targetId: "e", amount: 10, kind: "true" })
          },
        })
      }),
    ],
  )
  for (let step = 0; step < 12; step += 1) dropped.step()
  const damaged = dropped.drainEvents().filter((event) => event.type === "damaged")
  expect(damaged).toHaveLength(1)
  expect(hpOf(dropped, "e")).toBe(0)
  expect(hpOf(dropped, "near")).toBe(80)
})

test("溅射弹在目标死后仍在落点爆炸", () => {
  const battle = createBattle(
    spec({
      modules: ["case"],
      tiles: wide,
      units: [
        ally("a", {
          attributes: { hp: 100, atk: 40, def: 0 },
          attackRange: [{ x: 4, y: 0 }],
          attackShape: { projectile: "bomb", splash: { radius: 1.1 } },
        }),
        ally("e", { side: "enemy", x: 4, y: 0, attributes: { hp: 10, def: 0 } }),
        ally("near", { side: "enemy", x: 4, y: 1, attributes: { hp: 100, def: 0 } }),
      ],
    }),
    [
      arm((ctx) => {
        ctx.registerSystem({
          id: "kill",
          slot: "schedule",
          priority: 0,
          run(runCtx) {
            if (runCtx.tick() !== 1) return
            runCtx.dealDamage({ sourceId: "a", targetId: "e", amount: 10, kind: "true" })
          },
        })
      }),
    ],
  )
  for (let step = 0; step < 16; step += 1) battle.step()
  expect(hpOf(battle, "e")).toBe(0)
  expect(hpOf(battle, "near")).toBe(60)
})

test("回旋飞出后结算，飞回不造成伤害，离场则丢失", () => {
  const shots: string[] = []
  const battle = createBattle(
    spec({
      modules: ["case"],
      tiles: wide,
      units: [
        ally("a", {
          attributes: { hp: 200, atk: 25, def: 0, aspd: 600 },
          attackRange: [{ x: 2, y: 0 }],
          attackShape: { projectile: "boomerang" },
        }),
        ally("e", { side: "enemy", x: 2, y: 0, attributes: { hp: 200, def: 0 } }),
      ],
    }),
    [
      arm((ctx) => {
        ctx.subscribe("projectile", (event) => {
          shots.push(String(event.data.id))
        })
      }),
    ],
  )
  for (let step = 0; step < 4; step += 1) battle.step()
  expect(hpOf(battle, "e")).toBe(175)
  expect(battle.snapshot().units.find((unit) => unit.id === "a")?.boomerangsOut).toBe(1)
  for (let step = 0; step < 16; step += 1) battle.step()
  expect(hpOf(battle, "e")).toBe(175)
  expect(battle.snapshot().units.find((unit) => unit.id === "a")?.boomerangsOut).toBe(0)
  expect(battle.snapshot().units.find((unit) => unit.id === "a")?.attributes.boomerangsOut).toBe(0)
  expect(shots.some((id) => id.endsWith(":return"))).toBe(true)

  const lost: string[] = []
  const gone = createBattle(
    spec({
      modules: ["case"],
      tiles: wide,
      units: [
        ally("a", {
          attributes: { hp: 50, atk: 25, def: 0 },
          attackRange: [{ x: 2, y: 0 }],
          attackShape: { projectile: "boomerang" },
        }),
        ally("e", { side: "enemy", x: 2, y: 0, attributes: { hp: 200, def: 0 } }),
      ],
    }),
    [
      arm((ctx) => {
        ctx.subscribe("projectile", (event) => {
          lost.push(String(event.data.id))
        })
        ctx.registerSystem({
          id: "down",
          slot: "schedule",
          priority: 0,
          run(runCtx) {
            if (runCtx.tick() !== 3) return
            runCtx.dealDamage({ sourceId: "e", targetId: "a", amount: 50, kind: "true" })
          },
        })
      }),
    ],
  )
  for (let step = 0; step < 8; step += 1) gone.step()
  expect(hpOf(gone, "e")).toBe(175)
  expect(gone.snapshot().units.find((unit) => unit.id === "a")?.boomerangsOut).toBe(0)
  expect(lost.some((id) => id.endsWith(":return"))).toBe(false)
})
