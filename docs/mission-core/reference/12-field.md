---
title: 费用、阻挡与投射物
description: 费用按阵营分池，再部署扣费后回到当前坐标，阻挡写回 blocking，泄漏读保护目标，投射物飞到后走伤害。
---

# 费用、阻挡与投射物

这些都是可装上的模块，标识是 `cost`、`redeploy`、`block`、`leak`。投射物飞行挂在投射物槽上，不另装模块。不装某个模块时，它不改已经写在规格里的关系，也不自动回复费用。

## 费用

每个阵营一口池，数量在 `BattleSpec.cost`。`cost` 模块在费用槽把 `regen × 1/30` 加进池里，不超过 `cap`。

`spendCost` 不够时不扣。`addCost` 超过上限的部分丢掉。池子数字变化时送出 `cost`。

单位属性 `cost` 是再部署要付的数额，缺省 0。

## 再部署

生命到 0 或被撤下（`retreat` 输入、`retreatUnit`）时引擎启动 `redeploy` 计时器，并把已经走过的秒数清零。装了 `redeploy` 模块后，再部署槽只推进还倒着的单位。`respawnTime` 是秒，缺省 0，表示倒地的这一拍就可以回来。

- 秒数走完之后计时器停住。
- 等待秒数是 `respawnTime × redeployMul`。
- `redeployMul` 缺省 1，走属性汇总，倒计时每拍仍加 `TICK`。
- 该阵营的费用够，并且当前坐标上 `canStand` 为真（没有部署策略时不看这一格），就扣掉 `cost`，`fielded` 收回，`downed` 清掉，生命写成最大生命，坐标不动。
- 元素槽清零。
- 技能按入场重新加上初始技力。
- 回来之后送出 `deploy`。
- 费用不够，或这一格站不住，就留在倒地状态，之后每一拍再试一次，不把倒计时清掉。

