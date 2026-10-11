---
title: 追溯标记
description: 代码里的 TRACE 标记指向这张表，表里写明每条规则的出处与依据。
---

# 追溯标记

代码、注释、测试名与报错只写当前代码在做什么。规则或数值需要指向外部出处时，代码里只留一个标记，说明集中写在这张表里。

## 写法

标记单独占一行，放在相关代码的上一行，行内不写其他文字：

```ts
// TRACE: source/deterministic-math
export function hypot(x: number, y: number): number {
```

一处引用多条时用逗号分隔：`// TRACE: source/a, assumed/b`。JSON 数据不能写注释，由表格的「位置」列指向数据路径。

| 种类 | 含义 |
|---|---|
| `assumed` | 沿用参考实现中标为假定的规则或数值，尚无官方资料印证 |
| `source` | 行为或数值的出处：参考实现的文件与设计记录，或官方数据字段 |
| `interim` | 实施期间的限制，说明写在 `plans/` 的对应步骤里，不进这张表 |

## 检查

每个引擎包的 `test/trace.spec.ts` 用 TypeScript 扫描器读取注释、测试名与报错文案，并检查：

- 标记的写法；每个 `assumed`、`source` 标记都在本表对应包的一节里，表里每一行至少被引用一次；每个 `interim` 标记都能在 `plans/` 中找到。
- 注释、测试名与报错文案中不出现参考实现的文件路径、文件名、设计记录小节号，以及待办或实施期字样。命中即失败，报出文件与行号，没有豁免名单。

在 `mission-core` 内运行：

```sh
pnpm test
```

## mission-core

| id | 规则 | 位置 | 来源 | 依据 | 核对 |
|---|---|---|---|---|---|
| `source/deterministic-math` | `hypot`、`powi`、`sin`、`cos`、`atan2` 只用正确舍入的运算，各引擎逐位一致 | `kernel/math/hypot.ts`、`kernel/math/powi.ts`、`kernel/math/trig.ts` | 参考实现 `server/sim/detmath.js`，设计记录 0.2.2 §27.1；`sin`、`cos`、`atan2` 是 fdlibm 5.3 与 FreeBSD msun 的算法 | 规范允许 `Math.hypot` 等返回近似值，各引擎末位不同；逐位与参考实现一致（用例固定了同一组摘要） | 已按参考实现核对 |
| `source/element-order` | 元素槽给画面的显示值取最满的一槽，一样满时按 `neural`、`erosion`、`burn`、`apoptosis`、`necrosis` 的先后取 | `combat/element/gauge.ts`（`ELEMENT_GAUGES` 的 view） | 参考实现 `server/sim/constants.js`（`ELEMENT_ORDER`）、`server/sim/damage.js`（`elementView`） | 官方元素 id 的先后；画面只显示一个元素图标 | 已按参考实现核对先后顺序 |
| `source/immunity-names` | 免疫名单用免疫名：冻结是 `frozen`，恐惧和战栗是 `feared`，其余与状态 id 相同 | `contract/spec.ts`（`UnitSpec.immunity`）、`ability/effect/immunity.ts`、`port/definition.ts`（`StatusDefinition.immunity`） | 参考实现 `server/sim/buffs.js` 状态表的 `immune` 字段 | 关卡与内容数据沿用这套名字，兼容层不必转换 | 未核对 |
| `source/loadout-compose` | 带模块的属性是无模块属性加模块的平加值并保留六位小数；天赋按序号覆盖，模块未写的键保留，其余追加，空占位丢弃 | `port/loadout.ts`（`composeStats`、`composeTalents`） | 参考实现 `tools/build-data.mjs`（`mergeTalentChanges`）、`shared/loadoutRecord.js` | 与数据构建时的合并规则一致，详情卡与战斗读到同一组数 | 未核对 |
| `source/loadout-range` | 部署时的攻击范围：技能写明「被动效果：攻击范围扩大」用技能范围；精英且模块写明「攻击范围扩大」用模块范围；否则用记录范围；再加特性的永久攻击距离 | `port/loadout.ts`（`attackRangeGrid`） | 参考实现 `shared/loadoutRecord.js`，设计记录 DESIGN §16 | 官方技能与模块描述的文字约定 | 未核对 |
| `source/range-extend` | 攻击距离增加 n 时，范围每一行在最远端外补上 1…⌊n⌋ 格，去重，丢弃无效项 | `port/loadout.ts`（`extendedGrid`） | 参考实现 `server/sim/targeting.js`（`absoluteRangeKeys`），设计记录 DESIGN §3 | 官方「攻击距离 +1」按行向前延伸 | 未核对 |
