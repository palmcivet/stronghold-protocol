/** Warnings collected while a season packet is compiled. Duplicate messages are kept once. */
export class BuildNotes {
  readonly messages: string[]
  quiet: boolean
  private readonly seen: Set<string>

  constructor() {
    this.messages = []
    this.quiet = false
    this.seen = new Set()
  }

  warn(message: string): void {
    if (this.seen.has(message)) return
    this.seen.add(message)
    this.messages.push(message)
  }

  log(...parts: readonly unknown[]): void {
    if (!this.quiet) console.log(...parts)
  }
}
