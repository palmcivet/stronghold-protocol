---
title: 攻击
description: 攻击是单位身上的 attack 计时器。出手时按 attackShape 结算溅射、弹射、治疗、锁定范围和投射物。
---

# 攻击

计时器 id 是 `attack`。`startTimer(unitId, "attack")` 之后才推进。友方在友方槽，敌人在敌人槽。两边用同一份间隔和片段，和 `skill-point`、`skill-body` 分开。

## 间隔

没写基础攻速时按 100 再加修饰，然后夹到 20 和 600。基础攻速同样夹在这个区间。

```text
间隔 = bat × max(0.1, 1 + batPct) × 100 / 攻速
```

`bat` 缺省或不是正数时用 1。秒数在计时器里按 `TICK`（1/30 秒）扣，剩余在 `READY_EPSILON` 以内记为 0，前摇与后摇的比较差距在容差以内算到达（见[确定性数学与整帧对齐](./kernel.md)）。

## 片段

`UnitSpec.attackClip` 的 `duration` 和 `hit` 是秒。`hit` 夹在 0 和 `duration` 之间，不是有限数则用 `duration` 的一半。

没有片段，或 `duration` 不大于 0：前摇是 0，命中后停 0.35 秒。

有片段时，间隔大于 0 且小于 `duration`，播放速度是 `duration / 间隔`，前摇是 `hit / 速度`，命中后停 `(duration - hit) / 速度`。否则速度是 1，前摇和停顿就是片段上的秒数。

## 相位

视图里的 `phase` 是 `idle`、`windup`、`recovery`。

空闲和停顿里，冷却每拍减少 1/30 秒。冷却降到前摇以内，且选择器找得到目标时，进入前摇或直接出手。前摇里若冷却还没走完，就继续减冷却，走到 0 再出手。若前摇大于 0 且冷却已经是 0，就按经过时间走到前摇再出手。出手后进入 `recovery`，冷却设为攻击间隔，并停上面算出的那段时间。停顿走完回到 `idle`。

没有合法目标时不开始这一下，冷却保持不动。`setAttackTargetThisTick(unit, false)` 和没有目标一样：不开始前摇，已经在前摇里的这一拍回到 `idle`，不出手。出手时选择器已经没有目标，则回到 `idle`，冷却也归零。

眩晕、睡眠、未在场、已倒地、路线隐藏或生命不大于 0 时，冷却不减少，前摇不推进。已经在停顿里的时间仍会走完，然后回到 `idle`。

## 取消

状态定义的 `cancels` 含有 `attack` 时，施加会把阶段回到 `idle`，`elapsed` 和前摇进度归零，冷却保留。这类状态还在身上时，不再进入新的出手。眩晕和睡眠还会停住冷却。

内置会取消攻击的状态：`stun`、`freeze`、`sleep`、`silence`、`fear`、`disarm`、`levitate`，以及 `element:neural-ally`。`noSp` 只停技力，不取消攻击。

`tremble` 不取消攻击计时器。`blockedBy` 有值的这一拍停在当前阶段、不出手，冷却仍减少。没有阻挡者时照常出手。

敌人身上有麻痹时，这一下不出手，消耗一层麻痹，进入 `recovery`，停 0.35 秒，冷却设为当前间隔。友方普攻不吃麻痹。

## 出手

出手时读 `readAttackTiming`。`canAttack` 为假则这一下不打，阶段回到 `idle`，冷却归零。`damageScale` 乘在攻击力上。`hitCount` 是主目标身上的结算次数，缺省 1。打出去之后调用 `consumeAttackTiming`，并送出 `attack-hit`。

没有 `attackShape` 时，取选择器链的第一个单位，造成 `physical` 伤害。

`attackShape` 上的字段可以同时存在。`damage` 是 `physical`、`arts` 或 `heal`，缺省 `physical`。`heal` 改选受伤的同阵营单位，生命比例低的在前。

| 字段 | 结算 |
| --- | --- |
| `splash` | 以落点为圆心，按站位中心量半径。`othersOnly` 为真时主目标吃未乘倍率的一击，其他人吃 `scale`（缺省 1）。为假时圈内每个人，包括主目标，只吃 `scale`。`groundOnly` 跳过飞行单位。攻击者打不到飞行单位时，溅射也不打。 |
| `bounce` | 从主目标再跳到附近的对方单位。`count` 含主目标。第 k 跳的倍率是 `(1 - falloff) ^ k`。`pause` 大于 0 时，主目标和每一跳获得这么多秒的 `sluggish`。 |
| `chain` | 从主目标再治疗附近的同阵营。半径缺省 `CHAIN_HEAL_RADIUS`（2.5 格）。`count` 含主目标，衰减和弹射同一写法。 |
| `healCount` | 同时治疗这么多个受伤的同阵营单位。没写时是 1。 |
| `lockRange` | 范围内每个可选目标立刻命中。和 `projectile` 一起写时也不飞弹。 |
| `projectile` | 出手时 `launchProjectile`。速度见 `PROJECTILE_KIND_SPEEDS`：`arrow` 14、`bolt` 11、`orb` 10、`bomb` 8、`boomerang` 15，单位是格/秒。到达后才结算。`bomb` 带了溅射时，目标中途离场仍在最后坐标结算；其余种类目标离场则消掉。`boomerang` 再按 `BOOMERANG_RETURN_SPEED`（3.75）飞回，回程不造成伤害。投掷者已经离场则不再飞回。 |

飞行中的回旋数量写在单位的 `boomerangsOut`，并抄进属性 `boomerangsOut`。能不能因此停手由 `readAttackTiming` 决定。

再加一种形状时，在 `AttackShape` 上加可选字段，并 `registerAttackResolver` 登记结算函数。新的投射物速度写进 `PROJECTILE_KIND_SPEEDS`，目标离场后是否仍落下写进 `PROJECTILE_RETAIN`，飞回速度写进 `PROJECTILE_RETURN_SPEEDS`。

友方的链是 `enemy`、`fly`、`stealth`、`sleep`、`untargetable`、`isolated`、`range`、`block`、`priority`、`taunt`、`remaining`、`distance`、`spawn`。

敌人的链是 `ally`、`sleep`、`stealth`、`camouflage`、`liftoff`、`untargetable`、`isolated`、`range`、`block`、`priority`、`taunt`、`aggro`、`distance`。

各键的含义见 [选择器](./selector.md)。
