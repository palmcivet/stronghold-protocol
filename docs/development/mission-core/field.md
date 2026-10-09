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

生命到 0 时引擎启动 `redeploy` 计时器，并把已经走过的秒数清零。装了 `redeploy` 模块后，再部署槽只推进还倒着的单位。`respawnTime` 是秒，缺省 0，表示倒地的这一拍就可以回来。

秒数走完之后计时器停住。等待秒数是 `respawnTime × redeployMul`。`redeployMul` 缺省 1，走属性汇总，倒计时每拍仍加 `TICK`。该阵营的费用够，并且当前坐标上 `canStand` 为真（没有部署策略时不看这一格），就扣掉 `cost`，`fielded` 收回，`downed` 清掉，生命写成最大生命，坐标不动。元素槽清零。技能按入场重新加上初始技力。然后送出 `deploy`。费用不够，或这一格站不住，就留在倒地状态，之后每一拍再试一次，不把倒计时清掉。

再部署只有这一条：倒计时走完，本阵营费用够付这名单位的 `cost`，并且当前格子站得住，就在当前坐标满血回来。要改回场条件的盟约写在内容模块里，引擎不另开分支。倒地落点由部署策略决定。内置策略是 `deploy`，见 [模块](./module.md)。再部署用倒地之后已经写下的坐标，不再问一次 `downedTile`。

## 阻挡

`block` 模块在敌人槽跑两次：路线之前，以及路线和泄漏之后、敌人攻击之前。只让友方挡敌人。

接触用中心距。地面半径是 `BLOCK_RADIUS`（0.70709997），平方是 `BLOCK_RADIUS_SQ`。飞行敌人用 `BLOCK_RADIUS_FLY`（0.8944）。带 `device` 标签的阻挡者用 `BLOCK_RADIUS_DEVICE`（0.4472）。飞行敌人还要阻挡者带 `blockFly` 标签或同名旗标。地面敌人不能被站在围栏上的单位挡住：阻挡者脚下的格子地面走不过（`walkableBy` 里没有地面）时，不挡地面敌人。

多个阻挡者里更近的优先；距离相同，行号小的优先，再比列号。挡上之后就留着，直到阻挡者离场、不能再挡，或敌人不能再被挡。不能再挡包括 `noBlock` 和 `sleep`。不能再被挡包括 `unblockable` 和 `sleep`。放开时如果这名敌人还带着 `stealth`，再施加 `stealthOff`。时长是隐匿状态的强度（大于 0 时），否则是 `STEALTH_RESTORE`（3 秒）。这段时间里隐匿不挡住选择。

`blockCnt` 是这名友方还能用的阻挡数，没写按 1，写了走属性汇总。`blockWeight` 是这名敌人占的重量，没写按 1。重量加起来超过阻挡数时，丢掉最晚挡上的。新关系送出 `blocked`，放开送出 `unblocked`。结果写回 `blocking` 和 `blockedBy`。快照抄这两份。

没装这个模块时，规格里的 `blocking` / `blockedBy` 保持不动。只要 `blockedBy` 有值，路线这一拍就停住。

## 泄漏

`leak` 模块在敌人移动之后看这名敌人脚下的格子。`objective` 为真就让它离场：`fielded` 清掉，放开阻挡，送出 `leak`。不扣生命，不调用 `finish`。同一名敌人只泄漏一次。

路线终点那一格不是保护目标时，人停在那里，不泄漏。

## 投射物

`launchProjectile` 从来源的坐标出发，也可以自带出发的 `x`、`y`。缺省速度是 `PROJECTILE_SPEED`（12 格/秒），也可以自带 `speed`。投射物槽每拍朝仍在场上的目标飞一段。目标已倒地、离场或生命不大于 0 时，这一发消掉，不结算。`retain` 为真时改为飞向最后看到的坐标，到达后仍结算。

剩余距离不超过这一拍的步长，或飞行已满 `PROJECTILE_MAX_AGE`（10 秒），就落在目标当前位置。没有 `attack` 时按 `amount` 走 `physical`。带了 `attack` 时按那份攻击形状结算。`returnSpeed` 大于 0 的飞出到达后，从落点再朝来源飞一发，回程不造成伤害；来源已经离场则不飞回。回程记着飞出时的回旋世代。带 `boomerang` 计时的单位在 `deploy` 时把 `boomerangsOut` 清零并把世代加一，回程的世代对不上时，落地不改这个数。`projectiles()` 只列出还在飞的。

普攻在 `attackShape.projectile` 上写了种类时，出手调用这里，速度用种类表。没写种类的普攻仍在命中时直接结算。见 [攻击](./attack.md)。

## 位移

`shift(actionId, unitId, input?)` 执行一段已登记的位移。未知标识拒绝。移不动时返回 false。内置标识是 `push`、`pull`、`fear`、`attract`。再登记一种就 `registerShift`。

`push` 和 `pull` 这一拍写到落点，送出 `displace`，并放开阻挡。距离看 `force` 减 `massLevel`（属性汇总，没写按 0）。推力表是 `PUSH_TILES`，`effect` 为真时用 `PUSH_TILES_EFFECT`。受力等级 ≤ −3 不动，≥ 3 用 3 这一档。`fromX` / `fromY` 是径向起点，`dirX` / `dirY` 是定向。离起点近于 `PUSH_DIRECTIONAL_MIN_DIST`（0.25），或和朝向夹角超过 45°，并且没有 `fixed`，就改成径向并把等级减 2。拉力在等级 ≥ 0 时拉到距中心 `PULL_STOP_RADIUS`（0.6708）；−1 走起点距离的 `PULL_WEAK_SHARE`（0.35）；−2 走 `PULL_CRAWL`（0.03）。

`fear` 和 `attract` 不瞬移。恐惧用扇形里的落点，诱导走向 `toX` / `toY`。敌人槽在沿路线之前按汇总后的 `moveSpeed` 走这段路径。倒地时如果这段还没走完，先把坐标写成落点，倒地格读的就是这个坐标。`noDisplace` 或 `staticBody` 标签的单位移不动。只有在场的敌人会被这些动作移动。
