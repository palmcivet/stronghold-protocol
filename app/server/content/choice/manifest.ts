import { install, registerMeta } from "./battle/index.js"
export { install, registerMeta }

export const id: string = "choice"
export const version: string = "1"
export const dependencies: readonly string[] = ["band"]
export const installs: readonly string[] = ["battle","match"]
