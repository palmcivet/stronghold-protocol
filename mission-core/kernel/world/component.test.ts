import { expect, test } from "vitest"
import { createComponentStore, defineComponent } from "#kernel/world/component.js"

const COUNTER = defineComponent<{ n: number }>("case:counter", { create: () => ({ n: 0 }), view: (value) => value.n })
const MARK = defineComponent<string>("case:mark", { create: (id) => `mark-${id}`, reset: "clear" })

test("ensure 第一次按实体建值，之后返回同一份；entries 按第一次写入的顺序", () => {
  const store = createComponentStore()
  const counters = store.access(COUNTER)
  expect(counters.get("a")).toBeUndefined()
  counters.ensure("b").n = 2
  counters.ensure("a").n += 1
  expect(counters.ensure("b").n).toBe(2)
  expect(counters.entries()).toEqual([
    ["b", { n: 2 }],
    ["a", { n: 1 }],
  ])
  counters.delete("b")
  expect(counters.get("b")).toBeUndefined()
})

test("不同键的表互不相干，同一 id 的两个键报错", () => {
  const store = createComponentStore()
  store.access(COUNTER).ensure("a").n = 5
  expect(store.access(MARK).ensure("a")).toBe("mark-a")
  expect(() => store.access(defineComponent("case:counter", { create: () => 0 }))).toThrow()
  expect(() => defineComponent("counter", { create: () => 0 })).toThrow()
})

test("再部署时 clear 的组件删掉，keep 的保留；view 只给带 view 的组件", () => {
  const store = createComponentStore()
  store.access(COUNTER).ensure("a").n = 3
  store.access(MARK).set("a", "kept?")
  expect(store.views("a")).toEqual({ "case:counter": 3 })
  store.reset("a")
  expect(store.access(COUNTER).get("a")).toEqual({ n: 3 })
  expect(store.access(MARK).get("a")).toBeUndefined()
})

test("codec 钩子随键带着", () => {
  const encoded = defineComponent<Set<string>>("case:set", {
    create: () => new Set(),
    codec: { encode: (value) => [...value], decode: (data) => new Set(data as string[]) },
  })
  const value = new Set(["x", "y"])
  const data = encoded.options.codec?.encode(value)
  expect(data).toEqual(["x", "y"])
  expect(encoded.options.codec?.decode(data)).toEqual(value)
})
