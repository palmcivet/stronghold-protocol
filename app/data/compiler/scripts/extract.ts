#!/usr/bin/env node
// pnpm extract:media：把 .cache/needs 下的全部需求清单交给 assets-extractor，结果写进提取缓存。
// 其余参数原样传给 `extract` 命令，例如 --offline、--force、--proxy <url>。

import { readdirSync } from "node:fs"
import { join } from "node:path"
import { extractCommand } from "arknights-assets-extractor"
import { dataWorkspace } from "#workspace.js"

const workspace = dataWorkspace()

function needListFiles(): string[] {
  try {
    return readdirSync(workspace.needsDir)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => join(workspace.needsDir, name))
  } catch {
    return []
  }
}

const needs = needListFiles()
if (needs.length === 0) {
  console.error(`extract:media: no need lists in ${workspace.needsDir}; run pnpm compile:needs first`)
  process.exitCode = 2
} else {
  extractCommand(["--needs", ...needs, "--cache", workspace.extractCacheDir, ...process.argv.slice(2)]).then(
    (code) => {
      process.exitCode = code
    },
    (cause: unknown) => {
      console.error(cause instanceof Error ? cause.message : String(cause))
      process.exitCode = 2
    },
  )
}