- 再部署的规则只有这一条：倒计时走完，本阵营费用够付这名单位的 `cost`，并且当前格子站得住，就在当前坐标满血回来。
- 内容要改落点、等待、费用或保留技力，用 `redeployUnit` 排下一次再部署（见 [模块 · 撤退与再部署](./04-module.md#撤退与再部署)），再部署槽按排下的计划执行；玩家的 `redeploy` 输入只能选落点。
- 引擎不另开分支。
- 倒地落点由部署策略决定。
- 内置策略是 `deploy`，见 [模块 · 部署策略](./04-module.md#部署策略)。
- 再部署用倒地之后已经写下的坐标，不再问一次 `downedTile`。

## 阻挡

`block` 模块在敌人槽跑两次：路线之前，以及路线和泄漏之后、敌人攻击之前。只让友方挡敌人。

- 接触用中心距。
- 地面半径是 `BLOCK_RADIUS`（0.70709997），平方是 `BLOCK_RADIUS_SQ`。
- 飞行敌人用 `BLOCK_RADIUS_FLY`（0.8944）。
- 带 `device` 标签的阻挡者用 `BLOCK_RADIUS_DEVICE`（0.4472）。
- 飞行敌人还要阻挡者带 `block-fly` 标签。
- 地面敌人不能被站在围栏上的单位挡住：阻挡者脚下的格子地面走不过（`walkableBy` 里没有地面）时，不挡地面敌人。

- 多个阻挡者里更近的优先；距离相同，行号小的优先，再比列号。
- 挡上之后就留着，直到阻挡者离场、不能再挡，或敌人不能再被挡。
- 不能再挡是带 `no-block`，不能再被挡是带 `unblockable`；沉睡蕴含这两者。
- 冻结、眩晕、束缚中的敌人照常被挡。
- 放开时如果这名敌人还带着 `stealth`，再施加 `stealthOff`。
- 时长是隐匿状态的强度（大于 0 时），否则是 `STEALTH_RESTORE`（3 秒）。
- 恢复期间，隐匿不挡住选择。

- `blockCnt` 是这名友方还能用的阻挡数，没写按 1，写了走属性汇总。
- `blockWeight` 是这名敌人占的重量，没写按 1。
- 重量加起来超过阻挡数时，丢掉最晚挡上的。
- 新关系送出 `blocked`，放开送出 `unblocked`。
- 结果写回 `blocking` 和 `blockedBy`。
- 快照抄这两份。

没装这个模块时，规格里的 `blocking` / `blockedBy` 保持不动。只要 `blockedBy` 有值，路线这一拍就停住。

## 泄漏

`leak` 模块在敌人移动之后看这名敌人脚下的格子。`objective` 为真就让它离场：`fielded` 清掉，放开阻挡，送出 `leak`。不扣生命，不调用 `finish`。同一名敌人只泄漏一次。

路线终点那一格不是保护目标时，人停在那里，不泄漏。

## 投射物

- `launchProjectile` 从来源的坐标出发，也可以自带出发的 `x`、`y`。
- 缺省速度是 `PROJECTILE_SPEED`（12 格/秒），也可以自带 `speed`。
- 投射物槽每拍朝仍在场上的目标飞一段。
- 目标已倒地、离场或生命不大于 0 时，这一发消掉，不结算。
- `retain` 为真时改为飞向最后看到的坐标，到达后仍结算。

- 剩余距离不超过这一拍的步长，或飞行已满 `PROJECTILE_MAX_AGE`（10 秒），就落在目标当前位置。
- 没有 `attack` 时按 `amount` 走 `physical`。
- 带了 `attack` 时按那份攻击形状结算。
- `returnSpeed` 大于 0 的飞出到达后，从落点再朝来源飞一发，回程不造成伤害；来源已经离场则不飞回。
- 回程记着飞出时的回旋世代。
- 每次部署单位的 `deployEpoch` 加一，回程记的就是它。
- 带 `boomerang` 计时的单位在 `deploy` 时把回旋组件的数量清零；回程的世代对不上时，落地不改这个数。
- `projectiles()` 只列出还在飞的。

普攻在 `attackShape.projectile` 上写了种类时，出手调用这里，速度用种类表。没写种类的普攻仍在命中时直接结算。见 [攻击](./08-attack.md)。

## 位移

- `shift(actionId, unitId, input?)` 执行一段已登记的位移。
- 未知标识拒绝。
- 移不动时返回 false。
- 内置标识是 `push`、`pull`、`fear`、`attract`。
- 再登记一种就 `registerShift`。

- `push` 和 `pull` 这一拍写到落点，送出 `displace`，并放开阻挡。
- 距离看 `force` 减 `massLevel`（属性汇总，没写按 0）。
- 推力表是 `PUSH_TILES`，`effect` 为真时用 `PUSH_TILES_EFFECT`。
- 受力等级 ≤ −3 不动，≥ 3 用 3 这一档。
- `fromX` / `fromY` 是径向起点，`dirX` / `dirY` 是定向。
- 离起点近于 `PUSH_DIRECTIONAL_MIN_DIST`（0.25），或和朝向夹角超过 45°，并且没有 `fixed`，就改成径向并把等级减 2。
- 拉力在等级 ≥ 0 时拉到距中心 `PULL_STOP_RADIUS`（0.6708）；−1 走起点距离的 `PULL_WEAK_SHARE`（0.35）；−2 走 `PULL_CRAWL`（0.03）。
- 没给 `toX` / `toY` 时，可写 `pullerId`：拉到这名单位面前（朝向前方 `PULL_ORIGIN` 格，默认 0.5）；急停中心缺省是它的位置。单位不存在或不写终点也不写 `pullerId` 时不拉。

`ShiftPlan` 可以带 `unbalance`（秒）：这次受力让目标失衡，落点可以就是当前坐标（只失衡、不移动，`shift` 返回 false）。

### 失衡

- 失衡是推、拉之后的状态机，不是效果：没有免疫、不算控制、不动技力。
- 单位上记 `unbalanceUntil`（拍，不含），快照同名字段计入状态，没有失衡时是 `null`。
- 失衡期间不沿路线行走（等待、消失、出现照常推进），恐惧和诱导也停；不开始普攻，冷却停下，前摇中的一下被打断，之后重新走完整个前摇；攻击片段的站定结束。
- 已经在的失衡更长时保留。
- 内容自己的技能、闪现与脚本移动用 `unbalanced(unitId)` 自己判断。

时长（`PUSH_UNBALANCE` 等常量）：推按受力等级 −2 到 3 依次 0.2、0.4、0.8、0.9、32/30、35/30 秒，≤ −3 没有；墙让滑动第一步就停下时按保底 `UNBALANCE_MIN`（0.1 秒）。拉是作用时间：`PULL_UNBALANCE`（1 秒），受力等级低于 −1 时 `PULL_UNBALANCE_WEAK`（0.5 秒），拉不动（已在终点、急停）也持续到作用时间结束；被拉向自己的阻挡者不拉也不失衡。带 `static-body` 的单位受力不动，受力等级不低于 −2 时照样失衡：推按保底，拉按作用时间（不短于保底）。带 `no-displace` 的单位不失衡（失衡免疫）。

失衡在时间到、单位带上 `levitate` 标签（浮空）、路线上的出现，或内容命令 `cutUnbalance(unitId)` 时立刻结束。

- `fear` 和 `attract` 不瞬移。
- 恐惧用扇形里的落点，诱导走向 `toX` / `toY`（地面单位沿格子路径，飞行单位直线）。
- 敌人槽在沿路线之前按汇总后的 `moveSpeed` 走这段路径；无法行动（晕眩等）时这段也停下。
- 带 `fear` 标签而没有恐惧位移（没有来源，或已经走到落点）的单位留在原地，不沿路线走。
- 诱导与 `attract` 效果配合：单位带 `attract` 标签时走到诱导点就停在那里等，不沿路线；标签没了（效果结束或被移除）时没走完的诱导位移作废，接着沿路线。
- 诱导点、时长与是否重新施加由内容决定。
- 倒地时如果这段还没走完，先把坐标写成落点，倒地格读的就是这个坐标。
- 带 `no-displace` 或 `static-body` 标签的单位移不动（静态刚体照样失衡，见上）。
- 只有在场的敌人会被这些动作移动。

### 恐惧落点与诱导路径

这几条计算也从包根导出，给内容和测试直接用。它们只读网格，不改状态：

- `fearReachableTiles(grid, motion, hitX, hitY, sourceX, sourceY, selfFear, goal)`：恐惧的候选落点 `"x,y"`，按行从下到上、列从左到右：以受击点为顶点、背离来源方向的扇形，半径 10 格，半角 45°；只留可通行、不是保护目标的格子，地面单位还要从这里走得到 `goal`（忽略障碍也算）。自己吓自己、没有来源，或来源就在受击点上时为空
- `fearSteps(grid, motion, fromX, fromY, toX, toY, limit)`：四向步数，不超过 `limit`；走不到或目标格被挡时是 `Infinity`
- `planFearMove(grid, motion, x, y, tiles, random)`：从候选里抽一个 5 步以内的落点，抽中太远的会从 `tiles` 里去掉；没抽中就留在自己的格子。落点加上边长 0.5 格的随机偏移，返回落点与要走的路径点
- `attractPoints(grid, motion, x, y, targetX, targetY)`：诱导的路径点：飞行单位直线到目标点；地面单位走流场，走不通时忽略障碍再找

## 身体与朝向

内容判断范围与落点时，用这组函数量单位的身体和朝向。点单位只占所站的一格；带 `hitArea` 的大体型占它的受击矩形。

```ts
import { bodyInRadius, bodyKeys, frontTile } from "arknights-mission-core"

const boss = { x: 2, y: 3, hitArea: { w: 2, h: 2, dx: 0, dy: 0 } }
const span = { x0: 0, y0: 0, x1: 9, y1: 9 }
export const covered = bodyKeys(boss, span)
export const near = bodyInRadius(boss, 4, 3, 1)
export const ahead = frontTile(2, 3, "RIGHT")
```

身体：

- `bodyRect(unit)` 给出大体型的世界矩形；点单位是 `null`。
- `bodyKeys(unit, span)` 给出占据的格子键 `"x,y"`；只擦到边的格子不算，`span` 外的格子不算。
- `bodyOnTile(unit, x, y)` 判断是否占据一格；`bodyInKeys(unit, keys, span)` 判断是否占据任一格。
- `bodyDist(unit, x, y)` 给出点到身体的距离，在矩形内部是 0；`bodyInRadius(unit, x, y, r)` 判断身体是否在点的 r 格以内。

朝向（格子写成 `[行, 列]`）：

- `rotateOffset(dRow, dCol, facing)` 把面向 `RIGHT` 写的偏移转到 `facing`。
- `offsetTile(row, col, dRow, dCol, facing)` 给出按这个偏移走到的格子。
- `frontTile(row, col, facing, steps)` 给出前方 `steps` 格（缺省 1）；为负时在身后。
- `oppositeDirection(facing)` 给出反方向。
