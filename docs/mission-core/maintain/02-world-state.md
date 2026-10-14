---
title: World 与状态模型
description: World 字段、单位记录、内置组件与资源路径，以及 exportWorld / importWorld 的编码边界。
---

# World 与状态模型

一场战斗的全部可变状态在一个 `World` 里（`kernel/world/`）。核心记录是按入场顺序排列的单位，其余数据挂在组件表、资源和标签上。模块作者按带类型的键读写，见 [世界、组件、资源与标签](../reference/05-world.md)。

`World` 是内部类型，不从包根导出。它的字段：

- `spec`：本场规格
- `tick`：当前拍数
- `units`：按入场顺序的单位记录
- `random`：本场的随机数发生器
- `components`、`resources`：组件表与资源
- `events`：事件缓冲

`arknights-mission-core` 用的是 `World<UnitState>`。`kernel/` 只引用 `contract/` 与 `kernel/` 自己，单位记录、注册表和内置规则都在领域组里。包布局见 [架构设计](./01-architecture.md)。

## 单位记录

单位记录（`unit/record/`）只放各机制共用的事实：身份、阵营与种类、坐标与朝向、受击范围、移动方式、属性与基础值、状态与修饰、技能、计时器、标签、在场与倒下、`deployEpoch`、脚本参数。`deployEpoch` 每次部署（开场上场与再部署）加一，回旋物的世代读它。只有一种机制用的数据放在那个机制的组件里，见下面的内置组件表。

## 内置组件

| id | 所在 | 内容 | view |
| --- | --- | --- | --- |
| `attack:profile` | `combat/attack/profile.ts` | 规格的 `attackClip`、`attackShape`，放入时建，只读 | 无 |
| `attack:boomerang` | `combat/attack/boomerang.ts` | 还没回到手上的回旋数量 | `{ out }` |
| `block:hold` | `unit/block/hold.ts` | `blocking`、`blockedBy` | 无（快照另有 `blocking`、`blockedBy`） |
| `target:priority` | `combat/target/priority.ts` | 规格或 `setAim` 写的索敌优先 | 无 |
| `damage:hit-limit` | `combat/damage/limit.ts` | 规格打开的首领限伤 | 无 |
| `damage:overheal-shield` | `combat/damage/shield.ts` | 治疗溢出转成的护盾 | 无 |
| `effect:immunity` | `ability/effect/immunity.ts` | 规格的免疫名单 | 无 |
| `element:gauges` | `combat/element/gauge.ts` | 各元素槽的值、上限、锁定，爆发中，最近打满的来源 | 最满的一槽 `{ element, ratio, locked }`，没有非空槽时是 `null` |
| `motion:shift` | `field/motion/shift.ts` | 正在走的强制位移 | 无 |
| `grid:route` | `field/grid/route.ts` | 敌人的路线进度与路线消失 | 无（快照的 `tags` 写 `hidden`） |
| `attack:stand` | `combat/attack/stand.ts` | 敌人出手后站定到哪一拍、被打断的时刻 | `{ until, cutAt }` |
| `target:extra-range` | `combat/target/selector.ts` | 内容加进攻击范围的绝对格子 | 无 |
| `skill:trigger-areas` | `ability/skill/trigger.ts` | 内容登记的技能触发区域，按键 | 无 |
| `deploy:redeploy-plan` | `unit/deploy/command.ts` | 排下的再部署：落点、延迟、费用、`keepSp` 与起算计时 | 无 |

## 内置资源

内置的地图（`field:grid`）、投射物（`combat:projectiles`）、费用（`economy:cost`）、内容排下的回调（`battle:schedule`）、已出场的刷出项（`battle:spawned`）、结果（`battle:result`）和账本（`ledger:book`）都是资源。`core:engine` 是 transient：指回本场的世界与注册表，不导出也不导入，建战斗时重新放好。

## 导出与导入

`exportWorld` 把世界写成纯数据：拍数、随机流状态（`random.state()`，导入时 `random.restore`）、按入场顺序的单位记录、组件表和资源。组件与资源有 `codec` 时先 `encode`，再检查只剩普通对象、数组、字符串、布尔、`null` 与数字，否则报出路径；结果深拷贝，和世界不共享对象。`importWorld` 反过来写回，规格、注册、订阅与 transient 资源不变，待取走的事件清空。系统与订阅者每次运行时经 `ensure` 取资源，不留导入前的旧值。

战斗面的 `export()` / `createBattle(..., archive)` 见 [战斗](../reference/03-battle.md#导出与导入)。黄金场景的往返用例见 [黄金回放与源码扫描](./03-testing.md#导出与导入)。

不是纯数据、带 `codec` 的组件与资源：

| id | 值 | 编码 |
| --- | --- | --- |
| `effect:immunity` | `Set` | 数组 |
| `element:gauges` | 各槽的 `Map` | 按槽的数组 |
| `field:grid` | 网格对象 | 障碍位与网格版本号；导入时按规格重建再恢复 |
| `battle:spawned` | `Set` | 数组 |
| `battle:schedule` | 回调列表 | 还有没执行的回调时导出报错，空列表导出为空 |

单位记录由 `unit/record/archive.ts` 编码：`Map` 写成数组，技能的钩子不导出，导入时按规格的技能重新挂上；运行中放入、规格里找不到的单位带钩子时报错。`grid:route` 本身是纯数据，路线里的网格版本号随 `field:grid` 一起恢复。
