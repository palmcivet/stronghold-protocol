import { expect, test } from "vitest"
import {
  createBattle,
  defineAttribute,
  defineEffect,
  defineExtensible,
  ExtensionRefusedError,
  RegistrationConflictError,
  UnknownRegistrationError,
  type BattleSpec,
  type MissionModule,
  type SkillSpec,
} from "arknights-mission-core"
import { ally, spec } from "#test/fixture.js"

const instant: SkillSpec = {
  id: "s",
  body: "passive",
  trigger: "DEFAULT",
  spCost: 0,
  duration: 0,
  ammo: 0,
  operation: "AUTO",
  hooks: { start: "count-start" },
}

function counter(version?: string): { module: MissionModule; starts: string[] } {
  const starts: string[] = []
  return {
    starts,
    module: {
      id: "counter",
      ...(version !== undefined ? { version } : {}),
      install(ctx) {
        ctx.registerSkillHook({
          id: "count-start",
          run(moment) {
            starts.push(moment.unitId)
          },
        })
      },
    },
  }
}

test("规格是纯数据：JSON 往返后行为与 contentHash 不变，技能钩子按 id 找到", () => {
  const plain = spec({ modules: ["counter"], units: [ally("a", { skills: [instant] })] })
  const left = counter()
  const right = counter()
  const a = createBattle(plain, [left.module])
  const b = createBattle(JSON.parse(JSON.stringify(plain)) as BattleSpec, [right.module])
  for (let step = 0; step < 5; step += 1) {
    a.step()
    b.step()
  }
  expect(left.starts.length).toBeGreaterThan(0)
  expect(right.starts).toEqual(left.starts)
  expect(b.snapshot()).toEqual(a.snapshot())
  expect(b.contentHash()).toBe(a.contentHash())
  expect(a.contentHash()).toMatch(/^[0-9a-f]{16}$/)
})

test("规格里有函数时开场报错；未注册的技能钩子、条件与效果报 UnknownRegistrationError", () => {
  const withFunction = spec({ units: [ally("a")] }) as unknown as Record<string, unknown>
  withFunction.extra = () => 1
  expect(() => createBattle(withFunction as unknown as BattleSpec, [])).toThrow(/spec\.extra/)
  expect(() => createBattle(spec({ units: [ally("a", { skills: [instant] })] }), [])).toThrow(UnknownRegistrationError)
  expect(() =>
    createBattle(
      spec({ units: [ally("a", { conditionalEffects: [{ condition: "missing", effect: "fragile" }] })] }),
      [],
    ),
  ).toThrow(UnknownRegistrationError)
  expect(() =>
    createBattle(
      spec({ units: [ally("a", { conditionalEffects: [{ condition: "enemies-in-range", effect: "missing" }] })] }),
      [],
    ),
  ).toThrow(UnknownRegistrationError)
})

test("contentHash 随规格、模块版本与替换链变化", () => {
  const plain = spec({ modules: ["counter"], units: [ally("a", { skills: [instant] })] })
  const base = createBattle(plain, [counter().module]).contentHash()
  expect(createBattle(plain, [counter("2").module]).contentHash()).not.toBe(base)
  expect(createBattle({ ...plain, seed: 2 }, [counter().module]).contentHash()).not.toBe(base)
  const swap: MissionModule = {
    id: "swap",
    install(ctx) {
      ctx.wrap(defineExtensible("all", { version: 1, contract: "selector" }), (inner) => ({ ...inner }))
    },
  }
  const swapped = createBattle({ ...plain, modules: ["counter", "swap"] }, [counter().module, swap])
  const idle: MissionModule = { id: "swap", install() {} }
  const unswapped = createBattle({ ...plain, modules: ["counter", "swap"] }, [counter().module, idle])
  expect(swapped.contentHash()).not.toBe(unswapped.contentHash())
})

