---
title: "@alliance/compat-upstream"
description: 客户端连接 master 后端时怎样读取它的资源表，以及 master 用例与引擎规则在 next 里的去向。
---

# @alliance/compat-upstream

`alliance/compat/upstream` 是 next 与 master 之间的兼容层，包名 `@alliance/compat-upstream`。它做三件事：

- 客户端连接 master 后端时，把后端的 `data/assets.json` 转成一份 `upstream` 包清单。`arknights-assets-catalog` 仍只看资源键，不认识 master 的地址格式
- 记录 master 的每条测试用例在 next 里的去向，并检查对照表与两边的用例清单一致
- 记录引擎规则的出处与核对状态，以及锁住每条规则的 next 用例

## 图层顺序

客户端在兼容模式下按以下顺序叠加图层，后者替换前者的同名键：

1. 下一版基础包（可选，配置 `nextBase` 时加载）
2. master 后端生成的 upstream 清单
3. 本地覆盖清单（`local` 选项，缺失时为空）

下一版基础包只补 master 缺的键。赛季包不参与兼容模式，因为它的内容可能与 master 后端的赛季不一致。

## 内容

- [资源映射](./01-asset.md)：读取的文件、地址到键的映射、不映射的地址
- [用例对照表](./02-case-map.md)：`case-map` 的文件、状态、枚举与命令
- [追溯标记](./03-trace.md)：引擎规则的出处、依据与锁定用例

## 下一步

- 想知道某个 master 地址映射成哪个键：读 [资源映射](./01-asset.md)
- 想同步 master 的新用例：读 [用例对照表](./02-case-map.md#运行)
