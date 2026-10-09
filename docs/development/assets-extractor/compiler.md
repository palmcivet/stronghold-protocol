---
title: 命令
description: 资源提取包的命令行入口、参数与本机客户端提取。
---

# 命令

先编译本包的 TypeScript，再运行读取 `dist/` 的命令：

```bash
cd assets-extractor
pnpm build
```

| 脚本 | 作用 |
| --- | --- |
| `pnpm fetch:media --jobs <file>` | 按 jobs 与 models 清单下载字体、音频、图片和 Spine，并完成后处理 |
| `pnpm extract:local` | 调用 Python 脚本，从本机客户端提取资源 |

## fetch:media

`--jobs` 文件是 JSON，形如 `{ "jobs": DownloadJob[], "models"?: PlannedSpineModel[] }`。每个 job 包含相对路径、候选 URL 和文件类型；每个 Spine model 还包含骨架、图集、页图、预乘 alpha 和技能动画下标。

| 参数 | 含义 |
| --- | --- |
| `--jobs <file>` | 必填，下载清单 |
| `--media <dir>` | 媒体输出目录 |
| `--font <dir>` | 字体输出目录 |
| `--cache <dir>` | 缓存目录，保存账本和索引 |
| `--concurrency=N` | 并行下载数，默认 16 |
| `--force` | 即使文件已存在也重新下载 |
| `--offline` | 不联网，只对磁盘上的文件做后处理 |
| `--dry-run` | 打印计划后退出 |

`--offline` 只对磁盘上已有的文件执行字体、图集和 Spine 后处理，缺失的文件会记入报告。

## extract:local

`extract.py` 使用 UnityPy 读取官方客户端的 AssetBundle，依赖列在 `source/local-client/python/requirements.txt`。需要 Python 3 和这些依赖，可以放在虚拟环境中运行。

| 参数 | 含义 |
| --- | --- |
| `--game <dir>` | AssetBundle 目录，通常是客户端的 `StreamingAssets/AB/Windows` |
| `--out <dir>` | 输出目录，默认 `assets-catalog/product/media` |
| `--only <subdir>` | 只提取指定子目录，可重复 |
| `--print-jobs` | 以 JSON 打印作业表后退出，不读取客户端 |
| `--webp` | 只补 WebP 副本 |

```bash
pnpm extract:local --game "<客户端目录>/StreamingAssets/AB/Windows"
```

`aklz4.py` 解码 LZ4AK，`enemy_scales.py` 打印敌人模型缩放表，两者都可以单独运行。
