/** File list of one repository tree, read from the tree objects without file contents. */
export class RepoIndex {
  readonly paths: readonly string[]
  readonly #files: ReadonlySet<string>
  readonly #byName = new Map<(name: string) => string, Map<string, string[]>>()

  constructor(paths: Iterable<string>) {
    this.paths = [...new Set(paths)].sort()
    this.#files = new Set(this.paths)
  }

  has(path: string): boolean {
    return this.#files.has(path)
  }

  /** Files directly inside a directory, as full paths. */
  filesIn(directory: string): string[] {
    const prefix = `${directory}/`
    return this.paths.filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
  }

  /** Names of the subdirectories directly inside a directory. */
  directoriesIn(directory: string): string[] {
    const prefix = `${directory}/`
    const names = new Set<string>()
    for (const path of this.paths) {
      if (!path.startsWith(prefix)) continue
      const rest = path.slice(prefix.length)
      const slash = rest.indexOf("/")
      if (slash > 0) names.add(rest.slice(0, slash))
    }
    return [...names].sort()
  }

  /**
   * Every file whose base name equals `name` after `normalize`, optionally limited to paths accepted by `within`.
   * All candidates are returned; picking one is up to the caller.
   */
  named(name: string, within: (path: string) => boolean = () => true, normalize: (name: string) => string = (base) => base): string[] {
    let map = this.#byName.get(normalize)
    if (!map) {
      map = new Map()
      for (const path of this.paths) {
        const base = normalize(path.slice(path.lastIndexOf("/") + 1))
        const list = map.get(base)
        if (list) list.push(path)
        else map.set(base, [path])
      }
      this.#byName.set(normalize, map)
    }
    return (map.get(name) ?? []).filter(within)
  }
}