test("重复注册报冲突；只有标成可扩展的 id 能 replace 或 wrap，契约版本要一致", () => {
  const open = (install: MissionModule["install"]) =>
    createBattle(spec({ modules: ["case"], units: [ally("a")] }), [{ id: "case", install }])
  expect(() => open((ctx) => ctx.registerEffect(defineEffect("stun")))).toThrow(RegistrationConflictError)
  expect(() =>
    open((ctx) => {
      ctx.registerSkillHook({ id: "probe", run() {} })
      ctx.registerSkillHook({ id: "probe", run() {} })
    }),
  ).toThrow(RegistrationConflictError)
  expect(() =>
    open((ctx) => ctx.replace(defineExtensible("burn", { version: 2, contract: "element" }), { id: "burn", cap: 1, resistance: 0 })),
  ).toThrow(ExtensionRefusedError)
  expect(() =>
    open((ctx) => {
      ctx.registerSelector({ id: "mine", filter: () => true, compare: () => 0 })
      ctx.replace(defineExtensible("mine", { version: 1, contract: "selector" }), { id: "mine", filter: () => false, compare: () => 0 })
    }),
  ).toThrow(ExtensionRefusedError)

  const calls: string[] = []
  const wrapped = createBattle(spec({ modules: ["case"], units: [ally("a"), ally("b", { x: 1 })] }), [
    {
      id: "case",
      install(ctx) {
        ctx.wrap(defineExtensible("all", { version: 1, contract: "selector" }), (inner) => ({
          ...inner,
          filter(...args) {
            calls.push(args[0])
            return inner.filter(...args)
          },
        }))
        ctx.registerSystem({
          id: "query",
          slot: "schedule",
          priority: 0,
          run(runCtx) {
            if (runCtx.tick() === 0) runCtx.unitsInRange("a", "all")
          },
        })
      },
    },
  ])
  wrapped.step()
  expect(calls.length).toBeGreaterThan(0)
})

test("属性按 基础 → 加值 → 百分比 → 乘算 → 独立乘区 聚合，再按定义夹住；规格没写时取定义的基础值", () => {
  const seen: number[] = []
  const battle = createBattle(spec({ modules: ["case"], units: [ally("a", { attributes: { hp: 100, atk: 100 } })] }), [
    {
      id: "case",
      install(ctx) {
        ctx.registerAttribute(defineAttribute("focus", { base: 5, clamp: { min: 0, max: 40 } }))
        ctx.registerEffect(
          defineEffect("mix", {
            modifiers: [
              { attribute: "atk", op: "add", value: 20 },
              { attribute: "atk", op: "percent", value: 0.5 },
              { attribute: "atk", op: "mul", value: 2 },
              { attribute: "atk", op: "independent", value: 0.5 },
              { attribute: "focus", op: "mul", value: 10 },
            ],
          }),
        )
        ctx.registerSystem({
          id: "read",
          slot: "schedule",
          priority: 0,
          run(runCtx) {
            if (runCtx.tick() !== 0) return
            seen.push(runCtx.attribute("a", "focus"))
            runCtx.applyEffect("a", "mix")
            seen.push(runCtx.attribute("a", "atk"), runCtx.attribute("a", "focus"))
          },
        })
      },
    },
  ])
  battle.step()
  expect(seen).toEqual([5, 180, 40])
})

test("条件效果：攻击范围内有敌人时挂上，敌人离开或倒下时取下", () => {
  const held: boolean[] = []
  const battle = createBattle(
    spec({
      modules: ["case"],
      tiles: [
        { x: 0, y: 0, height: 0, deployable: true, walkableBy: ["ground"] },
        { x: 1, y: 0, height: 0, deployable: true, walkableBy: ["ground"] },
      ],
      units: [
        ally("a", {
          attackRange: [{ x: 1, y: 0 }],
          conditionalEffects: [{ condition: "enemies-in-range", effect: "fragile", value: 0.5, params: { count: 1 } }],
        }),
        ally("e", { side: "enemy", x: 1, y: 0, attributes: { hp: 100 } }),
      ],
    }),
    [
      {
        id: "case",
        install(ctx) {
          ctx.registerSystem({
            id: "watch",
            slot: "finale",
            priority: 0,
            run(runCtx) {
              held.push(runCtx.attribute("a", "dmgTaken") > 1)
              if (runCtx.tick() === 2) runCtx.loseHp("e", 1000)
            },
          })
        },
      },
    ],
  )
  for (let step = 0; step < 5; step += 1) battle.step()
  expect(held).toEqual([true, true, true, false, false])
  expect(battle.contentHash()).toMatch(/^[0-9a-f]{16}$/)
})
