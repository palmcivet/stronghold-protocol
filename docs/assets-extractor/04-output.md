---
title: 提取与输出
description: 一次提取的步骤，文件的校验与转换，Spine 元数据，以及原始清单、文件账本和报告的内容。
---

# 提取与输出

一次提取把需求清单里的键逐个交给候选来源，命中后校验、转换并写进 `files/`，最后写出三个 JSON。

## 步骤

1. 读入并合并需求清单
   - 同一个键出现多次时，任一份要求必需即为必需
   - 合并后仍是可选时保留第一个 `absent` 原因
   - `json:spine-meta/<path>` 需求转成对 `spine:<path>` 的隐式需求
2. 每个键按来源表取候选来源
3. 每一轮，对每个还没解决的键：
   - 用当前候选来源 `prepare`（每个来源只调用一次）
   - 再 `locate`
4. 按仓库汇总本轮命中的文件，扩展稀疏检出
5. 生成文件：读入上游文件，校验、转换，写到 `files/<address>`
6. 命中但文件不可用（未检出、校验或转换失败）时，记进 `problems` 并改试下一个来源
7. 所有候选都失败的键进入原始清单的 `missing`

## 复用

每条输出文件在账本里记有输入哈希。以下条件都满足时直接复用，不再复制与转换：

- 同一需求的记录输入哈希相同、来源相同
- 输出文件仍在，且哈希与账本一致

`--force` 跳过复用。内容没变的文件不会重写。

## 校验与转换

- 按上游扩展名校验格式：png、webp、mp3、otf、ttf、woff2、atlas、skel、obj、json
- skel 文件拒绝 Git LFS 指针
- 字体主文件先转为 WOFF2，再校验

## Spine

`assembleSpine` 组装一个 Spine 模型：

- 骨架文件原样保留，不推导攻击动画
- 图集按真实页图补 `size` 与 `pma`，页名换成 `safeName`
- 解析骨架，写出 **Spine 元数据** `<name>.meta.json`
  - 类型是 `SpineMeta`：版本、`pma`、包围盒、动画的时长与事件、页、缺失的区域
  - 同时写出 `json:spine-meta/<path>` 条目，内容与该文件相同

格式见 [Spine 元数据](../assets-catalog/03-manifest.md#spine-元数据)。

## 原始清单 `catalog.json`

类型是 `RawCatalog`：

- `entries`：取到的条目，按键排序；条目里的文件按角色与名字排序
- `missing`：没取到的键，按键排序；`tried` 列出每个来源与原因
- 写出前经 `rawCatalogIssues` 校验
- 同一输入两次运行，字节完全一致

## 文件账本 `ledger.json`

按文件地址记录每个输出文件：

- 所属的键，以及由哪个需求产生
- 角色、格式
- 来源、仓库、提交号、上游路径
- 输入哈希、字节数、SHA-256

## 报告 `report.json`

报告给人看，下游不读它。类型是 `ExtractReport`。

- `needs`：需求统计
  - `total`、`resolved`
  - `missingRequired`、`missingOptional`
  - `absentUpstream`：需求带 `absent` 原因、上游确实没有的可选键
  - `unexplained`：其余没说明原因的可选缺失，需要检查规则或来源
- `fallbacks`：经回退才命中的键，以及之前的尝试
- `ambiguous`：同名多候选
- `problems`：命中但文件不可用
- `repos`：每个仓库的提交号、本次是否首次克隆、克隆与检出耗时、稀疏目录、磁盘占用
- `reused`、`written`：复用与写入的文件数
- `elapsedMs`：耗时
