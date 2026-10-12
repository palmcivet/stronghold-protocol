---
title: 核心接口
description: 按使用场景分组的核心接口：键、校验清单、解析与缓存。每个接口给出签名、关键字段和一段用法。
---

# 核心接口

这一页按使用场景列出核心接口。所有接口都从包入口 `arknights-assets-catalog` 导入；完整的行为与规则在各指南页。

## 键

### `AssetKey`、`parseAssetKey`、`isAssetKey`

```ts
import * as catalog from "arknights-assets-catalog"

export type AssetKind =
  | "image"
  | "texture"
  | "spine"
  | "audio"
  | "font"
  | "model"
  | "json"
export type AssetKey = `${AssetKind}:${string}`

export declare function isAssetKey(value: unknown): value is AssetKey
export declare function parseAssetKey(value: string): ParsedAssetKey

export interface ParsedAssetKey {
  readonly key: AssetKey
  readonly kind: AssetKind
  readonly path: string
  readonly segments: readonly string[]
  readonly namespace: string
}

// ---cut-after---
export const kind = "" as catalog.AssetKind satisfies AssetKind
export const key = "" as catalog.AssetKey satisfies AssetKey
catalog.isAssetKey satisfies typeof isAssetKey
catalog.parseAssetKey satisfies typeof parseAssetKey
export const parsed = {} as catalog.ParsedAssetKey satisfies ParsedAssetKey
```

- `isAssetKey`：检查外部输入，不抛错
- `parseAssetKey`：拆出种类、路径、段与命名空间；不合法时抛 `AssetKeyError`
- 相关：`formatAssetKey(kind, path)` 拼出并校验，`assetKeyIssue(value)` 给出不合法的原因

```ts
import { isAssetKey, parseAssetKey } from "arknights-assets-catalog"

const input: unknown = "spine:enemy/slime"
if (isAssetKey(input)) {
  console.log(parseAssetKey(input).path) // "enemy/slime"
}
```

详见 [资源键](./02-key.md)。

## 校验清单

### `isPackManifest`、`packManifestIssues`

```ts
import * as catalog from "arknights-assets-catalog"
import type { PackManifest } from "arknights-assets-catalog"

export declare function isPackManifest(value: unknown): value is PackManifest
export declare function packManifestIssues(
  value: unknown,
): readonly SchemaIssue[]

export interface SchemaIssue {
  readonly path: string
  readonly message: string
}

// ---cut-after---
catalog.isPackManifest satisfies typeof isPackManifest
catalog.packManifestIssues satisfies typeof packManifestIssues
export const issue = {} as catalog.SchemaIssue satisfies SchemaIssue
```

- 检查一份未知 JSON 是不是包清单，`packManifestIssues` 一次给出全部问题
- 其他三种文件用同样的一对函数：`isNeedsList`/`needsListIssues`、`isRawCatalog`/`rawCatalogIssues`、`isSpineMeta`/`spineMetaIssues`

### `PackManifest`

```ts
import * as catalog from "arknights-assets-catalog"
import type {
  AssetColorSpace,
  AssetKey,
  AssetKind,
  PackFile,
  PackRefs,
  PackRequirement,
} from "arknights-assets-catalog"

export interface PackManifest {
  readonly schemaVersion: 1
  readonly pack: PackInfo
  readonly requires: readonly PackRequirement[]
  readonly fileRoot: string
  readonly assets: Readonly<Record<AssetKey, PackAsset>>
  readonly refs?: PackRefs
}

export interface PackInfo {
  readonly type: string
  readonly id: string
  readonly version: string
  readonly contentHash: string
}

export interface PackAsset {
  readonly kind: AssetKind
  readonly files: readonly PackFile[]
  readonly dependsOn: readonly AssetKey[]
  readonly fallbackId: AssetKey | null
  readonly preloadGroup: string | null
  readonly colorSpace?: AssetColorSpace
}

// ---cut-after---
export const manifest = {} as catalog.PackManifest satisfies PackManifest
export const info = {} as catalog.PackInfo satisfies PackInfo
export const asset = {} as catalog.PackAsset satisfies PackAsset
```

- `pack.type`、`requires[].type`：任意非空字符串，由写清单的一方命名
- `fileRoot`：以 `/` 结尾，相对清单地址或绝对地址
- `PackFile` 是文件条目 `AssetFile` 加可选的 `href`
- `PackRefs` 是任意嵌套的对象与数组，叶子是 `AssetKey`

