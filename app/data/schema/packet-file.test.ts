import { expect, test } from "vitest"
import { packetAddress } from "#schema/packet-file.js"

test("season packet address", () => {
  expect(packetAddress("act2autochess", "chess")).toBe("/data/seasons/act2autochess/chess.json")
  expect(() => packetAddress("../act", "chess")).toThrow(/season id/)
})
