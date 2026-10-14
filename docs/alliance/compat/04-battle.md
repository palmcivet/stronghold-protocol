---
title: 战斗规格适配
description: 兼容层怎样把 master 的 b.start 规格与关卡地图收成 mission-core 的 BattleSpec。
---

# 战斗规格适配

客户端在兼容模式下演算 master 开出的战斗时，`alliance/compat/upstream/battle` 把 `b.start.spec` 与关卡地图收成 `mission-core` 的 `BattleSpec`。入口是 `battleSpecOf`；关卡瓦片与装置来自 `stageMapOf`。

干员与敌人的数值、技能体来自 `combat-def`。技能记录会装成 `SkillSpec`（SP、触发、属性修正）；自定义黑板 hooks / 未知 trigger 的 skill kit 仍由内容与 ECS 一线补齐，不在本适配层发明行为。

## 地块

每个瓦片写入 `TileSpec`：

- 有官方地形 id 时写 `terrain`（如泥沼、烟雾等）
- 关卡级的 `special` 块整份放进 `BattleSpec.notes.special`，不摊进单个瓦片字段

## 风机

关卡装置里角色为风机（`blower`）且激活的，编成带 `blower` 标签的装置单位（`kind: device`）：

- 作用格换成按朝向的攻击范围（装置已带 `attackRange` 时用之，否则默认朝右三格）
- 技能黑板放进该单位的 `script`
- 朝向取装置的 `facing`

## 与舞台的关系

适配出的 `BattleSpec` 交给客户端播放层（`match/playback`）推进；快照与事件再进战场舞台，见 [战场](../client/14-field.md)。
