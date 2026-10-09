import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, test } from "vitest"
import { cacheLayout } from "arknights-assets-extractor"
import { fileAddress, formatAssetKey } from "arknights-assets-catalog"
import { dataWorkspace } from "#workspace.js"
import { animRolesKey } from "#compiler/media/derive/anim-roles.js"
import { roleAnimationNames, type AnimRoles } from "#compiler/media/spine/anim-role.js"

const SEASON_ID = "act2autochess"
const workspace = dataWorkspace()
const rolesPath = join(workspace.derivedDir, fileAddress(animRolesKey(SEASON_ID), { name: null, format: "json" }))
const haveRoles = existsSync(rolesPath)

/** Side file of a spine key: `spine:<path>` is stored as `json:spine-meta/<path>` in the extractor cache. */
function sidePathOf(spineKey: string): string {
  const key = formatAssetKey("json", `spine-meta/${spineKey.slice("spine:".length)}`)
  return join(cacheLayout(workspace.extractCacheDir).files, fileAddress(key, { name: null, format: "json" }))
}

test.skipIf(!haveRoles)("spine animation roles of the season name clips that exist in their side files", () => {
  const roles = JSON.parse(readFileSync(rolesPath, "utf8")) as Record<string, AnimRoles>
  const keys = Object.keys(roles)
  expect(keys.length).toBeGreaterThan(400)
  for (const key of keys) {
    const side = JSON.parse(readFileSync(sidePathOf(key), "utf8")) as { animations: Record<string, unknown> }
    const names = Object.keys(side.animations)
    const row = roles[key] as AnimRoles
    expect(names.length, key).toBeGreaterThan(0)
    expect(typeof row.idle === "string" && names.includes(row.idle), `${key} idle`).toBe(true)
    expect(row.attack && names.includes(row.attack.loop), `${key} attack`).toBe(true)
    for (const name of roleAnimationNames(row)) expect(names, `${key} role anim ${name}`).toContain(name)
  }
})
