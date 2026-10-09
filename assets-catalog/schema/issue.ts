import { assetKeyIssue, type AssetKey } from "#key/asset-key.js"

/** One problem found by a type guard. `path` points into the checked value, e.g. `assets["image:a"].files[0].hash`. */
export interface SchemaIssue {
  readonly path: string
  readonly message: string
}

export type JsonRecord = Readonly<Record<string, unknown>>

/** Lowercase hexadecimal SHA-256. */
export const SHA256_HEX = /^[0-9a-f]{64}$/

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

export function fieldPath(path: string, name: string): string {
  if (IDENTIFIER.test(name)) return path ? `${path}.${name}` : name
  return `${path}[${JSON.stringify(name)}]`
}

export function indexPath(path: string, index: number): string {
  return `${path}[${index}]`
}

export function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

/** Collects issues while reading an unknown JSON value. Each reader returns null and records an issue on mismatch. */
export class SchemaCheck {
  readonly issues: SchemaIssue[] = []

  fail(path: string, message: string): void {
    this.issues.push({ path: path || "$", message })
  }

  record(value: unknown, path: string): JsonRecord | null {
    if (isRecord(value)) return value
    this.fail(path, "expected an object")
    return null
  }

  list(value: unknown, path: string): readonly unknown[] | null {
    if (Array.isArray(value)) return value
    this.fail(path, "expected an array")
    return null
  }

  text(value: unknown, path: string): string | null {
    if (typeof value === "string" && value.length > 0) return value
    this.fail(path, "expected a non-empty string")
    return null
  }

  string(value: unknown, path: string): string | null {
    if (typeof value === "string") return value
    this.fail(path, "expected a string")
    return null
  }

  boolean(value: unknown, path: string): boolean | null {
    if (typeof value === "boolean") return value
    this.fail(path, "expected a boolean")
    return null
  }

  number(value: unknown, path: string, min = Number.NEGATIVE_INFINITY): number | null {
    if (typeof value === "number" && Number.isFinite(value) && value >= min) return value
    this.fail(path, min === Number.NEGATIVE_INFINITY ? "expected a finite number" : `expected a finite number >= ${min}`)
    return null
  }

  integer(value: unknown, path: string, min: number): number | null {
    if (typeof value === "number" && Number.isInteger(value) && value >= min) return value
    this.fail(path, `expected an integer >= ${min}`)
    return null
  }

  oneOf<T extends string | number>(value: unknown, path: string, options: readonly T[]): T | null {
    const hit = options.find((option) => option === value)
    if (hit !== undefined) return hit
    this.fail(path, `expected one of ${options.map((option) => JSON.stringify(option)).join(", ")}`)
    return null
  }

  key(value: unknown, path: string): AssetKey | null {
    const issue = assetKeyIssue(value)
    if (issue === null) return value as AssetKey
    this.fail(path, `invalid asset key: ${issue}`)
    return null
  }

  keys(value: unknown, path: string): readonly AssetKey[] | null {
    const list = this.list(value, path)
    if (!list) return null
    const keys: AssetKey[] = []
    list.forEach((item, index) => {
      const key = this.key(item, indexPath(path, index))
      if (key) keys.push(key)
    })
    return keys
  }
}
