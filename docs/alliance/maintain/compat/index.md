---
title: "@alliance/compat-upstream"
description: 客户端连接 master 后端时的资源表、目录与战斗适配，以及上游 master 用例与引擎规则在 next 里的去向。
---

# @alliance/compat-upstream

`alliance/compat/upstream` 是 next 与上游之间的兼容层。客户端在兼容模式下调用它：资源清单、目录与战斗视图来自 `data/`，开局规格、进度、技能与结果来自 `battle/`。

```text
data/
  asset/        master 地址到资源键，并生成 upstream 清单
  catalog/      master 的表收成目录
  view/         战斗属性、关卡地图、结算与推流
battle/
  spec.ts       b.start 收成 BattleSpec
  progress.ts   账本收成 b.progress
  skill.ts      技能记录收成 SkillSpec
  result.ts     账本与胜负收成 b.result
case-map/       master 用例在 next 的去向
trace/          引擎规则的出处
```

客户端连接 master 后端时，`data/asset` 把后端的 `data/assets.json` 转成一份 `upstream` 包清单。`arknights-assets-catalog` 仍只看资源键，不认识 master 的地址格式。战斗适配见 [战斗规格适配](./04-battle.md)。

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
- [战斗规格适配](./04-battle.md)：`b.start` → `BattleSpec`，地形、notes 与风机装置

## 下一步

- 想知道某个 master 地址映射成哪个键：读 [资源映射](./01-asset.md)
- 想同步 master 的新用例：读 [用例对照表](./02-case-map.md#运行)
- 想看战斗规格怎样适配：读 [战斗规格适配](./04-battle.md)
