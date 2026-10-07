import { expect, test } from "vitest"
import { lookupMode, lookupRecord } from "#runtime/packet/record-index.js"

test("record lookup ignores prototype names", () => {
  const documents = { chess: { amiya: { chessId: "amiya" } } }
  expect(lookupRecord(documents, "chess", "amiya")?.["chessId"]).toBe("amiya")
  expect(lookupRecord(documents, "chess", "constructor")).toBeNull()
  expect(lookupMode({ config: { modes: { mode_multi_hard: { modeId: "mode_multi_hard" } } } }, "mode_multi_hard")?.["modeId"]).toBe("mode_multi_hard")
})
