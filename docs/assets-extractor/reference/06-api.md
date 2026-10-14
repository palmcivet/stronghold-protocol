---
title: 核心接口
description: 按使用场景分组的核心接口：命令、一次提取、需求清单与缓存目录、来源。
---

# 核心接口

这一页按使用场景列出核心接口。所有接口都从包入口 `arknights-assets-extractor` 导入；行为与规则在各指南页。

## 命令

### `extractCommand`

```ts
import * as extractor from "arknights-assets-extractor"
import type {
  AssetSource,
  BuildFiles,
  GitProcess,
  RepoCache,
} from "arknights-assets-extractor"

export declare function extractCommand(
  argv: readonly string[],
  deps?: ExtractCommandDeps,
): Promise<number>

export interface ExtractCommandDeps {
  readonly files?: BuildFiles
  readonly git?: GitProcess
  readonly repos?: RepoCache
  readonly sources?: readonly AssetSource[]
  readonly log?: (message: string) => void
  readonly error?: (message: string) => void
}

// ---cut-after---
extractor.extractCommand satisfies typeof extractCommand
export const deps =
  {} as extractor.ExtractCommandDeps satisfies ExtractCommandDeps
```

- 与 `pnpm extract` 相同：参数数组进，退出码出，见 [命令](./05-command.md#extract)
- `deps` 替换文件端口、git 进程、克隆缓存、来源与日志输出；缺省用 Node 实现与七个 git 来源
- 参数错误不抛出，打印用法并返回 `2`

```ts
import { extractCommand } from "arknights-assets-extractor"

const lines: string[] = []
const code = await extractCommand(["--help"], {
  log: (line) => lines.push(line),
})
console.log(code) // 0
console.log(lines[0]?.startsWith("Usage: pnpm extract")) // true
```

## 一次提取

### `extractAssets`

```ts
import * as extractor from "arknights-assets-extractor"
import type { AssetKey, Need, RawCatalog } from "arknights-assets-catalog"
import type {
  AssetSource,
  BuildFiles,
  CacheLayout,
  ExtractReport,
  RepoCache,
  SourceRoute,
} from "arknights-assets-extractor"

export declare function extractAssets(
  options: ExtractOptions,
): Promise<ExtractResult>

export interface ExtractOptions {
  readonly needs: readonly Need[]
  readonly layout: CacheLayout
  readonly files: BuildFiles
  readonly repos: RepoCache
  readonly sources: readonly AssetSource[]
  readonly table?: readonly SourceRoute[]
  readonly offline?: boolean
  readonly force?: boolean
  readonly refreshIndex?: boolean
  readonly log?: (message: string) => void
}

export interface ExtractResult {
  readonly catalog: RawCatalog
  readonly report: ExtractReport
  readonly missingRequired: readonly AssetKey[]
}

// ---cut-after---
extractor.extractAssets satisfies typeof extractAssets
export const options = {} as extractor.ExtractOptions satisfies ExtractOptions
export const result = {} as extractor.ExtractResult satisfies ExtractResult
```

- 不解析参数、不打印缺失键、不返回退出码；这些由 `extractCommand` 做
- `table` 换掉来源表，缺省是 `SOURCE_TABLE`
- 步骤与输出见 [提取与输出](./04-output.md)

## 需求清单与缓存目录

### `readNeeds`、`mergeNeeds`、`cacheLayout`

```ts
import * as extractor from "arknights-assets-extractor"
import type { Need, NeedsList } from "arknights-assets-catalog"
import type { BuildFiles } from "arknights-assets-extractor"

export declare function readNeeds(
  files: BuildFiles,
  paths: readonly string[],
): Promise<Need[]>
export declare function mergeNeeds(lists: readonly NeedsList[]): Need[]
export declare function cacheLayout(cacheDir: string): CacheLayout

export interface CacheLayout {
  readonly root: string
  readonly repos: string
  readonly sources: string
  readonly files: string
  readonly catalog: string
  readonly ledger: string
  readonly report: string
}

// ---cut-after---
extractor.readNeeds satisfies typeof readNeeds
extractor.mergeNeeds satisfies typeof mergeNeeds
extractor.cacheLayout satisfies typeof cacheLayout
export const layout = {} as extractor.CacheLayout satisfies CacheLayout
```

- `readNeeds` 逐份读入并校验需求清单，再合并；文件读不出或格式不对时抛 `BuildReadError`
- `mergeNeeds` 的结果按键排序，合并规则见 [提取与输出](./04-output.md#步骤)
- `cacheLayout` 返回缓存目录里各文件与子目录的绝对路径；`DEFAULT_CACHE_DIR` 是 `.cache/assets`

```ts
import { mergeNeeds } from "arknights-assets-extractor"

const pack = { type: "base", id: "demo" }
const merged = mergeNeeds([
  {
    schemaVersion: 1,
    pack,
    needs: [{ key: "audio:bgm/title", required: false }],
  },
  {
    schemaVersion: 1,
    pack,
    needs: [{ key: "audio:bgm/title", required: true }],
  },
])
console.log(merged) // [{ key: "audio:bgm/title", required: true }]
```

## 来源

### `AssetSource`、`SourceHit`

```ts
import * as extractor from "arknights-assets-extractor"
import type { AssetKey } from "arknights-assets-catalog"
import type {
  RepoWorkspace,
  SourceContext,
  SourceCover,
  SourceFile,
} from "arknights-assets-extractor"

export interface AssetSource {
  readonly id: string
  readonly covers: readonly SourceCover[]
  prepare(context: SourceContext): Promise<void>
  locate(key: AssetKey, context: SourceContext): Promise<SourceHit | null>
}

export interface SourceHit {
  readonly path: string
  readonly revision: string | null
  readonly files: readonly SourceFile[]
  readonly dependsOn: readonly AssetKey[]
  readonly repo: RepoWorkspace | null
  readonly premultipliedAlpha?: boolean
}

// ---cut-after---
export const source = {} as extractor.AssetSource satisfies AssetSource
export const hit = {} as extractor.SourceHit satisfies SourceHit
```

- `createSources(files)` 返回七个 git 来源，读入它们的路径表
- `SOURCE_TABLE`、`routeOf`、`sourcesFor` 是来源表与查表函数
- 规则见 [来源](./02-sources.md)

## 端口

构建期的文件与 git 进程都通过端口访问，可以替换：

- `BuildFiles`：读写文本与字节、原子写、判断存在、列目录；`nodeBuildFiles` 是 Node 实现，读取失败抛 `BuildReadError`
- `GitProcess`：运行一个 git 命令；`nodeGitProcess` 是 Node 实现，失败抛 `GitError`
- `GitRepoCache`：浅克隆与稀疏检出，见 [传输](./03-transfer.md)；`MIN_GIT_VERSION`、`assertGitVersion` 检查 git 版本