```ts
import { packManifestIssues, type PackManifest } from "arknights-assets-catalog"

const manifest: PackManifest = {
  schemaVersion: 1,
  pack: {
    type: "theme",
    id: "night",
    version: "2",
    contentHash: "cd".repeat(32),
  },
  requires: [{ type: "base", id: "demo", version: "1.0.0" }],
  fileRoot: "./files/",
  assets: {},
}
console.log(packManifestIssues(manifest)) // []
```

详见 [清单](./03-manifest.md)。

## 解析

### `createAssetResolver`

```ts
import * as catalog from "arknights-assets-catalog"
import type { AssetResolver, PackManifest } from "arknights-assets-catalog"

export declare function createAssetResolver(
  layers: readonly AssetLayer[],
): AssetResolver

export interface AssetLayer {
  readonly manifest: PackManifest
  readonly url: string | URL
}

// ---cut-after---
catalog.createAssetResolver satisfies typeof createAssetResolver
export const layer = {} as catalog.AssetLayer satisfies AssetLayer
```

- `layers` 从低到高排列，高层的条目整条替换低层
- 每层先过包清单守卫；`url` 必须是绝对地址。违反时抛 `AssetResolveError`

### `AssetResolver`

```ts
import * as catalog from "arknights-assets-catalog"
import type {
  AssetKey,
  AssetLayer,
  PackRefs,
  ResolvedAsset,
} from "arknights-assets-catalog"

export interface AssetResolver {
  readonly layers: readonly AssetLayer[]
  readonly refs: PackRefs
  has(key: AssetKey): boolean
  keys(): readonly AssetKey[]
  entry(key: AssetKey): ResolvedAsset | null
  chain(key: AssetKey): readonly ResolvedAsset[]
  resolve(key: AssetKey, options?: ResolveOptions): ResolvedAsset | null
  dependencies(key: AssetKey): readonly ResolvedAsset[]
  ref(path: string | readonly string[]): AssetKey | null
}

export interface ResolveOptions {
  readonly failed?: ReadonlySet<AssetKey>
}

// ---cut-after---
export const resolver = {} as catalog.AssetResolver satisfies AssetResolver
export const options = {} as catalog.ResolveOptions satisfies ResolveOptions
```

- `resolve` 取回退链上第一个不在 `failed` 里的条目
- `chain` 遇到环或种类变化时抛 `AssetResolveError`
- `ref` 按路径取合并后 `refs` 里的键

### `ResolvedAsset`

```ts
import * as catalog from "arknights-assets-catalog"
import type {
  AssetKey,
  AssetKind,
  PackAsset,
  PackFile,
  PackInfo,
} from "arknights-assets-catalog"

export interface ResolvedAsset {
  readonly key: AssetKey
  readonly kind: AssetKind
  readonly asset: PackAsset
  readonly pack: PackInfo
  readonly files: readonly ResolvedFile[]
}

export interface ResolvedFile extends PackFile {
  readonly url: string
}

// ---cut-after---
export const resolved = {} as catalog.ResolvedAsset satisfies ResolvedAsset
export const file = {} as catalog.ResolvedFile satisfies ResolvedFile
```

- `key` 是实际命中的键，回退后可能不是请求的键
- `files[].url` 是绝对地址，带版本参数

```ts
import { createAssetResolver, isPackManifest } from "arknights-assets-catalog"

const url = "https://cdn.example/packs/base/manifest.json"
const manifest: unknown = await (await fetch(url)).json()
if (!isPackManifest(manifest)) {
  throw new Error(`not a pack manifest: ${url}`)
}

const resolver = createAssetResolver([{ manifest, url }])
const knight = resolver.resolve("image:avatar/knight", {
  failed: new Set(["image:avatar/knight"]),
})
console.log(knight?.key) // "image:avatar/default"
```

详见 [解析](./05-resolver.md)。

## 缓存

### `createSpineCache`、`spineSource`

