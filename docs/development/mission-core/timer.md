---
title: 计时
description: 充能、弹药和回旋持有是单位身上各自的计时器，在友方槽里排在攻击之后，按 timerRate 推进。
---

# 计时

独立计时和 `attack`、`skill-point`、`skill-body`、`trait`、`redeploy`、`status` 分开。单位规格的 `timers` 列出 id，引擎调用 `startTimer`。友方槽按登记顺序推进，这三条排在该单位的攻击之后。没有新的阶段槽。

再登记一种，就再 `registerTimer`，`slot` 用 `ally`，把 id 写进单位的 `timers`。`advance` 里加上 `independentDt(unit, registry)`。友方槽不会按单位种类分支。定义可以写 `sides`。没写时两边都能 `startTimer`。这三条写了 `sides: ["ally"]`，点在敌人身上，或对敌人调用 `startTimer`，都不会启动，视图保持 `{ started: false }`。攻击计时没有 `sides`，敌人槽照常推进已经开始的攻击。

## 速度

属性 `timerRate` 缺省 `TIMER_RATE`（1）。本拍推进的秒数是 `TICK * timerRate`。没写这个键时按 1，状态仍可以修饰它。`mul` 0.5 把钟放慢一半，`mul` 2 加快一倍。三种内置计时都走这一条，不用在各自的 `advance` 里再写一遍。

## 充能

id 是 `charge`。视图有 `stored`、`elapsed`。`stored` 从 0 起，上限是属性 `times`，缺省 `CHARGE_CAP`（3）。

攻击推进之后，单位还能行动、攻击冷却已经是 0、这一拍没有目标、层数没满，才把 `independentDt` 加进 `elapsed`。满一个攻击间隔，`stored` 加 1，多出来的累加留下。不能行动、冷却还没到、这一拍有目标，累加停住，不清零。

还能行动：在场、未倒地、生命大于 0、没有路线隐藏、没有眩晕或睡眠。攻击间隔与攻击计时相同。

这一拍有没有目标，先看 `setAttackTargetThisTick(unit, present)`。这一拍没人写，就用和这次攻击相同的目标名单：治疗形状看受伤友方，敌人看敌方那条链。`false` 也打断已经开始的前摇，这一拍不再出手。标记在友方计时和敌人攻击走完后清掉。

## 弹药

id 是 `ammo`。视图有 `ammo`、`elapsed`。启动和每次 `deploy` 时补到上限。上限是属性 `ammoMax`，缺省 `AMMO_CAP`（8）。

离上次消耗至少 1 秒，并且还没满，`elapsed` 才按 `independentDt` 增加。否则 `elapsed` 归零。满 1 秒加 1 发。这 1 秒的门槛按战场时间算，`timerRate` 只加快门槛打开之后的累加。

## 回旋持有

id 是 `boomerang`。视图有 `out`、`elapsed`。`elapsed` 按 `independentDt` 走。飞行中的数量读单位上的 `boomerangsOut`，攻击形状写入这个字段，并抄到属性 `boomerangsOut`。这里不发射、不命中、不飞回。

`deploy` 时，带了这条计时的单位把 `boomerangsOut` 写成 0，并把回旋世代加一。飞出时记下世代。回程落地只在世代对得上时把数量减一。世代对不上的回旋落地不改这个数。

## 出手

```ts
interface AttackTiming {
  canAttack: boolean
  hitCount: number
  damageScale: number
}

function readAttackTiming(unit): AttackTiming
function consumeAttackTiming(unit): void
```

`readAttackTiming` 不改状态。

| 字段 | 值 |
| --- | --- |
| `canAttack` | 弹药计时已开始且剩余不大于 0，或 `boomerangsOut` 大于 0 时为 false。都没有时为 true |
| `hitCount` | 充能计时已开始时是 `1 + stored`，否则是 1 |
| `damageScale` | 弹药计时已开始并且这一发还在时，读 `atk_scale`，缺省 `AMMO_SCALE`（1.2），走属性汇总。否则是 1 |

`consumeAttackTiming` 在这一下已经打出之后调用。充能的 `stored` 归零，累加保留。弹药减 1，并记下这一拍是上次攻击。攻击在出手后调用它。
