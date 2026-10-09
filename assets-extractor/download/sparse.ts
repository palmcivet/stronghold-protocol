// 稀疏检出的目录集合（cone 模式）：一个目录连同子目录整体检出，仓库根目录的文件总是在。

function parentOf(path: string): string {
  const slash = path.lastIndexOf("/")
  return slash < 0 ? "" : path.slice(0, slash)
}

/** Whether `path` (a file or a directory) lies inside one of the cone directories. */
export function sparseCovers(directories: readonly string[], path: string): boolean {
  return directories.some((dir) => path === dir || path.startsWith(`${dir}/`))
}

function minimal(directories: Iterable<string>): string[] {
  const sorted = [...new Set(directories)].filter((dir) => dir.length > 0).sort()
  const out: string[] = []
  for (const dir of sorted) if (!sparseCovers(out, dir)) out.push(dir)
  return out
}

/** Cone directories that check out the given repository files: their parent directories, without nested duplicates. */
export function sparseDirectories(files: Iterable<string>): string[] {
  return minimal([...files].map(parentOf))
}

/** The cone set after adding directories. Every path covered before is still covered. */
export function mergeSparse(current: readonly string[], added: readonly string[]): string[] {
  return minimal([...current, ...added])
}
