import type { AssetKey } from "arknights-assets-catalog"
import type { RepoStats } from "#download/repo-cache.js"

export interface SourceAttempt {
  readonly source: string
  readonly reason: string
}

/** Human-readable summary of one extraction. Nothing downstream reads it. */
export interface ExtractReport {
  readonly schemaVersion: 1
  readonly needs: {
    readonly total: number
    readonly resolved: number
    readonly missingRequired: readonly AssetKey[]
    readonly missingOptional: readonly AssetKey[]
    /** Missing optional keys whose need says why no upstream source publishes them. */
    readonly absentUpstream: readonly { readonly key: AssetKey; readonly reason: string }[]
    /** Missing optional keys without such a reason: a rule or source gap to look into. */
    readonly unexplained: readonly AssetKey[]
  }
  /** Keys provided by a source after earlier sources missed. */
  readonly fallbacks: readonly { readonly key: AssetKey; readonly source: string; readonly tried: readonly SourceAttempt[] }[]
  /** Lookups by name that found several upstream files; the key counts as a miss for that source. */
  readonly ambiguous: readonly { readonly key: AssetKey; readonly source: string; readonly candidates: readonly string[] }[]
  /** Hits whose files failed validation, conversion or checkout. */
  readonly problems: readonly { readonly key: AssetKey; readonly source: string; readonly reason: string }[]
  readonly repos: readonly RepoStats[]
  readonly reused: number
  readonly written: number
  readonly elapsedMs: number
}

export function serializeReport(report: ExtractReport): string {
  return `${JSON.stringify(report, null, 2)}\n`
}
