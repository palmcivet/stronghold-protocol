import { spawn } from "node:child_process"
import { GitError, type GitProcess } from "#port/git-process.js"

/** `GitProcess` backed by the `git` executable on PATH. Prompts are disabled so a missing credential fails fast. */
export const nodeGitProcess: GitProcess = {
  run(args, options) {
    return new Promise((resolve, reject) => {
      const child = spawn("git", [...args], {
        cwd: options.cwd,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...options.env },
        stdio: ["ignore", "pipe", "pipe"],
      })
      const out: Buffer[] = []
      const err: Buffer[] = []
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        child.kill("SIGTERM")
      }, options.timeoutMs)
      child.stdout.on("data", (chunk: Buffer) => out.push(chunk))
      child.stderr.on("data", (chunk: Buffer) => err.push(chunk))
      child.on("error", (cause) => {
        clearTimeout(timer)
        reject(new GitError(args, cause.message))
      })
      child.on("close", (code) => {
        clearTimeout(timer)
        const stderr = Buffer.concat(err).toString("utf8")
        if (timedOut) reject(new GitError(args, `timed out after ${options.timeoutMs} ms`, stderr))
        else if (code !== 0) reject(new GitError(args, `exit code ${String(code)}`, stderr))
        else resolve(Buffer.concat(out).toString("utf8"))
      })
    })
  },
}
