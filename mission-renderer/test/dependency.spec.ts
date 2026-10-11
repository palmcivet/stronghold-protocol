import { describe, expect, test } from "vitest"
import { isTestFile, packageSources } from "#test/source.js"

const PIXI = /^@pixi(?:-spine)?\//
const SKELETON_DIRECTORY = "actor/skeleton/"
/** Pixi exports that would create a renderer, a display object or a GPU texture. */
const DISPLAY_EXPORTS = new Set(["Application", "Renderer", "autoDetectRenderer", "Spine", "Container", "Sprite", "Graphics", "Mesh", "SimpleMesh", "Texture", "BaseTexture", "DisplayObject"])
const IMPORT = /(?:import|export)\s+(type\s+)?(?:([\w*\s{},]+?)\s+from\s+)?["']([^"']+)["']/g

interface ImportUse {
  readonly path: string
  readonly from: string
  readonly names: readonly string[]
  readonly typeOnly: boolean
}

function importsOf(path: string, text: string): readonly ImportUse[] {
  const uses: ImportUse[] = []
  for (const match of text.matchAll(IMPORT)) {
    const clause = match[2] ?? ""
    const braces = /\{([^}]*)\}/.exec(clause)?.[1] ?? ""
    const names = braces
      .split(",")
      .map((part) => part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0] ?? "")
      .filter((name) => name.length > 0)
    uses.push({ path, from: match[3] ?? "", names, typeOnly: match[1] !== undefined })
  }
  return uses
}

describe("dependencies", () => {
  const uses = packageSources()
    .filter((file) => !isTestFile(file.path))
    .flatMap((file) => importsOf(file.path, file.text))
  const pixi = uses.filter((use) => PIXI.test(use.from))

  test("only actor/skeleton/ imports @pixi/* and @pixi-spine/*", () => {
    expect(pixi.filter((use) => !use.path.startsWith(SKELETON_DIRECTORY)).map((use) => `${use.path} ${use.from}`)).toEqual([])
  })

  test("nothing takes a Pixi renderer, display object or texture", () => {
    const found = pixi.flatMap((use) =>
      use.typeOnly ? [] : use.names.filter((name) => DISPLAY_EXPORTS.has(name)).map((name) => `${use.path} ${name} from ${use.from}`),
    )
    expect(found).toEqual([])
  })

  test("reads import clauses", () => {
    const text = ['import { Skeleton, type Bone as B } from "@pixi-spine/runtime-3.8"', 'import type { Texture } from "@pixi/core"', 'import "@pixi/mesh"'].join("\n")
    expect(importsOf("x.ts", text)).toEqual([
      { path: "x.ts", from: "@pixi-spine/runtime-3.8", names: ["Skeleton", "Bone"], typeOnly: false },
      { path: "x.ts", from: "@pixi/core", names: ["Texture"], typeOnly: true },
      { path: "x.ts", from: "@pixi/mesh", names: [], typeOnly: false },
    ])
  })
})
