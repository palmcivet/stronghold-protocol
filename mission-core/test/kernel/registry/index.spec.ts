import { expect, test } from "vitest"
import {
  createBattle,
  defineComponent,
  defineTag,
  UnknownRegistrationError,
  type MissionModule,
  type PhaseSlot,
} from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

const skill = {
  id: "s",
  body: "duration",
  trigger: "UNREGISTERED",
  spCost: 0,
  duration: 0,
  ammo: 0,
}

test("未知模块被拒绝", () => {
  expect(() => createBattle(spec({ modules: ["missing"] }), [])).toThrow(UnknownRegistrationError)
})

test("未知技能触发不退回默认", () => {
  expect(() => createBattle(spec({ units: [ally("a", { skills: [skill] })] }), [])).toThrow(UnknownRegistrationError)
  try {
    createBattle(spec({ units: [ally("a", { skills: [skill] })] }), [])
    expect.unreachable()
  } catch (error) {
    expect(error).toBeInstanceOf(UnknownRegistrationError)
    expect((error as UnknownRegistrationError).registry).toBe("skill-trigger")
    expect((error as UnknownRegistrationError).id).toBe("UNREGISTERED")
  }
})

test("未知技能体被拒绝，内置技能体可以装上", () => {
  const trigger: MissionModule = {
    id: "trigger",
    install(ctx) {
      ctx.registerSkillTrigger({
        id: "always",
        shouldCast: () => true,
      })
    },
  }
  expect(() =>
    createBattle(
      spec({
        modules: ["trigger"],
        units: [ally("a", { skills: [{ ...skill, body: "missing", trigger: "always" }] })],
      }),
      [trigger],
    ),
  ).toThrow(UnknownRegistrationError)
  const battle = createBattle(
    spec({
      modules: ["trigger"],
      units: [ally("a", { skills: [{ ...skill, trigger: "always" }] })],
    }),
    [trigger],
  )
  expect(battle.snapshot().units.map((unit) => unit.id)).toEqual(["a"])
})

test("未知状态、选择器、计时器、元素和阶段槽被拒绝", () => {
  let other: unknown
  const leftKey = defineComponent<{ n?: number }>("left:counter", { create: () => ({}) })
  const rightKey = defineComponent<{ n?: number }>("right:counter", { create: () => ({}) })
  const probe: MissionModule = {
    id: "probe",
    install(ctx) {
      ctx.registerSystem({
        id: "probe",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          expect(() => runCtx.applyStatus("a", "missing")).toThrow(UnknownRegistrationError)
          expect(() => runCtx.select("missing", [])).toThrow(UnknownRegistrationError)
          expect(() => runCtx.advanceTimer("a", "missing")).toThrow(UnknownRegistrationError)
          expect(() => runCtx.addElement("a", "missing", 1)).toThrow(UnknownRegistrationError)
          expect(() =>
            runCtx.registerSystem({
              id: "bad-slot",
              slot: "boss-pool" as PhaseSlot,
              priority: 0,
              run() {},
            }),
          ).toThrow(UnknownRegistrationError)
          const left = runCtx.component(leftKey).ensure("a")
          const right = runCtx.component(rightKey).ensure("a")
          left.n = 1
          other = right.n
        },
      })
    },
  }
  const battle = createBattle(spec({ modules: ["probe"], units: [ally("a")] }), [probe])
  battle.step()
  expect(other).toBeUndefined()
})

test("规格里未注册的标签在建战斗时报错，报出标签与单位规格；模块注册过的标签可以写", () => {
  expect(() => createBattle(spec({ units: [ally("a", { tags: ["glowing"] })] }), [])).toThrow(UnknownRegistrationError)
  expect(() => createBattle(spec({ units: [ally("a", { tags: ["glowing"] })] }), [])).toThrow(/glowing.*unit spec a/)
  const late = { atTick: 5, unit: ally("late", { tags: ["glowing"] }) }
  expect(() => createBattle(spec({ spawns: [late] }), [])).toThrow(/glowing.*unit spec late/)
  const skillFlag = { ...skill, trigger: "always", flags: ["glowing"] }
  expect(() => createBattle(spec({ units: [ally("a", { skills: [skillFlag] })] }), [])).toThrow(/glowing.*unit spec a, skill s/)
  const GLOWING = defineTag("glowing", { meaning: "lit up by the test module" })
  let seen = false
  const glow: MissionModule = {
    id: "glow",
    install(ctx) {
      ctx.registerTag(GLOWING)
      ctx.registerSystem({
        id: "glow",
        slot: "schedule",
        priority: 0,
        run(runCtx) {
          seen = runCtx.hasTag("a", GLOWING)
        },
      })
    },
  }
  const battle = createBattle(spec({ modules: ["glow"], units: [ally("a", { tags: ["glowing"] })] }), [glow])
  battle.step()
  expect(seen).toBe(true)
  expect(battle.snapshot().units[0]?.tags).toEqual(["glowing"])
})

test("未知部署策略被拒绝", () => {
  expect(() => createBattle(spec({ deployStrategy: "column" }), [])).toThrow(UnknownRegistrationError)
})
