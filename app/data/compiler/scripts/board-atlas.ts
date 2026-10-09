#!/usr/bin/env node
import { nodeBuildFiles } from "arknights-assets-extractor"
import { cropBoardAtlas } from "#compiler/media/board/atlas.js"

cropBoardAtlas(nodeBuildFiles, process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code
  },
  (cause) => {
    console.error(`[crop-board-atlas] ${cause instanceof Error ? cause.message : String(cause)}`)
    process.exitCode = 1
  },
)
