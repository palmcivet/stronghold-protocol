/** First directory at or above `start` that holds `marker`. `start` is a path or a file URL; a file starts at its directory. */
export function findUp(start: string | URL, marker: string): string;

/** The pnpm workspace root: the first directory at or above `start` holding pnpm-workspace.yaml. */
export function findWorkspaceRoot(start: string | URL): string;

export interface WorkspacePackage {
  readonly name: string;
  /** Absolute directory of the package. */
  readonly dir: string;
}

/** Reads `pnpm ls -r --depth -1 --json` output: the named workspace packages except the root, sorted by directory. */
export function parsePnpmList(
  json: string,
  root: string,
): readonly WorkspacePackage[];

/** The packages of the workspace at `root` as pnpm lists them, the root package left out. Needs pnpm on the PATH. */
export function listWorkspacePackages(
  root: string,
): readonly WorkspacePackage[];
