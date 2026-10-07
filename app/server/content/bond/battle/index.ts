import { install as installCore } from "./core.js"
import { install as installAddon } from "./addon.js"

export function install(ctx: any): void {
  installCore(ctx)
  installAddon(ctx)
}
