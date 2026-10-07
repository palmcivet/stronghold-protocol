import { install } from "./battle/index.js"
import { registerMeta } from "./match/index.js"
export { install, registerMeta }

export const id: string = "item"
export const version: string = "1"
export const dependencies: readonly string[] = ["garrison"]
export const installs: readonly string[] = ["battle","match"]
