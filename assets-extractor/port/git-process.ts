export interface GitRunOptions {
  /** Working directory of the git process. */
  readonly cwd?: string
  /** The process is killed after this many milliseconds. */
  readonly timeoutMs: number
  /** Extra environment variables, e.g. proxy settings. */
  readonly env?: Readonly<Record<string, string>>
}

/** Runs the `git` command line and returns its standard output. */
export interface GitProcess {
  run(args: readonly string[], options: GitRunOptions): Promise<string>
}

export class GitError extends Error {
  readonly args: readonly string[]
  readonly stderr: string

  constructor(args: readonly string[], message: string, stderr = "") {
    super(`git ${args.join(" ")}: ${message}${stderr ? `\n${stderr.trim()}` : ""}`)
    this.name = "GitError"
    this.args = args
    this.stderr = stderr
  }
}
