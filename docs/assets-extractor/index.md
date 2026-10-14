---
title: 资源提取
description: arknights-assets-extractor 在构建期按需求清单从上游仓库取回资源，校验、转换后写出缓存文件、原始清单、文件账本和报告。
---

# arknights-assets-extractor

`arknights-assets-extractor` 回答一个问题：**一份需求清单里的资源键，从哪个上游仓库取回、怎样落到本地**。

输入是一份或多份需求清单，只列资源键与是否必需。输出是缓存目录里的规范化文件，以及三个 JSON：原始清单 `catalog.json`、文件账本 `ledger.json`、报告 `report.json`。

## 边界

- 只在构建期运行，需要 Node 与 git；运行时代码不引用它
- 只认识资源键和上游来源，不认识干员、敌人或赛季
- 不写包清单：原始清单交给使用方，由使用方再写成包清单
- 键的语法、清单格式与文件地址来自 [arknights-assets-catalog](../assets-catalog/index.md)

## 最小示例

命令行：

```bash
pnpm extract --needs needs.json --cache .cache/assets
```

在代码里调用，参数与命令行相同，返回退出码：

```ts
import { extractCommand } from "arknights-assets-extractor"

const code = await extractCommand([
  "--needs",
  "needs.json",
  "--cache",
  ".cache/assets",
])
console.log(code) // 0：全部必需键都已取到
```

## 核心概念

- [来源](./reference/02-sources.md)：来源表按种类与命名空间排出候选来源，适配器把键映射到上游文件
- [传输](./reference/03-transfer.md)：每个仓库分支一次浅克隆，只检出命中文件所在的目录
- [提取与输出](./reference/04-output.md)：校验、转换、写文件，以及三个 JSON 的内容
- [命令](./reference/05-command.md)：`pnpm extract` 与 `pnpm extract:local` 的参数和退出码

## 下一步

- 从零跑通一遍：[快速开始](./reference/01-quick-start.md)
- 查接口：[核心接口](./reference/06-api.md)
- 了解整体设计：[架构设计](./maintain/01-architecture.md)
