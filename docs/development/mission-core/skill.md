---
title: 技能
description: 技力、充能和触发在 skill-point 上走，技能体在 skill-body 上走，两者和攻击计时分开。
---

# 技能

友方带技能且已在场时，开始两份计时器。`skill-body` 推进正在持续的技能体。`skill-point` 回复技力，并按触发决定是否释放。特性计数的 id 是 `trait`，挂在友方槽。`startTimer` 之后每次推进把 `count` 加一。

一次推进只改自己那一份状态。攻击前摇被取消时，技力计时器的相位不动。

## 技力

`spType` 是 `time`、`attack`、`hurt`、`none`，缺省 `time`。`operation` 是 `MANUAL` 或 `AUTO`，缺省 `MANUAL`。`charges` 缺省 1。

`time` 在 `spRecovery` 大于 0 时，每个技力拍加上 `spRecovery × TICK`，技力与消耗的差距在 `READY_EPSILON` 以内算够（见[确定性数学与整帧对齐](./kernel.md)）。`attack` 在 `attack-hit` 时加 1。`hurt` 在 `damaged` 时加 1。下面这些时候不加：

- 技能体是 `passive`
- 正在持续的 `duration`、`ammo`、`toggle`
- 单位带 `noSp`、路线隐藏、不在场、已倒地，或生命不大于 0

眩晕、冻结、浮空让单位不能行动，不暂停 `time` 的回复。`noSp` 挡住时间、攻击、受击和 `gainSp`。

技力攒到 `spCost` 得到一层，然后重新累计。层数已满时技力停在这一层的花费上。`spCost` 不大于 0 时直接给满层。

`MANUAL` 在开战部署后，以及每次释放后，进入 `AUTO_OP_COOLDOWN`（3 秒）才再次自动释放。`AUTO` 不等。规格刷出时装上技能计时，不加这 3 秒。`castSkill` 不受这层冷却拦住，但会重新开始冷却。

沉默、眩晕、睡眠、未在场、已倒地、生命不大于 0、没有层数，或已经处在持续技能中时，不自动询问。

技力视图的 `phase` 是 `recover`、`ready`、`full`、`active`、`passive`、`idle`。

## 触发

`shouldCast(unitId, skillId)` 只问触发条件。自动释放还会再看冷却、层数和能否行动。

| id | 何时算满足 |
| --- | --- |
| `DEFAULT` | 治疗技能看攻击范围内有没有生命未满的友方；否则看攻击范围内有没有可选的敌人。打不中飞行单位时不包括飞行敌人 |
| `SKILL_RANGE` | 要求友方时，在触发范围里找生命比例不超过 `triggerHpAtMost` 的受伤友方；没有触发范围则用攻击范围。不要求友方且没有触发范围时同 `DEFAULT`。否则触发范围内有敌人即可，不看不可选中和隐匿，飞行也算 |
| `TAKE_DAMAGE` | 这次 `damaged` 正在询问 |
| `SP_FULL` | 总是满足。`ALWAYS` 归一化成这个 id |
| `CUSTOM_RANGE` | 没有触发范围时同 `DEFAULT`。否则触发范围内有可选的敌人，飞行也算 |
| `SEARCH` | 条件和 `DEFAULT` 相同 |
| `GDGLOW_SKILL_2` | 治疗技能看场上有没有生命未满的友方；否则看场上有没有可选的敌人，飞行也算 |
| `NEVER` | 不满足。`MANUAL` 归一化成这个 id |

`SP_FULL`、`SEARCH`、`CUSTOM_RANGE`、`SKILL_RANGE`、`GDGLOW_SKILL_2` 每个技力拍都问。`DEFAULT` 等这一拍的攻击会命中再问；单位带 `noAttack` 时不等攻击。`TAKE_DAMAGE` 在 `damaged` 时问。

治疗技能的 `triggerHpAtMost` 缺省是 1，也就是不满血即可。未知触发标识拒绝创建。

登记一个新触发：

```ts
reg.registerSkillTrigger({
  id: "FULL_FIELD",
  shouldCast(unitId, skillId, ctx) {
    return ctx.select("enemy", ctx.unitsInRange(unitId, "all")).length > 0
  },
})
```

## 技能体

内置 id 是 `duration`、`ammo`、`instant`、`charges`、`passive`、`toggle`。包根的 `BUILTIN_SKILL_BODIES` 就是这份名单。

| id | 行为 |
| --- | --- |
| `duration` | 从 `duration` 秒开始倒数，至少按 0.01 秒起算，到 0 结束 |
| `ammo` | 至少 1 发。攻击命中时弹药减一，到 0 结束。`duration` 大于 0 时同时倒数 |
| `instant` | 释放后立刻结束。规格写了 `onHit` 时，等到下一次 `attack-hit` 再结束 |
| `charges` | 与 `instant` 相同 |
| `passive` | 装上时生效并一直保持 |
| `toggle` | 释放后保持打开 |

`instant` 或 `charges` 在等待命中，并且触发还要求受伤友方时，条件不再满足就撤回，并还回一层。`SKILL_RANGE` 不撤回。

`castSkill(unitId, skillId)` 不另问触发。有层数、在场、生命大于 0，且没有处在持续技能中时，消耗一层并释放。

`gainSp(unitId, skillId, amount)` 从外界加技力。被动、正在持续的 `duration` / `ammo` / `toggle`、带 `noSp`、花费不大于 0，或层数和技力都已经满了时返回 0。否则返回传入的数量。

技能修饰在技能生效期间参加属性汇总。快照叠这些修饰时跳过当前生命。持续结束时先跑 `onEnd`，再撤下修饰。
