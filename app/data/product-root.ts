import { fileURLToPath } from "node:url"
import { join } from "node:path"
import { appRootFrom } from "#compiler/repo-root.js"

/** Absolute path to generated data owned by this package. */
export const DATA_PRODUCT_ROOT: string = join(appRootFrom(fileURLToPath(import.meta.url)), "product")
