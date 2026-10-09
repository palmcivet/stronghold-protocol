/** Replaces every character outside letters, digits, `.`, `_` and `-` with `_`, the rule for upstream names in keys and file names. */
export function safeName(name: string): string {
  const cleaned = String(name).replace(/[^A-Za-z0-9._-]/g, "_")
  return cleaned.length ? cleaned : "_"
}

/** File name without its last extension. */
export function stemOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1)
  const dot = name.lastIndexOf(".")
  return dot > 0 ? name.slice(0, dot) : name
}

/** Last segment of a path. */
export function baseNameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1)
}
