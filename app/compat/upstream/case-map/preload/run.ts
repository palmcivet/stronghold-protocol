import { writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { recordedNames } from "#case-map/preload/node-test.js"

// Child entry: node --import <register.js> run.js <test file> <result file>
// Imports one test file with node:test replaced, writes the case names or the import error, then exits.

const [testFile, resultFile] = process.argv.slice(2)
if (testFile === undefined || resultFile === undefined) {
  process.stderr.write("usage: run.js <test file> <result file>\n")
  process.exit(2)
}
try {
  await import(pathToFileURL(testFile).href)
  writeFileSync(resultFile, JSON.stringify({ names: await recordedNames() }))
} catch (error) {
  const reason = error instanceof Error ? (error.stack ?? error.message) : String(error)
  writeFileSync(resultFile, JSON.stringify({ error: reason }))
}
process.exit(0)
