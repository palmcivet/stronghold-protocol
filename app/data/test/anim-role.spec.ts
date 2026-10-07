import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { roleAnimationNames } from "arknights-assets-catalog/compile"
import { expect, test } from "vitest"
import { dataWorkspace } from "#compiler/workspace.js"

const manifestPath = join(dataWorkspace().seasonDir("act2autochess"), "assets.json")
const haveManifest = existsSync(manifestPath)

interface SpineSide {
  readonly anims?: import("arknights-assets-catalog/compile").AnimRoles
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
