import { isMultiFileKind } from "#address/file.js"
import type { AssetKind } from "#key/asset-key.js"
import { indexPath, fieldPath, SHA256_HEX, type SchemaCheck } from "#schema/issue.js"

/** What a file is for inside its entry. Single-file kinds use `main` and `fallback`; `spine` uses `skel`, `atlas`, `page` and `meta`. */
export const FILE_ROLES = ["main", "skel", "atlas", "page", "meta", "fallback"] as const

export type FileRole = (typeof FILE_ROLES)[number]

export const FILE_FORMATS = ["png", "webp", "skel", "atlas", "mp3", "woff2", "otf", "ttf", "obj", "json"] as const

export type FileFormat = (typeof FILE_FORMATS)[number]

export interface AssetFile {
  readonly role: FileRole
  /** File name with extension for multi-file kinds; null for single-file kinds. */
  readonly name: string | null
  readonly format: FileFormat
  readonly bytes: number
  /** Lowercase hexadecimal SHA-256 of the bytes. */
  readonly hash: string
}

/** Formats each single-file kind accepts. */
export const SINGLE_FILE_FORMATS: Readonly<Record<Exclude<AssetKind, "spine">, readonly FileFormat[]>> = {
  image: ["png", "webp"],
  texture: ["png", "webp"],
  audio: ["mp3"],
  font: ["woff2", "otf", "ttf"],
  model: ["obj"],
  json: ["json"],
}

/** Formats each role of a `spine` entry accepts. */
export const SPINE_ROLE_FORMATS: Readonly<Partial<Record<FileRole, readonly FileFormat[]>>> = {
  skel: ["skel"],
  atlas: ["atlas"],
  page: ["png", "webp"],
  meta: ["json"],
}

const FILE_NAME = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/

export interface AssetFileRules {
  /** An empty `hash` is accepted on a file that carries `href`. */
  readonly href: boolean
}

function formatsFor(kind: AssetKind, role: FileRole): readonly FileFormat[] {
  if (kind === "spine") return SPINE_ROLE_FORMATS[role] ?? []
  return role === "main" || role === "fallback" ? SINGLE_FILE_FORMATS[kind] : []
}

function checkFile(check: SchemaCheck, kind: AssetKind, value: unknown, path: string, rules: AssetFileRules): AssetFile | null {
  const file = check.record(value, path)
  if (!file) return null
  const before = check.issues.length
  const role = check.oneOf(file["role"], fieldPath(path, "role"), FILE_ROLES)
  const format = check.oneOf(file["format"], fieldPath(path, "format"), FILE_FORMATS)
  check.integer(file["bytes"], fieldPath(path, "bytes"), 0)
  const href = rules.href ? file["href"] : undefined
  if (href !== undefined) check.text(href, fieldPath(path, "href"))
  const hash = file["hash"]
  if (typeof hash !== "string" || !(SHA256_HEX.test(hash) || (hash === "" && href !== undefined))) {
    check.fail(fieldPath(path, "hash"), href === undefined ? "expected a lowercase hex SHA-256" : "expected a lowercase hex SHA-256 or an empty string")
  }
  const name = file["name"]
  if (isMultiFileKind(kind)) {
    if (typeof name !== "string" || !FILE_NAME.test(name)) check.fail(fieldPath(path, "name"), "expected a file name of letters, digits, '_', '-' and '.'")
    else if (format && !name.endsWith(`.${format}`)) check.fail(fieldPath(path, "name"), `expected the extension ".${format}"`)
  } else if (name !== null) {
    check.fail(fieldPath(path, "name"), `expected null for a ${kind} file`)
  }
  if (role && format && !formatsFor(kind, role).includes(format)) {
    check.fail(path, `a ${kind} entry does not take a ${role} file in ${format}`)
  }
  return check.issues.length === before ? (file as unknown as AssetFile) : null
}

function count(files: readonly AssetFile[], role: FileRole): number {
  return files.filter((file) => file.role === role).length
}

/** Checks the file list of one entry against the rules of its kind. */
export function checkAssetFiles(check: SchemaCheck, kind: AssetKind, value: unknown, path: string, rules: AssetFileRules): void {
  const list = check.list(value, path)
  if (!list) return
  if (list.length === 0) {
    check.fail(path, "expected at least one file")
    return
  }
  const files = list.map((item, index) => checkFile(check, kind, item, indexPath(path, index), rules))
  if (files.some((file) => file === null)) return
  const valid = files as AssetFile[]
  if (isMultiFileKind(kind)) {
    if (count(valid, "skel") !== 1) check.fail(path, "expected exactly one skel file")
    if (count(valid, "atlas") !== 1) check.fail(path, "expected exactly one atlas file")
    if (count(valid, "page") < 1) check.fail(path, "expected at least one page file")
    if (count(valid, "meta") > 1) check.fail(path, "expected at most one meta file")
    const names = valid.map((file) => file.name)
    if (new Set(names).size !== names.length) check.fail(path, "file names repeat")
    return
  }
  if (count(valid, "main") < 1) check.fail(path, "expected at least one main file")
  const formats = valid.map((file) => file.format)
  if (new Set(formats).size !== formats.length) check.fail(path, "formats repeat, so two files would share one address")
}
