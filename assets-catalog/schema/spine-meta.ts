import { fieldPath, indexPath, SchemaCheck, type SchemaIssue } from "#schema/issue.js"

/** Facts read from a Spine skeleton. Stored as the `meta` file of a `spine` entry and as `json:spine-meta/<spine path>`. */
export interface SpineMeta {
  readonly spineVersion: string
  readonly premultipliedAlpha: boolean
  readonly bounds: SpineBounds | null
  readonly animations: Readonly<Record<string, SpineAnimation>>
  readonly pages: readonly string[]
  readonly missingRegions: readonly string[]
}

export interface SpineBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface SpineAnimation {
  /** Seconds. */
  readonly duration: number
  readonly events: readonly { readonly name: string; readonly time: number }[]
}

function checkTexts(check: SchemaCheck, value: unknown, path: string): void {
  check.list(value, path)?.forEach((item, index) => check.text(item, indexPath(path, index)))
}

export function spineMetaIssues(value: unknown): readonly SchemaIssue[] {
  const check = new SchemaCheck()
  const root = check.record(value, "")
  if (!root) return check.issues
  check.text(root["spineVersion"], "spineVersion")
  check.boolean(root["premultipliedAlpha"], "premultipliedAlpha")
  if (root["bounds"] !== null) {
    const bounds = check.record(root["bounds"], "bounds")
    if (bounds) {
      check.number(bounds["x"], "bounds.x")
      check.number(bounds["y"], "bounds.y")
      check.number(bounds["width"], "bounds.width", 0)
      check.number(bounds["height"], "bounds.height", 0)
    }
  }
  const animations = check.record(root["animations"], "animations")
  for (const [name, item] of Object.entries(animations ?? {})) {
    const path = fieldPath("animations", name)
    const animation = check.record(item, path)
    if (!animation) continue
    check.number(animation["duration"], fieldPath(path, "duration"), 0)
    check.list(animation["events"], fieldPath(path, "events"))?.forEach((event, index) => {
      const eventPath = indexPath(fieldPath(path, "events"), index)
      const record = check.record(event, eventPath)
      if (!record) return
      check.text(record["name"], fieldPath(eventPath, "name"))
      check.number(record["time"], fieldPath(eventPath, "time"), 0)
    })
  }
  checkTexts(check, root["pages"], "pages")
  checkTexts(check, root["missingRegions"], "missingRegions")
  return check.issues
}

export function isSpineMeta(value: unknown): value is SpineMeta {
  return spineMetaIssues(value).length === 0
}