```ts
import * as catalog from "arknights-assets-catalog"
import type {
  AssetKey,
  ResolvedAsset,
  SpineAcquireOptions,
  SpineLoadContext,
} from "arknights-assets-catalog"

export declare function createSpineCache(options: SpineCacheOptions): SpineCache
export declare function spineSource(asset: ResolvedAsset): SpineSource | null

export interface SpineSource {
  readonly key: AssetKey
  readonly skel: string
  readonly atlas: string
  readonly pages: readonly string[]
  readonly meta: string | null
}

export interface SpineCacheOptions {
  readonly load: (
    source: SpineSource,
    context?: SpineLoadContext,
  ) => unknown | Promise<unknown>
  readonly unload?: (
    source: SpineSource,
    value: unknown,
    keep: ReadonlySet<string>,
  ) => void | Promise<void>
  readonly max?: number
  readonly idleBytes?: number
  readonly idleGrace?: number
  readonly quietBytes?: number
  readonly quietDelay?: number
  readonly evictDelay?: number
  readonly timeout?: number
  readonly concurrency?: number
  readonly failTtl?: number
  readonly weigh?: (value: unknown) => number
  readonly now?: () => number
}

export interface SpineCache {
  acquire(source: SpineSource, options?: SpineAcquireOptions): Promise<unknown>
  release(key: AssetKey): void
  peek(key: AssetKey): unknown
  restart(source: SpineSource): boolean
  hold(): () => void
  clear(): void
}

// ---cut-after---
catalog.createSpineCache satisfies typeof createSpineCache
catalog.spineSource satisfies typeof spineSource
export const source = {} as catalog.SpineSource satisfies SpineSource
export const cacheOptions =
  {} as catalog.SpineCacheOptions satisfies SpineCacheOptions
export const cache = {} as catalog.SpineCache satisfies SpineCache
```

- `load` 必填；值的类型由它决定，`acquire` 返回 `unknown`
- `acquire` 与 `release` 成对使用；空闲后的卸载规则见 [缓存](./06-cache.md#空闲之后)
- `SpineAcquireOptions` 只有 `retry`：失败结果在没人引用时立即重试

```ts
import { createSpineCache, type SpineSource } from "arknights-assets-catalog"

const spines = createSpineCache({
  load: async (source) => (await fetch(source.skel)).arrayBuffer(),
})
const source: SpineSource = {
  key: "spine:enemy/slime",
  skel: "https://cdn.example/files/spine/enemy/slime/slime.skel",
  atlas: "https://cdn.example/files/spine/enemy/slime/slime.atlas",
  pages: ["https://cdn.example/files/spine/enemy/slime/slime.png"],
  meta: null,
}
const [first, second] = await Promise.all([
  spines.acquire(source),
  spines.acquire(source),
])
console.log(first === second) // true
spines.release(source.key)
spines.release(source.key)
```

### `createAudioBuffer`、`audioSource`

```ts
import * as catalog from "arknights-assets-catalog"
import type {
  AssetKey,
  AudioFetch,
  AudioSource,
  DecodedAudio,
  ResolvedAsset,
} from "arknights-assets-catalog"

export declare function createAudioBuffer(
  options: AudioBufferOptions,
): AudioBufferCache
export declare function audioSource(asset: ResolvedAsset): AudioSource | null

export interface AudioBufferOptions {
  readonly fetch: AudioFetch
  readonly decode: (bytes: ArrayBuffer) => Promise<DecodedAudio | null>
  readonly warn?: (key: AssetKey, error: unknown) => void
  readonly retain?: (key: AssetKey) => boolean
  readonly limit?: number
  readonly bytes?: number
}

export interface AudioBufferCache {
  load(source: AudioSource): Promise<DecodedAudio | null>
}

// ---cut-after---
catalog.createAudioBuffer satisfies typeof createAudioBuffer
catalog.audioSource satisfies typeof audioSource
export const bufferOptions =
  {} as catalog.AudioBufferOptions satisfies AudioBufferOptions
export const buffer = {} as catalog.AudioBufferCache satisfies AudioBufferCache
```

- `fetch` 的形状与浏览器 `fetch` 兼容，只用到 `ok`、`status`、`headers.get` 与 `arrayBuffer()`
- `decode` 返回的值至少有 `length` 与 `numberOfChannels`，用来估算 PCM 字节
- `load` 失败时得到 `null`，不会拒绝

```ts
import { createAudioBuffer } from "arknights-assets-catalog"

const audio = createAudioBuffer({
  fetch: (url) => fetch(url),
  decode: async (bytes) => ({
    length: bytes.byteLength / 4,
    numberOfChannels: 1,
  }),
  warn: () => {},
})
console.log(
  await audio.load({
    key: "audio:bgm/missing",
    url: "https://cdn.example/files/audio/bgm/missing.mp3",
  }),
) // null
```

详见 [缓存](./06-cache.md)。
