#!/usr/bin/env node
import fs from "node:fs"
import { fileURLToPath } from "node:url"
import { APP_VERSION } from "@alliance/contract/match.js"
import { lanUrls, startServer, type RunningServer } from "#server/entry/index.js"

function isProcessEntry(): boolean {
  if (!process.argv[1]) return false
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

async function boot(): Promise<void> {
  process.on("unhandledRejection", (cause) => console.error("[process] unhandled rejection", cause))
  process.on("uncaughtException", (cause) => console.error("[process] uncaught exception", cause))
  let running: RunningServer
  try {
    running = await startServer()
  } catch (cause) {
    const error = cause as NodeJS.ErrnoException & { port?: number }
    if (error?.code === "EADDRINUSE") console.error(`端口已被占用 / port in use: ${error.port ?? process.env.PORT ?? 3000}. Try PORT=3001`)
    else console.error("[boot] failed to start", cause)
    process.exit(1)
  }
  console.log(`\n  卫戍协议：盟约 · Stronghold Protocol: Alliance v${APP_VERSION}`)
  console.log(`  Local:   ${running.url}`)
  if (running.host === "0.0.0.0" || running.host === "::") {
    for (const url of lanUrls(running.port)) console.log(`  LAN:     ${url}`)
  }
  console.log("  Internet: cloudflared tunnel --url " + `http://localhost:${running.port}` + "\n")

  let stopping = false
  const stop = (signal: string): void => {
    if (stopping) {
      console.log("forced exit")
      process.exit(1)
    }
    stopping = true
    console.log(`\n[${signal}] shutting down…`)
    setTimeout(() => process.exit(0), 5000).unref()
    running.close().then(() => process.exit(0), () => process.exit(1))
  }
  process.on("SIGINT", () => stop("SIGINT"))
  process.on("SIGTERM", () => stop("SIGTERM"))
}

if (isProcessEntry()) void boot()
