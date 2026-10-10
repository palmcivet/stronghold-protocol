import { expect, test } from "vitest"
import type { BattleSpec } from "#contract/spec.js"
import { createResourceStore, defineResource } from "#kernel/world/resource.js"

const spec: BattleSpec = {
  seed: 7,
  modules: [],
  tiles: [],
  units: [],
  spawns: [],
  deployStrategy: null,
  cost: { ally: { initial: 0, regen: 0, cap: 0 }, enemy: { initial: 0, regen: 0, cap: 0 } },
}

const SEEDED = defineResource<{ seed: number }>("case:seeded", (battle) => ({ seed: battle.seed }))

test("ensure 第一次按本场规格建值，之后返回同一份；set 与 delete 换掉或去掉这份值", () => {
  const store = createResourceStore(spec)
  const seeded = store.access(SEEDED)
  expect(seeded.get()).toBeUndefined()
  const first = seeded.ensure()
  expect(first).toEqual({ seed: 7 })
  expect(store.access(SEEDED).ensure()).toBe(first)
  seeded.set({ seed: 1 })
  expect(seeded.ensure()).toEqual({ seed: 1 })
  seeded.delete()
  expect(seeded.ensure()).toEqual({ seed: 7 })
})

test("同一 id 的两个键报错，id 要写成 模块:名字", () => {
  const store = createResourceStore(spec)
  store.access(SEEDED).ensure()
  expect(() => store.access(defineResource("case:seeded", () => 0))).toThrow()
  expect(() => defineResource("seeded", () => 0)).toThrow()
})
