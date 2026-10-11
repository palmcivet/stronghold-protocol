---
title: 命令
description: pnpm extract 的参数、退出码，以及原始目录、账本和报告的内容。
---

# 命令

先编译本包的 TypeScript，再运行读取 `dist/` 的命令：

```bash
cd assets-extractor
pnpm build
pnpm extract --needs <file>... --cache <dir>
```

| 脚本 | 作用 |
| --- | --- |
| `pnpm extract` | 读需求清单，经来源表提取资源，写出缓存文件、原始目录、账本与报告 |
| `pnpm extract:local` | 调用 Python 脚本，从本机客户端提取资源 |

## extract

| 参数 | 含义 |
| --- | --- |
| `--needs <file>...` | 必填，一份或多份需求清单（`schemaVersion: 1`）；同一个键出现多次时 `required` 取或，合并后仍为可选时保留 `absent` |
| `--cache <dir>` | 缓存目录，默认 `.cache/assets` |
| `--offline` | 不访问网络，只用已有的克隆与已检出的文件 |
| `--force` | 账本显示输入未变时也重新复制与转换 |
| `--refresh-index` | 把用到的克隆更新到分支最新提交；不能与 `--offline` 同用 |
| `--proxy <url>` | git 进程的代理 |
| `--timeout <ms>` | 单个 git 进程的超时，默认 600000 |
| `--help` | 打印用法 |

退出码：`0` 成功（可选键缺失只记录）；`1` 有 `required` 键缺失；`2` 参数错误、需求清单无效、git 缺失或版本过低等环境错误。

### 一次提取的过程

1. 读入并合并需求清单。`json:spine-meta/<path>` 需求转成对 `spine:<path>` 的隐式工作。
2. 每个键按来源表取候选来源。每一轮：对每个未解决的键，用当前候选来源 `prepare`（每个来源只一次）并 `locate`。
3. 按仓库汇总本轮命中的文件，扩展稀疏检出。
4. 物化：读入上游文件，计算输入哈希；账本中同一需求的记录输入哈希相同、来源相同、输出文件仍在且哈希一致时直接复用。否则：
   - Spine：`assembleSpine` 保留骨架原样，图集按真实页图补 `size` 与 pma、页名换成安全名，解析骨架生成侧车 `<name>.meta.json`（`SpineMeta`：版本、pma、包围盒、动画时长与事件、页、缺失区域），同时写出 `json:spine-meta/<path>` 条目，内容与侧车相同。不推导攻击动画。
   - 其他种类：按上游扩展名校验格式（png、webp、mp3、otf、ttf、woff2、atlas、skel、obj、json；skel 拒绝 Git LFS 指针）；字体主文件转 WOFF2 后再校验。
   - 写到 `files/<address>`，内容不变的文件不重写。
5. 命中但文件不可用（未检出、校验或转换失败）时记进 `problems`，并改试下一个来源；所有候选都失败的键进入原始目录的 `missing`，`tried` 列出每个来源与原因。

### 输出

| 文件 | 内容 |
| --- | --- |
| `catalog.json` | 原始目录（`RawCatalog`）：条目按键排序，文件按角色与名字排序，`missing` 按键排序；写出前经 `rawCatalogIssues` 校验。同一输入两次运行字节一致 |
| `ledger.json` | 按文件地址记录：所属键、来自哪个需求、角色、格式、来源、仓库、提交、上游路径、输入哈希、字节数、SHA-256 |
| `report.json` | 需求统计（总数、解决数、缺失的必需与可选键；可选缺失再分为 `absentUpstream`——需求带 `absent` 原因、上游确实没有的键与原因，和 `unexplained`——其余未说明的键）、`fallbacks`（经回退才命中的键与之前的尝试）、`ambiguous`（同名多候选）、`problems`、每个仓库的提交、本次是否首次克隆、克隆与检出耗时、稀疏目录、磁盘占用，以及复用与写入数 |

## 程序接口

`pnpm extract` 的功能也可以在代码里调用，包入口导出：

```ts
import { cacheLayout, createSources, extractAssets, extractCommand, nodeBuildFiles, readNeeds } from "arknights-assets-extractor"

// 与命令行相同：参数数组进，退出码出
const code = await extractCommand(["--needs", "base.json", "--cache", ".cache/assets", "--offline"])
```

| 导出 | 作用 |
| --- | --- |
| `extractCommand(argv, deps?)` | 解析参数并执行一次提取，返回退出码；`deps` 可替换文件端口、git 进程、克隆缓存与来源 |
| `extractAssets(options)` | 一次提取的核心：`needs`、`layout`、`files`、`repos`、`sources`，可选 `table`、`offline`、`force`、`refreshIndex`；返回 `{ catalog, report, missingRequired }` |
| `readNeeds`、`readNeedsList`、`mergeNeeds` | 读入并合并需求清单 |
| `cacheLayout(cacheDir)` | 缓存目录里各文件与子目录的绝对路径；`DEFAULT_CACHE_DIR` 为 `.cache/assets` |
| `createSources(files)` | 七个来源适配器（读入路径表）；`SOURCE_TABLE`、`routeOf`、`sourcesFor` 为来源表 |
| `GitRepoCache` | 浅克隆与稀疏检出；`MIN_GIT_VERSION`、`assertGitVersion` |
| `BuildFiles`、`nodeBuildFiles`、`BuildReadError` | 构建期文件端口（读写文本与字节、原子写、列目录）及 Node 实现、读取错误 |
| `GitProcess`、`nodeGitProcess`、`GitError` | git 进程端口及 Node 实现 |

## extract:local

`extract.py` 使用 UnityPy 读取官方客户端的 AssetBundle，依赖列在 `source/local-client/python/requirements.txt`。需要 Python 3 和这些依赖，可以放在虚拟环境中运行。它独立于 `pnpm extract` 的来源表运行，结果写到 `--out` 目录。

| 参数 | 含义 |
| --- | --- |
| `--game <dir>` | AssetBundle 目录，通常是客户端的 `StreamingAssets/AB/Windows` |
| `--out <dir>` | 输出目录，默认是本包根目录下的 `.cache/assets/sources/local-client/files` |
| `--only <subdir>` | 只提取指定子目录，可重复 |
| `--print-jobs` | 以 JSON 打印作业表后退出，不读取客户端 |
| `--webp` | 只补 WebP 副本 |

```bash
pnpm extract:local --game "<客户端目录>/StreamingAssets/AB/Windows"
```

`aklz4.py` 解码 LZ4AK，`enemy_scales.py` 打印敌人模型缩放表，两者都可以单独运行。
