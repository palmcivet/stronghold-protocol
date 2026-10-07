import type { MissionModule, Registration } from "arknights-mission-core"
import type { EffectRegistry } from "#server/content/effect.js"
import { CONTENT_INTERFACE_VERSION, CONTENT_VERSION } from "#server/content/version.js"

export interface ContentManifest {
  readonly id: string
  readonly version: string
  readonly interfaceVersion: number
  readonly dependencies: readonly string[]
  readonly entries: readonly { readonly id: string }[]
  readonly installs?: readonly string[]
}

export interface ContentPackage {
  readonly manifest: ContentManifest
  install?(ctx: Registration): void
  registerMeta?(registry: EffectRegistry): void
}

export interface ContentManifestModule {
  readonly id: string
  readonly version: string
  readonly interfaceVersion?: number
  readonly dependencies: readonly string[]
  readonly entries?: readonly { readonly id: string }[]
  readonly installs: readonly string[]
  install?(ctx: Registration): void
  registerMeta?(registry: any): void
  readonly contentPackage?: ContentPackage
}

interface Entry {
  readonly id: string
  readonly load: () => Promise<ContentManifestModule>
}

const ENTRIES: readonly Entry[] = [
  { id: "support", load: () => import("#server/content/support/manifest.js") },
  { id: "operator", load: () => import("#server/content/operator/manifest.js") },
  { id: "token", load: () => import("#server/content/token/manifest.js") },
  { id: "device", load: () => import("#server/content/device/manifest.js") },
  { id: "enemy", load: () => import("#server/content/enemy/manifest.js") },
  { id: "boss", load: () => import("#server/content/boss/manifest.js") },
  { id: "item", load: () => import("#server/content/item/manifest.js") },
  { id: "bond", load: () => import("#server/content/bond/manifest.js") },
  { id: "garrison", load: () => import("#server/content/garrison/manifest.js") },
  { id: "band", load: () => import("#server/content/band/manifest.js") },
  { id: "choice", load: () => import("#server/content/choice/manifest.js") },
]

const loaded = new Map<string, ContentManifestModule>()
const dropped: string[] = []

await Promise.all(ENTRIES.map(async (entry) => {
  try {
    const module = await entry.load()
    if (!module.id) throw new Error("manifest has no id")
    loaded.set(module.id, module)
  } catch (cause) {
    dropped.push(entry.id)
    const message = cause instanceof Error ? cause.message : String(cause)
    console.error(`[content] dropped ${entry.id}: ${message}`)
  }
}))

function ordered(): ContentManifestModule[] {
  const out: ContentManifestModule[] = []
  const seen = new Set<string>()
  const visit = (id: string): void => {
    if (seen.has(id) || !loaded.has(id)) return
    seen.add(id)
    const module = loaded.get(id)
    if (!module) return
    for (const dependency of module.dependencies) visit(dependency)
    out.push(module)
  }
  for (const entry of ENTRIES) visit(entry.id)
  return out
}

const modules = ordered()

export function droppedContent(): readonly string[] {
  return dropped
}

export function loadedContentIds(): readonly string[] {
  return modules.map((module) => module.id)
}

function asPackage(module: ContentManifestModule): ContentPackage {
  return module.contentPackage ?? {
    manifest: {
      id: module.id,
      version: module.version || CONTENT_VERSION,
      interfaceVersion: module.interfaceVersion ?? CONTENT_INTERFACE_VERSION,
      dependencies: module.dependencies,
      entries: module.entries ?? [{ id: module.id }],
      installs: module.installs,
    },
    ...(module.install ? { install: (ctx: Registration) => module.install?.(ctx) } : {}),
    ...(module.registerMeta ? { registerMeta: (registry: EffectRegistry) => module.registerMeta?.(registry) } : {}),
  }
}

export function arrangeContent(packages: readonly ContentPackage[]): ContentPackage[] {
  const ids = new Set(packages.map((entry) => entry.manifest.id))
  const kept = packages.filter((entry) => entry.manifest.dependencies.every((id) => ids.has(id)))
  const out: ContentPackage[] = []
  const seen = new Set<string>()
  const visit = (id: string): void => {
    if (seen.has(id)) return
    const entry = kept.find((item) => item.manifest.id === id)
    if (!entry) return
    seen.add(id)
    for (const dependency of entry.manifest.dependencies) visit(dependency)
    out.push(entry)
  }
  for (const entry of kept) visit(entry.manifest.id)
  return out
}

export async function loadListed(entries: readonly { readonly id: string; readonly load: () => Promise<ContentManifestModule> }[]): Promise<ContentPackage[]> {
  const packages: ContentPackage[] = []
  for (const entry of entries) {
    try {
      const module = await entry.load()
      const packaged = module.contentPackage ?? asPackage(module)
      if (packaged.manifest.interfaceVersion !== CONTENT_INTERFACE_VERSION) continue
      packages.push(packaged)
    } catch (cause) {
      console.error(`[content] dropped ${entry.id}:`, cause)
    }
  }
  return arrangeContent(packages)
}

export function contentPackages(): readonly ContentPackage[] {
  return arrangeContent(modules.map((module) => asPackage(module)))
}

export function battleModules(): readonly MissionModule[] {
  return contentPackages().filter((entry) => entry.manifest.installs?.includes("battle") === true && entry.install).map((entry) => ({
    id: `content:${entry.manifest.id}`,
    dependsOn: entry.manifest.dependencies.filter((id) => {
      const dependency = loaded.get(id)
      return dependency?.installs.includes("battle") === true
    }).map((id) => `content:${id}`),
    install(ctx: Registration): void {
      try {
        entry.install?.(ctx)
      } catch (cause) {
        console.error(`[content] ${entry.manifest.id}.install failed:`, cause)
      }
    },
  }))
}

export function contentModules(): readonly MissionModule[] {
  return battleModules()
}

export function registerPackages(registry: EffectRegistry, packages: readonly ContentPackage[]): void {
  for (const entry of arrangeContent(packages)) {
    if (!entry.registerMeta) continue
    try {
      entry.registerMeta(registry)
    } catch (cause) {
      console.error(`[content] ${entry.manifest.id}.registerMeta failed:`, cause)
    }
  }
}

export function registerAllMeta(registry: any): void {
  registerPackages(registry, contentPackages())
}
