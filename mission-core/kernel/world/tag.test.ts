import { expect, test } from "vitest"
import {
  createTagCatalog,
  createTagGrants,
  defineTag,
  grantTag,
  hasTag,
  heldTagIds,
  heldTags,
  revokeSources,
  revokeTag,
  tagSources,
  type TagHolder,
} from "#kernel/world/tag.js"
import { UnknownRegistrationError } from "#kernel/registry/error.js"

const CALM = defineTag("calm", { meaning: "test: calm" })
const RESTING = defineTag("resting", { meaning: "test: resting", implies: [CALM] })
const LOUD = defineTag("loud", { meaning: "test: loud" })
const DOZING = defineTag("dozing", { meaning: "test: dozing", implies: [RESTING] })

function holder(): TagHolder {
  return { tags: createTagGrants() }
}

test("按来源计数：同一来源授予几次就要撤销几次，所有来源撤销后标签消失", () => {
  const unit = holder()
  grantTag(unit, LOUD, "a")
  grantTag(unit, LOUD, "a")
  grantTag(unit, LOUD, "b")
  expect(tagSources(unit, LOUD)).toEqual(["a", "b"])
  revokeTag(unit, LOUD, "a")
  expect(hasTag(unit, LOUD)).toBe(true)
  revokeTag(unit, LOUD, "b")
  expect(tagSources(unit, LOUD)).toEqual(["a"])
  revokeTag(unit, LOUD, "a")
  expect(hasTag(unit, LOUD)).toBe(false)
  expect(tagSources(unit, LOUD)).toEqual([])
})

test("蕴含只用于查询：不进持有列表，也没有来源", () => {
  const unit = holder()
  grantTag(unit, RESTING, "status:rest")
  expect(hasTag(unit, CALM)).toBe(true)
  expect(tagSources(unit, CALM)).toEqual([])
  expect(heldTags(unit).map((key) => key.id)).toEqual(["resting"])
})

test("按来源条件整批撤销，持有列表按第一次授予的顺序并可按来源筛选", () => {
  const unit = holder()
  grantTag(unit, LOUD, "spec")
  grantTag(unit, CALM, "status:x")
  grantTag(unit, LOUD, "status:x")
  expect(heldTags(unit).map((key) => key.id)).toEqual(["loud", "calm"])
  expect(heldTags(unit, (source) => source === "spec").map((key) => key.id)).toEqual(["loud"])
  revokeSources(unit, (source) => source.startsWith("status:"))
  expect(heldTags(unit).map((key) => key.id)).toEqual(["loud"])
  expect(tagSources(unit, LOUD)).toEqual(["spec"])
})

test("同一 id 的两个键不能混用", () => {
  const unit = holder()
  grantTag(unit, LOUD, "a")
  expect(() => grantTag(unit, defineTag("loud", { meaning: "another" }), "a")).toThrow()
  const catalog = createTagCatalog()
  catalog.register(LOUD)
  catalog.register(LOUD)
  expect(() => catalog.register(defineTag("loud", { meaning: "another" }))).toThrow()
})

test("目录按 id 找键，没注册时报出 id 和出处", () => {
  const catalog = createTagCatalog()
  catalog.register(CALM)
  expect(catalog.require("calm")).toBe(CALM)
  expect(catalog.has("loud")).toBe(false)
  expect(() => catalog.require("loud", "unit spec e1")).toThrow(UnknownRegistrationError)
  expect(() => catalog.require("loud", "unit spec e1")).toThrow(/loud.*unit spec e1/)
})

test("蕴含逐层展开并按持有计数：两个持有标签都蕴含同一个时，撤掉一个仍为真", () => {
  expect(DOZING.expanded).toEqual(["resting", "calm"])
  const unit = holder()
  grantTag(unit, DOZING, "status:doze")
  grantTag(unit, RESTING, "status:rest")
  expect(hasTag(unit, CALM)).toBe(true)
  revokeTag(unit, DOZING, "status:doze")
  expect(hasTag(unit, CALM)).toBe(true)
  expect(hasTag(unit, DOZING)).toBe(false)
  revokeSources(unit, (sourceId) => sourceId.startsWith("status:"))
  expect(hasTag(unit, CALM)).toBe(false)
  expect(hasTag(unit, RESTING)).toBe(false)
})

test("每次授予与撤销都让版本前进；按来源取 id 不受蕴含影响", () => {
  const unit = holder()
  const start = unit.tags.version
  grantTag(unit, LOUD, "spec")
  grantTag(unit, LOUD, "status:x")
  expect(unit.tags.version).toBe(start + 2)
  expect(heldTagIds(unit, (sourceId) => sourceId === "spec")).toEqual(["loud"])
  revokeTag(unit, LOUD, "status:x")
  expect(unit.tags.version).toBe(start + 3)
  grantTag(unit, RESTING, "status:y")
  expect(heldTagIds(unit, (sourceId) => sourceId !== "spec")).toEqual(["resting"])
})
