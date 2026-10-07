#!/usr/bin/env node
import { getData } from "#server/entry/packet.js"
import { KITS, skillSpecSource } from "#server/content/operator/battle/index.js"

const USAGE = "usage: node kit-coverage.mjs [--json] [--missing] [--tier N] [--strict]"

function parseArgs(argv) {
  const out = { json: false, missing: false, tier: null, strict: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--json") out.json = true
    else if (arg === "--missing") out.missing = true
    else if (arg === "--strict") out.strict = true
    else if (arg === "--tier") {
      const tier = Number(argv[++i])
      if (!Number.isInteger(tier) || tier < 1 || tier > 6) return null
      out.tier = tier
    } else return null
  }
  return out
}

function skillIndexes(record) {
  return Array.isArray(record?.skills) ? record.skills.map((skill) => skill.index).filter((index) => Number.isInteger(index)) : []
}

export function kitCoverage({ tier = null, kits = KITS, data = getData() } = {}) {
  const chessMap = data.chess ?? {}
  const rows = []
  const bases = Object.values(chessMap)
    .filter((chess) => chess && !chess.isGolden && chess.visible !== false && (tier == null || chess.tier === tier))
    .sort((a, b) => a.tier - b.tier || String(a.chessId).localeCompare(String(b.chessId), "en", { numeric: true }))
  for (const base of bases) {
    const elite = base.goldenId ? chessMap[base.goldenId] ?? null : null
    const indexes = skillIndexes(base).filter((index) => !elite || skillIndexes(elite).includes(index))
    const skills = indexes.map((index) => {
      const rec = (base.skills ?? []).find((skill) => skill.index === index)
      const sourceOf = (id) => {
        const record = chessMap[id]
        if (!record) return "none"
        const skill = (record.skills ?? []).find((entry) => entry.index === index) ?? record.skill
        return skillSpecSource({ ...record, id, baseId: record.baseId ?? base.chessId, skill, raw: record }, kits)
      }
      const normal = sourceOf(base.chessId)
      const eliteSource = elite ? sourceOf(elite.chessId ?? base.goldenId) : normal
      const authored = (source) => source === "skills" || source === "kit"
      return { index, skillId: rec?.skillId, name: rec?.name, isDefault: !!rec?.isDefault, normal, elite: eliteSource, covered: authored(normal) && authored(eliteSource) }
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

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())
if (isMain) {
  const args = parseArgs(process.argv.slice(2))
  if (!args) {
    console.error(USAGE)
    process.exit(2)
  }
  const report = kitCoverage({ tier: args.tier })
  const list = args.missing ? report.chess.filter((row) => row.skills.some((skill) => !skill.covered)) : report.chess
  if (args.json) process.stdout.write(JSON.stringify({ summary: report.summary, chess: list }, null, 1) + "\n")
  else {
    for (const row of list) {
      const cells = row.skills.map((skill) => `S${skill.index + 1}${skill.isDefault ? "*" : ""} ${skill.name} ${skill.covered ? "✓" : skill.normal}`)
      console.log(`T${row.tier} ${row.name} ${row.chessId} ${cells.join(" | ")}`)
    }
    const summary = report.summary
    console.log(`\n${summary.covered}/${summary.skills} selectable skills hand-authored`)
  }
  if (args.strict && report.summary.covered < report.summary.skills) process.exitCode = 1
}
