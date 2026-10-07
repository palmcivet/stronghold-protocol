import { install } from "./battle/index.js"
import { registerMeta } from "./match/index.js"
export { install, registerMeta }

export const id: string = "band"
export const version: string = "1"
export const dependencies: readonly string[] = ["garrison","item","token"]
export const installs: readonly string[] = ["battle","match"]
