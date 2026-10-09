#!/usr/bin/env node
import { fetchBuildHttp, nodeBuildFiles } from "arknights-assets-extractor"
import { compileEmotes } from "#compiler/media/emote.js"

compileEmotes(nodeBuildFiles, fetchBuildHttp, process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code
  },
  (cause) => {
    const message = cause instanceof Error ? cause.message : String(cause)
    console.error(`build-emotes: ${message}`)
    process.exitCode = 2
  },
)
