import { install } from "./battle/index.js"
export { install }

export const id: string = "boss"
export const version: string = "1"
export const dependencies: readonly string[] = ["enemy"]
export const installs: readonly string[] = ["battle"]
