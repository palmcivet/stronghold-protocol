/** 一条基础资源的种类：字体、音频、图片、骨架或模型。 */
export const CATALOG_KINDS = ["font", "audio", "image", "spine", "model"] as const

export type CatalogKind = (typeof CATALOG_KINDS)[number]

export const CATALOG_SOURCES = ["upstream", "local"] as const

export type CatalogSource = (typeof CATALOG_SOURCES)[number]

/** 一条可加载、可缓存、可释放的目录项。 */
export interface CatalogEntry {
  readonly id: string
  readonly kind: CatalogKind
  readonly address: string
  readonly bytes: number
  readonly hash: string
  readonly dependsOn: readonly string[]
  readonly fallbackId: string | null
  readonly preloadGroup: string | null
  readonly source: CatalogSource
}
