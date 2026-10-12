---
title: 快速开始
description: 写一份需求清单，运行一次提取，读出原始清单与报告。
---

# 快速开始

这一页从零开始：写一份需求清单，取回一张头像和一段语音，再看提取的结果。

## 准备

- Node 22 与 git 2.25 或更高版本（提取用 cone 模式的稀疏检出）
- 能访问 GitHub；需要代理时用 `--proxy`

## 1. 写需求清单

需求清单只有键：`required` 为 `true` 的键取不到时提取失败，为 `false` 时只记录。格式见 [需求清单](../assets-catalog/03-manifest.md#需求清单)。

```json
{
  "schemaVersion": 1,
  "pack": { "type": "base", "id": "demo" },
  "needs": [
    { "key": "image:char/avatar/char_002_amiya", "required": true },
    { "key": "audio:voice/cn/char_002_amiya/cn_001", "required": false }
  ]
}
```

存为 `needs.json`。

## 2. 运行提取

```bash
pnpm extract --needs needs.json --cache .cache/assets
```

第一次运行会浅克隆用到的仓库，只检出命中的目录；之后的运行复用克隆与文件账本。

退出码 `0` 表示全部必需键都已取到，`1` 表示有必需键缺失，`2` 表示参数或环境错误。

## 3. 读结果

```text
.cache/assets/
  files/image/char/avatar/char_002_amiya.png   规范化文件
  catalog.json                                 原始清单
  ledger.json                                  文件账本
  report.json                                  报告
```

在代码里读原始清单：

```ts
import { readFile } from "node:fs/promises"
import { isRawCatalog } from "arknights-assets-catalog"
import { cacheLayout } from "arknights-assets-extractor"

const layout = cacheLayout(".cache/assets")
const catalog: unknown = JSON.parse(await readFile(layout.catalog, "utf8"))
if (!isRawCatalog(catalog)) {
  throw new Error(`not a raw catalog: ${layout.catalog}`)
}
console.log(Object.keys(catalog.entries))
console.log(catalog.missing.map((need) => need.key))
```

- `entries`：取到的条目，带文件、来源仓库与提交号
- `missing`：没取到的键，`tried` 列出每个来源与原因

## 下一步

- 键会去哪个来源：[来源](./02-sources.md)
- 三个 JSON 的全部内容：[提取与输出](./04-output.md)
- 全部参数：[命令](./05-command.md)
