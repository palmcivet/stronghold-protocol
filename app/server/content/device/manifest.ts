import { install } from "./battle/index.js"
export { install }

export const id: string = "device"
export const version: string = "1"
export const dependencies: readonly string[] = ["token"]
export const installs: readonly string[] = ["battle"]
