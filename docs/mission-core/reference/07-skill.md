---
title: 技能
description: 技力、充能和触发在 skill-point 上走，技能体在 skill-body 上走，两者和攻击计时分开。
---

# 技能

**技能**由两份计时器驱动：`skill-point` 回复技力并决定何时释放，`skill-body` 推进正在持续的技能体。它们和攻击计时分开。

- 友方带技能且已在场时，开始两份计时器。
- 特性计数的 id 是 `trait`，挂在友方槽。
- `startTimer` 之后每次推进把 `count` 加一。

一次推进只改自己那一份状态。攻击前摇被取消时，技力计时器的相位不动。

## 技力

`spType` 是 `time`、`attack`、`hurt`、`none`，缺省 `time`。`operation` 是 `MANUAL` 或 `AUTO`，缺省 `MANUAL`。`charges` 缺省 1。

`time` 在 `spRecovery` 大于 0 时，每个技力拍加上 `spRecovery × TICK`，技力与消耗的差距在 `READY_EPSILON` 以内算够（见[确定性数学与整帧对齐](../maintain/01-architecture.md#确定性数学)）。`attack` 在 `attack-hit` 时加 1。`hurt` 在 `damaged` 时加 1。下面这些时候不加：

- 技能体是 `passive`
- 正在持续的 `duration`、`ammo`、`toggle`
- 单位带 `no-sp`、路线隐藏、不在场、已倒地，或生命不大于 0
- `hurt`：这次 `damaged` 带 `noSp`

眩晕、冻结、浮空让单位不能行动，不暂停 `time` 的回复。`no-sp` 挡住时间、攻击、受击和 `gainSp`。

技力攒到当前花费得到一层，然后重新累计。层数已满时技力停在这一层的花费上。花费不大于 0 时直接给满层。

当前花费是 `floor(spCost × spCostMul + spCostFlat)`，不低于 0；`spCostMul` 缺省 1，`spCostFlat` 缺省 0，都走属性汇总，可以由效果修饰。两个属性都是缺省值时就是 `spCost`。花费变了之后的下一拍，技力超过花费的部分换成层数，层数满了就停在花费上；变成免费时直接满层。快照的 `spCost` 是当前花费。

单位倒下时，开着的技能（包括被动）以 `death` 结束，修饰随之撤下；被撤下时以 `retreat` 结束。再部署按入场重新打开技能。

`MANUAL` 在开战部署后，以及每次释放后，进入 `AUTO_OP_COOLDOWN`（3 秒）才再次自动释放。`AUTO` 不等。规格刷出时装上技能计时，不加这 3 秒。`castSkill` 不受这层冷却拦住，但会重新开始冷却。

沉默、眩晕、睡眠、未在场、已倒地、生命不大于 0、没有层数，或已经处在持续技能中时，不自动询问。

内容可以用两条命令直接改技能：`readySkill(unitId, skillId)` 把技能补满层，技力停在当前花费上，被动技能不动；`configureSkill(unitId, skillId, { body?, ammo?, duration? })` 换技能体，或改弹药数与持续秒数（负数按 0），只影响之后的释放。找不到单位或技能时两条都什么也不做。

技力视图的 `phase` 是 `recover`、`ready`、`full`、`active`、`passive`、`idle`。

## 触发

`shouldCast(unitId, skillId)` 只问触发条件。自动释放还会再看冷却、层数和能否行动。

- `DEFAULT`：这里的攻击范围只加永久攻击距离 `rangeExtendBase`，不加 `rangeExtend`。治疗技能看攻击范围内有没有生命未满的友方；否则看攻击范围内有没有可选的敌人，自己挡着的敌人不在范围里也算。打不中飞行单位时不包括飞行敌人。普攻的 `attackShape.filters` 不过筛的敌人不算
- `ACTIVE_RANGE`：条件和 `DEFAULT` 相同，只是范围换成触发范围（技能持续时的攻击范围）；没有触发范围时同 `DEFAULT`。触发范围也加 `rangeExtendBase`，技能带 `no-range-extend` 标记时不加。不等攻击
- `SKILL_RANGE`：要求友方时，在触发范围里找生命比例不超过 `triggerHpAtMost` 的受伤友方；没有触发范围则用攻击范围。不要求友方且没有触发范围时同 `DEFAULT`。否则触发范围内有敌人即可，不看不可选中和隐匿，飞行也算
- `TAKE_DAMAGE`：这次 `damaged` 正在询问，带 `noSp` 的不问
- `SP_FULL`：总是满足。`ALWAYS` 归一化成这个 id
- `CUSTOM_RANGE`：没有触发范围时同 `DEFAULT`。否则触发范围内有可选的敌人，飞行也算
- `SEARCH`：条件和 `DEFAULT` 相同
- `GDGLOW_SKILL_2`：治疗技能看场上有没有生命未满的友方；否则看场上有没有可选的敌人，飞行也算
- `NEVER`：不满足。`MANUAL` 归一化成这个 id

`SP_FULL`、`SEARCH`、`CUSTOM_RANGE`、`SKILL_RANGE`、`ACTIVE_RANGE`、`GDGLOW_SKILL_2` 每个技力拍都问。

- 内容可以用 `setTriggerArea(unitId, key, area)` 登记技能触发区域：`area` 是绝对格子，或 `{ unitId }`（那名单位当前的攻击范围），`null` 撤下。
- 区域里有敌人（飞行的也算）时，这名单位的非治疗技能，只要触发不是上面这些每拍问的，也不是 `TAKE_DAMAGE`、`NEVER`，就在这个技力拍按 `DEFAULT` 释放，攻击者也不等攻击。
- 第四个参数 `cadence` 缺省为 `'tick'`。
- 传 `'attack'` 时，这块区域不在每拍判定。
- 这时区域只在下一次普攻之前和 `DEFAULT` 一起判定。
- 带 `no-attack` 的单位每拍判定它。
- 立即生效、本身不是攻击的技能，在每拍判定里释放后，下一次每拍判定至少隔一个攻击间隔；普攻之前的判定不受这条限制。
- `DEFAULT` 等这一拍的攻击会命中再问；单位带 `no-attack` 时不等攻击。
- `TAKE_DAMAGE` 在 `damaged` 时问。

治疗技能的 `triggerHpAtMost` 缺省是 1，也就是不满血即可。

技能的主人治不了的友方不算受伤友方。带 `no-ally-heal` 的友方不算。带 `no-heal` 的友方也不算，除非主人的 `attackShape.healThrough` 选中它。只带 `isolated` 的友方仍算受伤友方。

带 `ally-target` 的友方在上面的敌人条件里算作敌人，前提是这个技能能开在它身上。治疗技能和被动技能不能。`allyTargets` 写了就照它。没写时，单位会攻击，且技能是持续技能或带 `hit` 钩子（下一次攻击），才能。

- 带 `triggerAllies` 的 `DEFAULT` 技能在普攻之前只看友方条件，不要求范围里有敌人。
- `castWithoutEnemy` 缺省为真（带 `triggerAllies` 且触发为 `DEFAULT` 时）。
- 为真时，普攻没有目标也会问这个技能：友方条件满足就释放，替换这一下普攻。
- 带 `hit` 钩子的技能把友方条件选中的友方作为这一下的目标，这一下不结算伤害，钩子在它的 `attack-hit` 上执行。
- 写 `false` 的技能要等到有敌人的那一下普攻。

治疗技能带 `triggerEnemies` 时，基础条件里范围内有敌人也满足。既打敌人又治疗友方的技能用它。未知触发标识拒绝创建。

登记一个新触发：

```ts
import type { MissionModule } from "arknights-mission-core"

export const fullField: MissionModule = {
  id: "full-field",
  install(reg) {
    reg.registerSkillTrigger({
      id: "FULL_FIELD",
      shouldCast(unitId, _skillId, ctx) {
        return ctx.select("enemy", ctx.unitsInRange(unitId, "all")).length > 0
      },
    })
  },
}
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

`gainSp(unitId, skillId, amount, options?)` 从外界加技力。被动、正在持续的 `duration` / `ammo` / `toggle`、带 `no-sp`、花费不大于 0，或层数和技力都已经满了时返回 0。否则返回传入的数量。`options.ignoreLock` 为真时不看持续期间的锁定与 `no-sp`。

技能修饰在技能生效期间参加属性汇总。快照叠这些修饰时跳过当前生命。持续结束时先跑 `onEnd`，再撤下修饰。
