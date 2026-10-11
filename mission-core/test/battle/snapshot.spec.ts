import { expect, test } from "vitest"
import { STEALTH } from "#port/tag.js"
import { createBattle, redeployModule, type MissionModule, type StatusDefinition, type UnitSnapshot } from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"
import { SCENARIOS } from "#test/golden/scenario.js"

function unitIn(battle: ReturnType<typeof createBattle>, id: string): UnitSnapshot {
  const unit = battle.snapshot().units.find((item) => item.id === id)
  if (!unit) throw new Error(`单位不存在: ${id}`)
  return unit
}

const stealth: StatusDefinition = {
  id: "stealth",
  tags: [STEALTH],
  modifiers: [],
  immunity: [],
  stackCap: 1,
  cancels: [],
  duration: 0,
}

test("快照不调用选择器", () => {
  let calls = 0
  const probe: MissionModule = {
    id: "probe",
    install(ctx) {
      ctx.registerStatus(stealth)
      ctx.registerSelector({
        id: "trap",
        filter() {
          calls += 1
          return true
        },
        compare() {
          calls += 1
          return 0
        },
      })
      ctx.registerSystem({
        id: "apply",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          runCtx.applyStatus("a", "stealth")
        },
      })
      ctx.registerSystem({
        id: "query",
        slot: "ally",
        priority: 1,
        run(runCtx) {
          runCtx.unitsInRange("a", "trap")
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["probe"],
      units: [ally("a"), ally("b", { side: "enemy", x: 1, y: 0 })],
    }),
    [probe],
  )
  expect(calls).toBe(0)
  battle.snapshot()
  expect(calls).toBe(0)
  battle.step()
  expect(calls).toBeGreaterThan(0)
  const afterStep = calls
  const snapshot = battle.snapshot()
  expect(calls).toBe(afterStep)
  expect(snapshot.units.find((unit) => unit.id === "a")?.tags).toContain("stealth")
  expect(snapshot.units.find((unit) => unit.id === "a")?.elements).toEqual({})
})

test("倒下的单位带再部署计时：先计时，到点后费用不够就停在满值等待，回来后清掉", () => {
  const knock: MissionModule = {
    id: "knock",
    install(ctx) {
      ctx.registerSystem({
        id: "knock",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          if (runCtx.tick() === 0) runCtx.dealDamage({ sourceId: "a", targetId: "a", amount: 500, kind: "true" })
          if (runCtx.tick() === 60) runCtx.addCost("ally", 4)
        },
      })
    },
  }
  const battle = createBattle(
    spec({
      modules: ["knock", "redeploy"],
      cost: {
        ally: { initial: 0, regen: 0, cap: 20 },
        enemy: { initial: 0, regen: 0, cap: 0 },
      },
      units: [ally("a", { x: 2, y: 0, attributes: { hp: 10, maxHp: 25, cost: 4, respawnTime: 1 } })],
    }),
    [knock, redeployModule],
  )
  expect(unitIn(battle, "a")).toMatchObject({ downed: false, redeploy: null })
  battle.step()
  const counting = unitIn(battle, "a")
  expect(counting.downed).toBe(true)
  expect(counting.redeploy?.duration).toBe(1)
  expect(counting.redeploy?.elapsed).toBeGreaterThan(0)
  expect(counting.redeploy?.elapsed).toBeLessThan(1)
  for (let tick = 1; tick < 45; tick += 1) battle.step()
  const waiting = unitIn(battle, "a")
  expect(waiting.downed).toBe(true)
  expect(waiting.redeploy?.elapsed).toBeGreaterThanOrEqual(1 - 1e-6)
  battle.step()
  expect(unitIn(battle, "a").redeploy).toEqual(waiting.redeploy)
  for (let tick = 46; tick <= 60; tick += 1) battle.step()
  expect(unitIn(battle, "a")).toMatchObject({ downed: false, redeploy: null, x: 2, y: 0 })
  expect(unitIn(battle, "a").attributes.hp).toBe(25)
})

test("元素视图取最满的一槽，一样满按官方元素先后，爆发时锁住，没有槽时不出现", () => {
  const charges: Record<number, readonly [string, number][]> = {
    0: [["burn", 4], ["neural", 4]],
    1: [["burn", 2]],
    2: [["neural", 6]],
  }
  const module: MissionModule = {
    id: "elements",
    install(ctx) {
      ctx.registerElement({ id: "burn", cap: 10, resistance: 0 })
      ctx.registerElement({ id: "neural", cap: 10, resistance: 0 })
      ctx.registerSystem({
        id: "charge",
        slot: "schedule",
        priority: 1,
        run(runCtx) {
          for (const [element, amount] of charges[runCtx.tick()] ?? []) runCtx.addElement("a", element, amount)
        },
      })
    },
  }
  const battle = createBattle(
    spec({ modules: ["elements"], units: [ally("a", { attributes: { hp: 1e6, maxHp: 1e6 } }), ally("b", { x: 1, y: 0 })] }),
    [module],
  )
  battle.step()
  expect(unitIn(battle, "a").components["element:gauges"]).toEqual({ element: "neural", ratio: 0.4, locked: false })
  battle.step()
  expect(unitIn(battle, "a").components["element:gauges"]).toEqual({ element: "burn", ratio: 0.6, locked: false })
  battle.step()
  expect(unitIn(battle, "a").components["element:gauges"]).toEqual({ element: "neural", ratio: 1, locked: true })
  expect(unitIn(battle, "b").components).not.toHaveProperty("element:gauges")
})

test("弹药技能持续时快照带剩余弹药与弹匣，其余时候是 null，技力照常给出", () => {
  const scenario = SCENARIOS.find((item) => item.name === "skill")
  if (!scenario) throw new Error("缺少 skill 场景")
  const battle = createBattle(scenario.spec(), scenario.modules())
  const lefts = new Set<number>()
  let idle = 0
  for (let tick = 0; tick < scenario.ticks; tick += 1) {
    battle.step()
    const skill = unitIn(battle, "ammo").skills[0]
    if (!skill) throw new Error("缺少弹药技能")
    expect(skill).toMatchObject({ id: "s2", spCost: 2 })
    expect(typeof skill.sp).toBe("number")
    if (!skill.active) {
      expect(skill.ammo).toBeNull()
      idle += 1
      continue
    }
    expect(skill.ammo?.max).toBe(3)
    const left = skill.ammo?.left ?? -1
    expect(Number.isInteger(left)).toBe(true)
    expect(left).toBeGreaterThanOrEqual(0)
    expect(left).toBeLessThanOrEqual(3)
    lefts.add(left)
  }
  expect(idle).toBeGreaterThan(0)
  expect(lefts.size).toBeGreaterThan(1)
})
