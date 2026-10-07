import { expect, test } from "vitest"
import { AUTHORED, kitCoverage } from "./kit-coverage.mjs"

test("visible chess skills are counted and none are hand-authored yet", () => {
  const report = kitCoverage()
  expect(report.summary.chess).toBeGreaterThan(50)
  expect(report.summary.skills).toBeGreaterThan(report.summary.chess)
  expect(report.summary.covered).toBe(0)
  expect(AUTHORED.size).toBe(0)
  const row = report.chess.find((entry) => entry.chessId === "chess_char_1_01_a")
  expect(row?.skills.every((skill) => skill.normal === "generic" && skill.covered === false)).toBe(true)
})
