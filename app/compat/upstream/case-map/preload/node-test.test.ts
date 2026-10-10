import { expect, test } from "vitest"
import { describe as standInDescribe, recordedNames, test as standInTest } from "#case-map/preload/node-test.js"

test("the node:test stand-in records full names and never runs case bodies", async () => {
  let ran = false
  const body = (): void => {
    ran = true
  }
  standInDescribe("suite", () => {
    standInTest("case 1", body)
    standInDescribe("inner", { concurrency: 1 }, () => {
      standInTest("case 2", { timeout: 5 }, body)
      standInTest.skip("skipped", body)
    })
  })
  standInTest("top", body)
  standInTest(function named() {
    ran = true
  })
  await standInDescribe("async suite", async () => {
    standInTest("before await", body)
    await Promise.resolve()
  })
  expect(await recordedNames()).toEqual([
    "suite > case 1",
    "suite > inner > case 2",
    "suite > inner > skipped",
    "top",
    "named",
    "async suite > before await",
  ])
  expect(ran).toBe(false)
})
