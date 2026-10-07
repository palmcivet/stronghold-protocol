import { expect, test } from "vitest"
import { buffParams, directMods, isCoreBond, itemKeyOf, bondRecord } from "#server/content/support/record.js"

test("item keys drop the quality suffix and core bonds come from the packet", () => {
  expect(itemKeyOf("chess_item_1_01_e_b")).toBe("chess_item_1_01_e")
  expect(itemKeyOf("chess_item_6_02_m")).toBe("chess_item_6_02_m")
  expect(isCoreBond("yanShip")).toBe(true)
  expect(isCoreBond("preciShip")).toBe(false)
  const params = buffParams(bondRecord("yanShip"), "act1autochess_bond_eff_yan")
  expect(params?.base_atk).toBe(0.23)
  expect(params?.atk_per_stack).toBe(0.009)
})

test("direct multiply ratios become percent modifiers", () => {
  expect(directMods({ atk: 0.3, def: 0, hp: -0.1 })).toEqual([
    { attribute: "atk", op: "percent", value: 0.3 },
    { attribute: "hp", op: "percent", value: -0.1 },
  ])
})
