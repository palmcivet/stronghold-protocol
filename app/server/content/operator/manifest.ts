import { install } from "./battle/index.js"
export { install }

export const id: string = "operator"
export const version: string = "1"
export const dependencies: readonly string[] = ["support"]
export const installs: readonly string[] = ["battle"]
