---
title: 命令
description: pnpm extract 与 pnpm extract:local 的参数和退出码。
---

# 命令

先编译本包，再运行读取 `dist/` 的命令：

```bash
cd assets-extractor
pnpm build
pnpm extract --needs <file>... --cache <dir>
```

| 脚本 | 作用 |
| --- | --- |
| `pnpm extract` | 按需求清单从上游仓库提取资源 |
| `pnpm extract:local` | 用 Python 脚本从本机客户端提取资源 |

## extract

| 参数 | 含义 |
| --- | --- |
| `--needs <file>...` | 必填，一份或多份需求清单 |
| `--cache <dir>` | 缓存目录，默认 `.cache/assets` |
| `--offline` | 不访问网络 |
| `--force` | 账本显示输入没变时也重新生成 |
| `--refresh-index` | 把用到的克隆更新到分支最新提交 |
| `--proxy <url>` | git 进程的代理 |
| `--timeout <ms>` | 单个 git 进程的超时，默认 600000 |
| `--help` | 打印用法 |

- 多份需求清单的合并规则见 [提取与输出](./04-output.md#步骤)
- `--offline` 与 `--refresh-index` 不能同时使用，见 [传输](./03-transfer.md#刷新与离线)

退出码：

- `0`：成功；可选键缺失只记录
- `1`：有必需键缺失
- `2`：参数错误、需求清单无效、git 缺失或版本过低等环境错误

## 缓存目录

```text
<cache>/
  repos/<owner>/<repo>@<branch>/   浅克隆工作区，只检出命中的目录
  sources/<sourceId>/              适配器派生的索引
  files/<address>                  规范化文件
  catalog.json                     原始清单
  ledger.json                      文件账本
  report.json                      报告
```

- `files/` 下的地址与 `arknights-assets-catalog` 的 `fileAddress` 一致：单文件种类为 `<kind>/<path>.<format>`，Spine 为 `spine/<path>/<name>`
- git 来源直接读克隆工作区，不写 `sources/`
- `pnpm extract:local` 默认写到 `sources/local-client/files/`

## extract:local

`extract.py` 用 UnityPy 读取官方客户端的 AssetBundle，提取棋盘、网格、召唤物和敌人模型。

- 需要 Python 3，依赖列在 `source/local-client/python/requirements.txt`，可以放在虚拟环境里
- 独立于 `pnpm extract` 的来源表运行，结果写到 `--out` 目录
- 默认的 `pnpm extract` 与 `pnpm test` 不依赖 Python

| 参数 | 含义 |
| --- | --- |
| `--game <dir>` | AssetBundle 目录 |
| `--out <dir>` | 输出目录 |
| `--only <subdir>` | 只提取指定子目录，可重复 |
| `--print-jobs` | 以 JSON 打印作业表后退出 |
| `--webp` | 只补 WebP 副本 |

- `--game` 通常是客户端的 `StreamingAssets/AB/Windows`
- `--out` 默认是本包根目录下的 `.cache/assets/sources/local-client/files`
- `--print-jobs` 不读取客户端

```bash
pnpm extract:local --game "<客户端目录>/StreamingAssets/AB/Windows"
```

`aklz4.py` 解码 LZ4AK 压缩，`enemy_scales.py` 打印敌人模型的缩放表，两者都可以单独运行。
