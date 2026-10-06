---
title: 攻击
description: 攻击是单位身上的 attack 计时器，按攻速走前摇、命中和后摇，命中时用选择器选一个目标并结算伤害。
---

# 攻击

计时器 id 是 `attack`。`startTimer(unitId, "attack")` 之后才推进。友方在友方槽，敌人在敌人槽。两边用同一份间隔和片段，和 `skill-point`、`skill-body` 分开。

## 间隔

没写基础攻速时按 100 再加修饰，然后夹到 20 和 600。基础攻速同样夹在这个区间。

```text
间隔 = bat × max(0.1, 1 + batPct) × 100 / 攻速
```

`bat` 缺省或不是正数时用 1。秒数在计时器里按 `TICK`（1/30 秒）扣。

## 片段

`UnitSpec.attackClip` 的 `duration` 和 `hit` 是秒。`hit` 夹在 0 和 `duration` 之间，不是有限数则用 `duration` 的一半。

没有片段，或 `duration` 不大于 0：前摇是 0，命中后停 0.35 秒。

有片段时，间隔大于 0 且小于 `duration`，播放速度是 `duration / 间隔`，前摇是 `hit / 速度`，命中后停 `(duration - hit) / 速度`。否则速度是 1，前摇和停顿就是片段上的秒数。

## 相位

视图里的 `phase` 是 `idle`、`windup`、`recovery`。

空闲和停顿里，冷却每拍减少 1/30 秒。冷却降到前摇以内，且选择器找得到目标时，进入前摇或直接出手。前摇里若冷却还没走完，就继续减冷却，走到 0 再出手。若前摇大于 0 且冷却已经是 0，就按经过时间走到前摇再出手。出手后进入 `recovery`，冷却设为攻击间隔，并停上面算出的那段时间。停顿走完回到 `idle`。

没有合法目标时不开始这一下，冷却保持不动。出手时选择器已经没有目标，则回到 `idle`，冷却也归零。

眩晕、睡眠、未在场、已倒地、路线隐藏或生命不大于 0 时，冷却不减少，前摇不推进。已经在停顿里的时间仍会走完，然后回到 `idle`。

## 取消

状态定义的 `cancels` 含有 `attack` 时，施加会把阶段回到 `idle`，`elapsed` 和前摇进度归零，冷却保留。这类状态还在身上时，不再进入新的出手。眩晕和睡眠还会停住冷却。

内置会取消攻击的状态：`stun`、`freeze`、`sleep`、`silence`、`fear`、`disarm`、`levitate`，以及 `element:neural-ally`。`noSp` 只停技力，不取消攻击。

敌人身上有麻痹时，这一下不出手，消耗一层麻痹，进入 `recovery`，停 0.35 秒，冷却设为当前间隔。友方普攻不吃麻痹。

## 出手

取选择器链的第一个单位，按攻击力造成 `physical` 伤害，并送出 `attack-hit`。

友方的链是 `enemy`、`fly`、`stealth`、`sleep`、`untargetable`、`isolated`、`range`、`block`、`priority`、`taunt`、`remaining`、`distance`、`spawn`。

敌人的链是 `ally`、`sleep`、`stealth`、`camouflage`、`liftoff`、`untargetable`、`isolated`、`range`、`block`、`priority`、`taunt`、`aggro`、`distance`。

各键的含义见 [选择器](./selector.md)。
