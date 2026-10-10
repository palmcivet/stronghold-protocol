import { expect, test } from "vitest"
import {
  createBattle,
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
          const left = runCtx.moduleData("left", "a")
          const right = runCtx.moduleData("right", "a")
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

test("未知部署策略被拒绝", () => {
  expect(() => createBattle(spec({ deployStrategy: "column" }), [])).toThrow(UnknownRegistrationError)
})
