// 用 @pixi-spine/runtime-3.8 读 Spine 3.8 二进制骨架，只要动画名、时长、OnAttack 时间和包围盒。
// 附件不加载贴图；如果给了 atlas 区域名，对不上的路径记进 missingRegions。

import { createRequire } from "node:module"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { catalogRootFrom } from "#compiler/repo-root.js"

const catalogRoot = catalogRootFrom(fileURLToPath(import.meta.url))
const require = createRequire(join(catalogRoot, "package.json"))

interface SpineEvent {
  readonly data?: { readonly name?: unknown }
  readonly time?: unknown
}

interface SpineTimeline {
  readonly events?: readonly SpineEvent[]
}

interface SpineAnimation {
  readonly name: string
  readonly duration: number
  readonly timelines: readonly SpineTimeline[]
}

interface SpineSkeletonData {
  readonly version?: unknown
  readonly animations: readonly SpineAnimation[]
  readonly events: readonly { readonly name: string }[]
  readonly width: number
  readonly height: number
  readonly x: number
  readonly y: number
}

interface AttachmentLoader {
  newRegionAttachment(skin: unknown, name: string, path: string): unknown
  newMeshAttachment(skin: unknown, name: string, path: string): unknown
  newBoundingBoxAttachment(skin: unknown, name: string): unknown
  newPathAttachment(skin: unknown, name: string): unknown
  newPointAttachment(skin: unknown, name: string): unknown
  newClippingAttachment(skin: unknown, name: string): unknown
}

interface SpineRuntime {
  readonly RegionAttachment: new (name: string) => unknown
  readonly MeshAttachment: new (name: string) => unknown
  readonly BoundingBoxAttachment: new (name: string) => unknown
  readonly PathAttachment: new (name: string) => unknown
  readonly PointAttachment: new (name: string) => unknown
  readonly ClippingAttachment: new (name: string) => unknown
  readonly SkeletonBinary: new (loader: AttachmentLoader) => {
    readSkeletonData(bytes: Uint8Array): SpineSkeletonData
  }
}

let runtime: SpineRuntime | null = null

function loadRuntime(): SpineRuntime {
  if (runtime) return runtime
  runtime = require("@pixi-spine/runtime-3.8") as SpineRuntime
  return runtime
}

export function skelParserAvailable(): boolean {
  try {
    loadRuntime()
    return true
  } catch {
    return false
  }
}

function makeLoader(spine: SpineRuntime, regions: ReadonlySet<string> | undefined, missing: Set<string>): AttachmentLoader {
  const check = (path: string): void => {
    if (regions && !regions.has(path)) missing.add(path)
  }
  return {
    newRegionAttachment(_skin, name, path) {
      check(path)
      return new spine.RegionAttachment(name)
    },
    newMeshAttachment(_skin, name, path) {
      check(path)
      return new spine.MeshAttachment(name)
    },
    newBoundingBoxAttachment(_skin, name) {
      return new spine.BoundingBoxAttachment(name)
    },
    newPathAttachment(_skin, name) {
      return new spine.PathAttachment(name)
    },
    newPointAttachment(_skin, name) {
      return new spine.PointAttachment(name)
    },
    newClippingAttachment(_skin, name) {
      return new spine.ClippingAttachment(name)
    },
  }
}

const round3 = (value: number): number => Math.round(Number(value) * 1000) / 1000

export interface SpineBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface SkelInfo {
  readonly version: string
  readonly animations: readonly string[]
  readonly durations: Readonly<Record<string, number>>
  readonly events: readonly string[]
  readonly hits: Readonly<Record<string, readonly number[]>>
  readonly bounds: SpineBounds | null
  readonly missingRegions: readonly string[]
}

export function parseSkel(bytes: Uint8Array, atlasRegions?: ReadonlySet<string>): SkelInfo {
  const spine = loadRuntime()
  const missing = new Set<string>()
  const binary = new spine.SkeletonBinary(makeLoader(spine, atlasRegions, missing))
  const data = binary.readSkeletonData(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
  const animations = data.animations.map((animation) => animation.name)
  const durations: Record<string, number> = {}
  const hits: Record<string, number[]> = {}
  for (const animation of data.animations) {
    durations[animation.name] = round3(animation.duration)
    for (const timeline of animation.timelines) {
      if (!timeline || !Array.isArray(timeline.events)) continue
      for (const event of timeline.events) {
        const name = event?.data?.name
        if (typeof name === "string" && /^onattack$/i.test(name)) {
          const list = hits[animation.name] ?? []
          list.push(round3(Number(event.time)))
          hits[animation.name] = list
        }
      }
    }
    const attackHits = hits[animation.name]
    if (attackHits) attackHits.sort((a, b) => a - b)
  }
  const width = Number(data.width)
  const height = Number(data.height)
  const bounds =
    Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
      ? { x: round3(data.x), y: round3(data.y), width: round3(width), height: round3(height) }
      : null
  return {
    version: String(data.version ?? ""),
    animations,
    durations,
    events: data.events.map((event) => event.name),
    hits,
    bounds,
    missingRegions: [...missing].sort(),
  }
}
