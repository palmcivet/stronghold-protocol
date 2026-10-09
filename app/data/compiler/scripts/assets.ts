#!/usr/bin/env node
import { fetchAssets } from "#compiler/media/fetch/assets.js"
import { fetchBuildHttp, nodeBuildFiles } from "arknights-assets-extractor"

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

fetchAssets(nodeBuildFiles, fetchBuildHttp, process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code
  },
  (cause) => {
    console.error(`[assets] FAILED: ${process.env["DEBUG"] ? (cause instanceof Error ? cause.stack || cause.message : cause) : errorMessage(cause)}`)
    process.exitCode = 1
  },
)
