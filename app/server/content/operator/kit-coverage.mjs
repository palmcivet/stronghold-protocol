#!/usr/bin/env node
// Which selectable skills of every visible chess have a hand-authored spec.
// A skill is covered when both the normal and the elite chess list it in AUTHORED.
// Skills that are not listed fall back to the generic body.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { dataWorkspace } from "@alliance/data/workspace"

const PACKET = path.join(dataWorkspace().seasonDir("act2autochess"), "chess.json")
const USAGE = "usage: node kit-coverage.mjs [--json] [--missing] [--tier N] [--strict]"

/** `${chessId}:${skillId}` pairs with a hand-authored spec. */
export const AUTHORED = new Set()

function parseArgs(argv) {
  const options = { json: false, missing: false, tier: null, strict: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--json") options.json = true
    else if (arg === "--missing") options.missing = true
    else if (arg === "--strict") options.strict = true
    else if (arg === "--tier") {
      const tier = Number(argv[index += 1])
      if (!Number.isInteger(tier) || tier < 1 || tier > 6) return null
      options.tier = tier
    } else return null
  }
  return options
}

function loadChess(file = PACKET) {
  return JSON.parse(fs.readFileSync(file, "utf8"))
}

function sourceOf(chessId, skillId, chess, authored) {
  if (!chess[chessId]) return "none"
  if (authored.has(`${chessId}:${skillId}`)) return "skills"
  const record = chess[chessId]
  return record && (record.skill || (Array.isArray(record.skills) && record.skills.length)) ? "generic" : "none"
}

export function kitCoverage({ tier = null, authored = AUTHORED, chess = loadChess() } = {}) {
  const rows = []
  const bases = Object.values(chess)
    .filter((record) => record && record.visible === true && record.isGolden !== true && (tier == null || record.tier === tier))
    .sort((left, right) => left.tier - right.tier || String(left.chessId).localeCompare(String(right.chessId), "en", { numeric: true }))
  for (const base of bases) {
    if (!Array.isArray(base.skills)) continue
    const skills = base.skills.map((skill) => {
      const normal = sourceOf(base.chessId, skill.skillId, chess, authored)
      const elite = base.goldenId ? sourceOf(base.goldenId, skill.skillId, chess, authored) : normal
      const authoredSource = (value) => value === "skills" || value === "kit"
      return {
        index: skill.index,
        skillId: skill.skillId,
        name: skill.name,
        isDefault: !!skill.isDefault,
        normal,
        elite,
        covered: authoredSource(normal) && authoredSource(elite),
      }
    })
    rows.push({ chessId: base.chessId, name: base.name, tier: base.tier, skills })
  }
  const all = rows.flatMap((row) => row.skills)
  return {
    summary: {
      chess: rows.length,
      skills: all.length,
      covered: all.filter((skill) => skill.covered).length,
      defaultCovered: all.filter((skill) => skill.isDefault && skill.covered).length,
      defaults: all.filter((skill) => skill.isDefault).length,
      chessFullyCovered: rows.filter((row) => row.skills.every((skill) => skill.covered)).length,
    },
    chess: rows,
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) {
  const options = parseArgs(process.argv.slice(2))
  if (!options) {
    console.error(USAGE)
    process.exit(2)
  }
  const report = kitCoverage({ tier: options.tier })
  const list = options.missing ? report.chess.filter((row) => row.skills.some((skill) => !skill.covered)) : report.chess
  if (options.json) process.stdout.write(`${JSON.stringify({ summary: report.summary, chess: list }, null, 1)}\n`)
  else {
    const mark = (skill) => (skill.covered ? "✓" : skill.normal === skill.elite ? `· ${skill.normal}` : `· ${skill.normal}/${skill.elite}`)
    for (const row of list) {
      const cells = row.skills.map((skill) => `S${skill.index + 1}${skill.isDefault ? "*" : ""} ${skill.name} ${mark(skill)}`)
      console.log(`T${row.tier} ${String(row.name).padEnd(8, "　")} ${String(row.chessId).padEnd(18)} ${cells.join(" | ")}`)
    }
    const summary = report.summary
    console.log(`\n${summary.covered}/${summary.skills} selectable skills hand-authored (defaults ${summary.defaultCovered}/${summary.defaults}); ${summary.chessFullyCovered}/${summary.chess} chess fully covered.`)
  }
  if (options.strict && report.summary.covered < report.summary.skills) process.exitCode = 1
}
