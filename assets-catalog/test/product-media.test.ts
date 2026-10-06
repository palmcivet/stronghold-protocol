import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test } from "vitest"
import { roleAnimationNames, type AnimRoles } from "#compiler/spine/anim-role.js"
import { atlasInfo } from "#compiler/spine/atlas.js"

const catalogRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const repoRoot = join(catalogRoot, "..")
const spineDir = join(catalogRoot, "product", "media", "spine")
const manifestPath = join(repoRoot, "app/product/season/act2autochess/assets.json")
const haveSpine = existsSync(spineDir)
const haveManifest = existsSync(manifestPath)

test.skipIf(!haveSpine)("every atlas on disk has a size, and enemy atlases have pma", () => {
  const atlases: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith(".atlas")) atlases.push(path)
    }
  }
  walk(spineDir)
  expect(atlases.length).toBeGreaterThan(400)
  for (const path of atlases) {
    const info = atlasInfo(readFileSync(path, "utf8"))
    expect(info.hasSize, path).toBe(true)
    if (path.includes(`${join("spine", "enemy")}`)) expect(info.hasPma, path).toBe(true)
    for (const page of info.pages) expect(existsSync(join(dirname(path), page)), `${path} page ${page}`).toBe(true)
  }
})

interface SpineSide {
  readonly anims?: AnimRoles
  readonly animations?: Record<string, unknown>
}

interface SeasonManifest {
  readonly chars: Record<string, { readonly spine?: Record<string, SpineSide> }>
  readonly enemies: Record<string, { readonly spine?: SpineSide }>
  readonly tokens: Record<string, { readonly spine?: SpineSide }>
}

test.skipIf(!haveManifest)("spine animation roles in the season manifest name clips that exist", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as SeasonManifest
  const entries: (readonly [string, SpineSide])[] = []
  for (const [id, row] of Object.entries(manifest.chars)) {
    for (const [side, spine] of Object.entries(row.spine ?? {})) entries.push([`${id}.${side}`, spine])
  }
  for (const [id, row] of Object.entries(manifest.enemies)) if (row.spine) entries.push([id, row.spine])
  for (const [id, row] of Object.entries(manifest.tokens)) if (row.spine) entries.push([id, row.spine])
  expect(entries.length).toBeGreaterThan(400)
  for (const [id, spine] of entries) {
    const names = Object.keys(spine.animations ?? {})
    expect(names.length, id).toBeGreaterThan(0)
    expect(typeof spine.anims?.idle === "string" && names.includes(spine.anims.idle), `${id} idle`).toBe(true)
    expect(spine.anims?.attack && names.includes(spine.anims.attack.loop), `${id} attack`).toBe(true)
    for (const name of roleAnimationNames(spine.anims)) expect(names, `${id} role anim ${name}`).toContain(name)
  }
})
