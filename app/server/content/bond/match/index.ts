import { registerSupportMeta } from "#server/content/support/meta.js"
import { registerMeta as registerCore } from "../battle/core.js"
import { registerMeta as registerAddon } from "./addon.js"
import { registerHammerMeta } from "./hammer.js"

export function registerMeta(registry: any): void {
  registerSupportMeta(registry)
  registerCore(registry)
  registerAddon(registry)
  registerHammerMeta(registry)
}
