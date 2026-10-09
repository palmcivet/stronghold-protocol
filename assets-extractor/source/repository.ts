import { join } from "node:path"
import type { AssetKey, FileRole } from "arknights-assets-catalog"
import { repoLabel, type RepoRef, type RepoWorkspace } from "#download/repo-cache.js"
import type { SourceContext, SourceFile, SourceHit } from "#source/asset-source.js"

/** Opens the clone of a git source; throws when offline without an earlier clone. */
export async function openRepository(context: SourceContext, ref: RepoRef): Promise<RepoWorkspace> {
  const workspace = await context.repos.open(ref)
  if (!workspace) throw new Error(`${repoLabel(ref)} was never cloned and --offline forbids cloning`)
  return workspace
}

/** The only candidate, or null. Several candidates are reported as ambiguous and never narrowed down. */
export function onlyCandidate(key: AssetKey, candidates: readonly string[], context: SourceContext): string | null {
  if (candidates.length === 1) return candidates[0] ?? null
  if (candidates.length > 1) context.ambiguous(key, [...candidates].sort())
  return null
}

export interface RepoFile {
  readonly role: FileRole
  readonly name: string | null
  /** Path inside the repository. */
  readonly path: string
  readonly convert?: "atlas" | "woff2"
}

export function repoHit(workspace: RepoWorkspace, path: string, files: readonly RepoFile[], extra: Pick<SourceHit, "premultipliedAlpha"> = {}): SourceHit {
  return {
    path,
    revision: workspace.revision,
    files: files.map((file): SourceFile => ({
      role: file.role,
      name: file.name,
      location: join(workspace.root, file.path),
      ...(file.convert === undefined ? {} : { convert: file.convert }),
    })),
    dependsOn: [],
    repo: workspace,
    ...extra,
  }
}

/** A single-file hit when the repository has `path`. */
export function fileHit(workspace: RepoWorkspace, path: string | null): SourceHit | null {
  if (path === null || !workspace.index.has(path)) return null
  return repoHit(workspace, path, [{ role: "main", name: null, path }])
}
