#!/usr/bin/env node
import { fetchAssets } from "#compiler/media/fetch/assets.js"
import { fetchCatalogHttp, nodeCatalogFiles } from "arknights-assets-catalog"

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

fetchAssets(nodeCatalogFiles, fetchCatalogHttp, process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code
  },
  (cause) => {
    console.error(`[assets] FAILED: ${process.env["DEBUG"] ? (cause instanceof Error ? cause.stack || cause.message : cause) : errorMessage(cause)}`)
    process.exitCode = 1
  },
)
