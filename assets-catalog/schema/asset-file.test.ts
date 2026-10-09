import { describe, expect, test } from "vitest"
import type { AssetKind } from "#key/asset-key.js"
import { checkAssetFiles } from "#schema/asset-file.js"
import { SchemaCheck } from "#schema/issue.js"

const HASH = "c2".repeat(32)

function issues(kind: AssetKind, files: unknown, href = false): readonly string[] {
  const check = new SchemaCheck()
  checkAssetFiles(check, kind, files, "files", { href })
  return check.issues.map((issue) => `${issue.path}: ${issue.message}`)
}

const main = (format: string, extra: object = {}) => ({ role: "main", name: null, format, bytes: 10, hash: HASH, ...extra })
const named = (role: string, name: string, format: string) => ({ role, name, format, bytes: 10, hash: HASH })

describe("files of single-file kinds", () => {
  test("accepted formats", () => {
    expect(issues("image", [main("png")])).toEqual([])
    expect(issues("image", [main("webp")])).toEqual([])
    expect(issues("texture", [main("png"), main("webp")])).toEqual([])
    expect(issues("audio", [main("mp3")])).toEqual([])
    expect(issues("font", [main("woff2"), { ...main("otf"), role: "fallback" }])).toEqual([])
    expect(issues("model", [main("obj")])).toEqual([])
    expect(issues("json", [main("json")])).toEqual([])
  })

  test("rejected files", () => {
    expect(issues("audio", [main("png")])).toEqual(["files[0]: a audio entry does not take a main file in png"])
    expect(issues("image", [])).toEqual(["files: expected at least one file"])
    expect(issues("image", "x")).toEqual(["files: expected an array"])
    expect(issues("image", [{ ...main("png"), role: "fallback" }])).toEqual(["files: expected at least one main file"])
    expect(issues("image", [main("png"), main("png")])).toEqual(["files: formats repeat, so two files would share one address"])
    expect(issues("image", [main("png", { name: "x.png" })])).toEqual(['files[0].name: expected null for a image file'])
    expect(issues("image", [main("png", { bytes: -1 })])).toEqual(["files[0].bytes: expected an integer >= 0"])
    expect(issues("image", [main("png", { bytes: 1.5 })])).toEqual(["files[0].bytes: expected an integer >= 0"])
    expect(issues("image", [main("gif")])).toEqual(['files[0].format: expected one of "png", "webp", "skel", "atlas", "mp3", "woff2", "otf", "ttf", "obj", "json"'])
    expect(issues("image", [main("png", { role: "page" })])).toEqual(["files[0]: a image entry does not take a page file in png"])
  })

  test("hash is lowercase hex SHA-256; empty only with href where href is allowed", () => {
    expect(issues("image", [main("png", { hash: HASH.toUpperCase() })])).toEqual(["files[0].hash: expected a lowercase hex SHA-256"])
    expect(issues("image", [main("png", { hash: "abc" })])).toEqual(["files[0].hash: expected a lowercase hex SHA-256"])
    expect(issues("image", [main("png", { hash: "" })], true)).toEqual(["files[0].hash: expected a lowercase hex SHA-256"])
    expect(issues("image", [main("png", { hash: "", href: "assets/x.png" })], true)).toEqual([])
    expect(issues("image", [main("png", { href: "" })], true)).toEqual(["files[0].href: expected a non-empty string"])
  })
})

describe("files of spine", () => {
  const full = [
    named("skel", "enemy_1007_slime.skel", "skel"),
    named("atlas", "enemy_1007_slime.atlas", "atlas"),
    named("page", "enemy_1007_slime.png", "png"),
    named("meta", "enemy_1007_slime.meta.json", "json"),
  ]

  test("skel, atlas, pages and an optional meta", () => {
    expect(issues("spine", full)).toEqual([])
    expect(issues("spine", full.slice(0, 3))).toEqual([])
    expect(issues("spine", [...full, named("page", "enemy_1007_slime_2.png", "png")])).toEqual([])
  })

  test("missing or repeated roles", () => {
    expect(issues("spine", full.slice(1))).toEqual(["files: expected exactly one skel file"])
    expect(issues("spine", [full[0], full[2]])).toEqual(["files: expected exactly one atlas file"])
    expect(issues("spine", full.slice(0, 2))).toEqual(["files: expected at least one page file"])
    expect(issues("spine", [...full, named("meta", "b.json", "json")])).toEqual(["files: expected at most one meta file"])
    expect(issues("spine", [...full, full[2]])).toEqual(["files: file names repeat"])
  })

  test("names carry the extension of the format", () => {
    expect(issues("spine", [{ ...full[0], name: null }, ...full.slice(1)])).toEqual(["files[0].name: expected a file name of letters, digits, '_', '-' and '.'"])
    expect(issues("spine", [{ ...full[0], name: "a/b.skel" }, ...full.slice(1)])).toEqual(["files[0].name: expected a file name of letters, digits, '_', '-' and '.'"])
    expect(issues("spine", [{ ...full[0], name: "a.atlas" }, ...full.slice(1)])).toEqual(['files[0].name: expected the extension ".skel"'])
    expect(issues("spine", [full[0], full[1], named("page", "a.mp3", "mp3")])).toEqual(["files[2]: a spine entry does not take a page file in mp3"])
    expect(issues("spine", [full[0], full[1], named("main", "a.png", "png")])).toEqual(["files[2]: a spine entry does not take a main file in png"])
  })
})
