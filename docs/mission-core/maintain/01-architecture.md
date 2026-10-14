---
title: 架构设计
description: 包布局与依赖方向、事件分发、确定性数学与整帧对齐。
---

# 架构设计

## 包布局

顶层分三类：边界、运行时、领域组。每个顶层目录有一个路径别名，包内用别名引用，不写相对路径。

- `contract/`（`#contract/*.js`）：对外的纯数据，包括规格、事件、快照、结果、阶段槽
- `port/`（`#port/*.js`）：内容端口，包括 `module.ts`（`MissionModule`、`Registration`）、`definition.ts`（各类定义与 `BattleRegistry`）、`context.ts`（`ContentContext`）、`tag.ts`（核心标签），练度与装备的数值合成
- `test/`（`#test/*.js`）：黄金回放、源码扫描、测试夹具，以及按组分目录的用例 `test/<组>/<领域>/`
- `kernel/`（`#kernel/*.js`）：运行时内核，只引用 `contract/` 与自身：`math/`、`tick/`、`hash/`、`random/`、`timer/`（通用计时）、`registry/`（通用注册表）、`schedule/`（阶段槽排序）、`event/`、`world/`（世界、组件、资源、标签、导出与导入；见 [World 与状态模型](./02-world-state.md)）
- `battle/`（`#battle/*.js`）：组装与推进，包括建战斗、组装 `BattleRegistry`、每拍的系统、上下文、快照、帧时钟、无头推进
- `unit/`（`#unit/*.js`）：单位与生命周期，包括 `record/`、`deploy/`、`block/`、`leak/`
- `combat/`（`#combat/*.js`）：战斗，包括 `attack/`、`target/`、`damage/`、`projectile/`、`element/`
- `ability/`（`#ability/*.js`）：技能与效果，包括 `skill/`、`effect/`（效果、属性、叠加策略、条件）
- `field/`（`#field/*.js`）：场地与移动，包括 `direction/`、`grid/`、`body/`、`motion/`
- `economy/`（`#economy/*.js`）：费用
- `ledger/`（`#ledger/*.js`）：按单位 `owner` 记的账本
- `perf/`：黄金场景的基准，见 [性能观察](./03-testing.md#性能观察)

例如 `#kernel/tick/index.js`、`#combat/damage/formula.js`。包只有根导出 `arknights-mission-core`。

## 依赖

- 没有运行时依赖；开发依赖只有 TypeScript、Vitest、Biome 与 `fast-check`
- `kernel/` 只引用 `#kernel/` 与 `#contract/`，单位记录、注册表和内置规则都在领域组里
- `kernel/math/`、`kernel/tick/` 与 `kernel/hash/` 是包内的实现，不从包根导出（`TICK` 除外）

## 确定性数学

同一份规格在不同 JavaScript 引擎上要走出同一场战斗。规范允许 `Math.hypot`、`Math.pow`、`Math.sin` 等返回近似值，各引擎末位不同，所以引擎代码不调用它们，改用 `kernel/math/` 的实现；按拍累加的浮点残差由 `kernel/tick/` 的容差吸收。

### kernel/math

| 文件 | 函数 | 结果 |
| --- | --- | --- |
| `hypot.ts` | `hypot(x, y)` | `√(x² + y²)`。输入超出 2^±500 时先按 2 的幂缩放，避免溢出与下溢；任一参数为 ±∞ 时为 +∞，否则有 NaN 时为 NaN |
| `powi.ts` | `powi(x, n)` | `x` 的整数次幂。用双双精度的平方乘，结果正确舍入（下溢边缘除外）；`n` 不是整数时抛 `RangeError` |
| `trig.ts` | `sin(x)`、`cos(x)`、`atan2(y, x)` | fdlibm 的算法：范围约简加多项式 |
| `float.ts` | `highWord`、`lowWord`、`fromWords`、`powerOfTwo` | 读写双精度数的高低 32 位，精确构造 2 的幂 |

这些函数只用 IEEE 754 规定正确舍入的运算（加减乘除、`Math.sqrt`、`Math.floor` 等），每个引擎得到同一个比特。用例固定了一组输入的结果摘要，任一比特变化都会失败；另有 `fast-check` 的性质用例：`powi` 与 `hypot` 对 BigInt 精确值正确舍入或在 1 ulp 内，`sin`、`cos`、`atan2` 保持对称性与恒等式，特殊值符合语言规范。

引擎里的整数次幂写 `powi(x, n)`；`x ** n` 只允许指数是整数字面量。

### 容差

浮点比较的容差按用途命名，值都是 `1e-9`，改动其中一个不牵连其他用途。

| 名字 | 用途 |
| --- | --- |
| `SPATIAL_EPSILON` | 空间比较，单位是格：距离与半径、地块矩形的边、射线参数、路径上剩下的距离 |
| `COST_EPSILON` | 费用比较 |
| `BLOCK_EPSILON` | 阻挡数与阻挡权重比较 |
| `HEALTH_EPSILON` | 生命、护盾与生命比例比较 |

按时间或拍数比较的量（倒计时、等待剩余、站定的拍）用 `kernel/tick` 的 `READY_EPSILON`。

### kernel/tick

| 名字 | 值或签名 | 含义 |
| --- | --- | --- |
| `TICK` | `1 / 30` | 一拍的游戏秒数 |
| `READY_EPSILON` | `1e-9` | 拍对齐的容差，远大于按拍累加的残差，远小于一拍 |
| `countdown(remaining, dt)` | `number` | 倒计时走过 `dt` 后的剩余，剩余在容差以内记为 0 |
| `reached(value, target)` | `boolean` | 累计量是否到达目标，差距在容差以内算到达 |

时长是整拍数时，倒计时正好走那么多拍：1 秒走 30 拍，攻击间隔 `bat × 100 / aspd` 走 `⌈30 × 间隔⌉` 拍；不在拍网格上的时长在越过 0 的那一拍结束（1.25 秒走 38 拍）。300 次加 `1/30` 到达 10。

使用的地方：攻击计时的冷却与前摇（[攻击](../reference/08-attack.md)），技力与充能、手动技能的就绪时刻（[技能](../reference/07-skill.md)），持续技能的剩余时间，充能与装填的间隔（[计时](../reference/09-timer.md)）。

### kernel/hash

- `canonicalJson(value, path?)`：纯数据的规范文本：对象键按字典序，`undefined` 属性像 JSON 一样省略，`-0`、`NaN`、`±Infinity` 写成各自的字面量，数字按最短往返形式。函数、类实例、`Map` 等非纯数据抛错并报出路径
- `hashText(text)`：两个种子各跑一遍 32 位 FNV-1a，拼成 16 位十六进制。不是密码学摘要，只用于 `contentHash` 这类一致性比较

## 攻击的持有状态

普通攻击之外，干员可以带三种「持有状态」：充能（没有目标时攒层数，下一击多打几下）、弹药（每击消耗一发，打空停手，离开攻击后自动装填）、回旋（飞出的回旋物没回来之前不能再出手）。它们各是一个计时器（`charge`、`ammo`、`boomerang`），与攻击计时 `attack` 一起注册在 `ally` 阶段槽，由 `engine:ally-timers` 每拍推进。攻击本身不知道三者的细节，只通过下面几个函数读写它们。

- **出手前读状态：`readAttackTiming`**。攻击在判断「这一拍会不会命中」、进入出手、结算命中时都先调用它，得到三项：能否出手（弹药不为 0，且没有在飞的回旋物）、命中次数（1 加上已攒的充能层数）、伤害倍率（还有弹药时取属性 `atk_scale`，否则为 1）。它只读不写，同一拍里调用多少次结果都一样。它要读单位记录上的计时器，读战斗世界里还在飞的回旋物数量，并经注册表做属性汇总（状态修饰过的 `atk_scale`）。
- **出手后结账：`consumeAttackTiming`**。命中结算完、发出 `attack-hit` 之前调用：充能层数清零，弹药减一并记下「刚打过一发」。弹药计时器下一次推进时看到这个标记，把装填的起点挪到这一拍，所以装填总是从最后一击之后 1 秒才开始。只改单位记录上的计时器。
- **持有状态自己的时钟：`independentDt`**。三个计时器每拍要推进的游戏秒数，等于一拍的时长乘以属性 `timerRate`（缺省 1，非法值退回 1）。把速度做成一个属性，状态只要修饰 `timerRate` 就能整体加快或放慢充能、装填和回旋计时，不必分别改每一种计时。它读单位记录，并经注册表汇总属性。
- **本拍有没有目标：`setAttackTargetThisTick`**。充能只在「没有目标」时累积，判断有没有目标默认要做一次范围查询。内容端若已经知道答案（例如自己接管了索敌），可以在本拍先写入，充能推进时优先用写入的值，与攻击前摇看到的是同一份判断。标记挂在单位记录上，每拍末由 `engine:ally-timers`（敌方是 `engine:enemy-attack`）清掉，不会带到下一拍。

<!-- check:skip -->
```ts
function readAttackTiming(
  state: BattleWorld,
  unit: UnitState,
  registry?: BattleRegistry,
): AttackTiming // { canAttack, hitCount, damageScale }
function consumeAttackTiming(unit: UnitState): void
function independentDt(unit: UnitState, registry: BattleRegistry): number
function setAttackTargetThisTick(unit: UnitState, present: boolean): void
```

计时时长都按 [容差](#容差) 判断到达，见 [计时](../reference/09-timer.md) 与 [攻击](../reference/08-attack.md)。

## 恐惧落点

恐惧让单位背着来源跑开一段。它是一种位移（`fear`），位移开始时 `planFearMove` 决定这次跑到哪里、怎么走过去：

1. 先由 `fearReachableTiles` 列出候选格：以受击点为顶点、背向来源、半角 45° 半径 10 的扇形内，可通行、不是目标点的格子；地面单位还要求从那里仍能走到自己路线的终点。来源与单位重合（自己吓自己）时没有候选。然后用战斗的随机数抽一格。
2. 抽中的格若超过 5 步（`FEAR_REACH`，四向步数）才能走到，本次留在原格。
3. 落点在格心上加一个随机偏移（边长 `FEAR_JITTER` = 0.5 的正方形内），避免多个单位叠在同一点。
4. 地面单位沿网格路点走到目标格，起点不在格心且直线被挡时先回格心；飞行单位直接飞向落点。走不通就退回原格。

<!-- check:skip -->
```ts
function planFearMove(
  grid: FieldGrid,
  motion: Motion,
  x: number,
  y: number,
  tiles: string[],
  random: Random,
): FearMove // { key, goal, points }
```

结果包含落点所在格（`key`）、落点坐标（`goal`）与路径点（`points`），位移系统按路径移动单位。它依赖场地网格（通行、路点与直线可达）、单位的移动方式（地面或飞行）以及战斗的随机数，随机数来自战斗世界，所以同一种子下落点可重现。见 [费用、阻挡与投射物](../reference/12-field.md)。
