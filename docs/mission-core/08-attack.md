---
title: 攻击
description: 攻击是单位身上的 attack 计时器。出手时按 attackShape 结算溅射、弹射、治疗、锁定范围和投射物。
---

# 攻击

**攻击**是单位身上的 `attack` 计时器。间隔走完时单位出手，按 `attackShape` 结算溅射、弹射、治疗、锁定范围与投射物。

计时器 id 是 `attack`。`startTimer(unitId, "attack")` 之后才推进。友方在友方槽，敌人在敌人槽。两边用同一份间隔和片段，和 `skill-point`、`skill-body` 分开。

## 间隔

没写基础攻速时按 100 再加修饰，然后夹到 20 和 600。基础攻速同样夹在这个区间。

```text
间隔 = bat × max(0.1, 1 + batPct) × 100 / 攻速
```

`bat` 缺省或不是正数时用 1。秒数在计时器里按 `TICK`（1/30 秒）扣，剩余在 `READY_EPSILON` 以内记为 0，前摇与后摇的比较差距在容差以内算到达（见[确定性数学与整帧对齐](./16-architecture.md#确定性数学)）。

## 片段

`UnitSpec.attackClip` 的 `duration` 和 `hit` 是秒。`hit` 夹在 0 和 `duration` 之间，不是有限数则用 `duration` 的一半。

没有片段，或 `duration` 不大于 0：前摇是 0，命中后停 0.35 秒。

有片段时，间隔大于 0 且小于 `duration`，播放速度是 `duration / 间隔`，前摇是 `hit / 速度`，命中后停 `(duration - hit) / 速度`。否则速度是 1，前摇和停顿就是片段上的秒数。

## 相位

视图里的 `phase` 是 `idle`、`windup`、`recovery`。

- 空闲和停顿里，冷却每拍减少 1/30 秒。
- 冷却降到前摇以内，且选择器找得到目标时，进入前摇或直接出手。
- 前摇里若冷却还没走完，就继续减冷却，走到 0 再出手。
- 若前摇大于 0，而冷却在这一拍之前就已经在前摇以内（没有目标时冷却走到底、前摇被晕眩或缴械打断后冷却停在中途），就从头按经过时间走完整个前摇再出手。
- 出手后进入 `recovery`，冷却设为攻击间隔，并停上面算出的那段时间。
- 停顿走完回到 `idle`。

没有合法目标时不开始这一下，冷却保持不动。`setAttackTargetThisTick(unit, false)` 和没有目标一样：不开始前摇，已经在前摇里的这一拍回到 `idle`，不出手。出手时选择器已经没有目标，则回到 `idle`，冷却也归零。

眩晕、睡眠、未在场、已倒地、路线隐藏或生命不大于 0 时，冷却不减少，前摇不推进。已经在停顿里的时间仍会走完，然后回到 `idle`。

## 取消

状态定义的 `cancels` 含有 `attack` 时，施加会把阶段回到 `idle`，`elapsed` 和前摇进度归零，冷却保留。这类状态还在身上时，不再进入新的出手。眩晕和睡眠还会停住冷却。

内置会取消攻击的状态：`stun`、`freeze`、`sleep`、`silence`、`fear`、`disarm`、`levitate`，以及 `element:neural-ally`。带 `no-sp` 标签只停技力，不取消攻击。

`tremble` 不取消攻击计时器。`blockedBy` 有值的这一拍停在当前阶段、不出手，冷却仍减少。没有阻挡者时照常出手。

敌人身上有麻痹时，这一下不出手，消耗一层麻痹，进入 `recovery`，停 0.35 秒，冷却设为当前间隔。友方普攻不吃麻痹。

## 敌人站定

- 敌人出手后站到攻击片段放完：命中时记下站到哪一拍（命中的拍加上面算出的停顿秒数折成拍，可以带小数）。
- 被麻痹打断的那一下，没被阻挡、攻击范围不为空的敌人站 0.35 秒。
- 被阻挡的敌人本来就不走，站定只在阻挡解除后起作用。
- 没被阻挡、攻击范围不为空的敌人在前摇里也站着，冷却在这一拍降到前摇以内、即将进入前摇时同样停下（移动先于出手结算）。
- 带 `attack-moves` 标签（不停止移动）的敌人前后都不站。

站定只停住路线上的行走，等待照常计时，消失与出现照常发生。无法行动（晕眩、冻结、沉睡、浮空）、路线消失、倒下或离场、被位移时，站定作废。恐惧时不站也不显示，站定仍然记着。无法行动且没有消失的敌人不推进路线，等待也不计时；推拉的滑行照常。

快照的 `components["attack:stand"]` 给画面用，类型是导出的 `AttackStandView`：`until` 是站到哪一拍（没有站定或正在恐惧时是 null），`cutAt` 是站定最近一次被作废的拍。只在敌人出过手之后出现。

## 出手

- 出手时读 `readAttackTiming`。
- `canAttack` 为假则这一下不打，阶段回到 `idle`，冷却归零。
- `damageScale` 乘在攻击力上。
- `hitCount` 是主目标身上的结算次数，缺省 1。
- 打出去之后调用 `consumeAttackTiming`，并送出 `attack-hit`。

`forceAttack(unitId, targetIds?, { noAmmo? })` 是内容要求的额外一下：不看也不动攻击计时，`targetIds` 缺省按普攻选目标（只留在场的），照样经过 `attack` 拦截、按片段的倍率与段数结算、用掉片段、送出 `attack-hit`，所以技力与弹药照普攻算。`noAmmo`（参数或拦截里改成真）时弹药技能不用掉这一发、不送 `ammo-used`，最后一发也不因此结束技能。打出去返回 true；单位不在场、没有目标或被取消时返回 false。

## 没有目标时的替代

普攻到了出手时点却没有目标时，引擎按注册先后问 `registerAttackSubstitute` 注册的普攻替代。第一个返回非空目标表的替代给出这一下的目标。

```ts
import type { MissionModule } from "arknights-mission-core"

export const decoy: MissionModule = {
  id: "decoy",
  install(ctx) {
    ctx.registerAttackSubstitute({
      id: "decoy:dummy",
      offer: (unitId) => (unitId === "g" ? ["p"] : []),
    })
  },
}
```

- 替代在冷却、控制、缴械与 `canAttack` 的检查之后问，所以这一下仍按普攻的节奏。
- 替代给出的一下照样经过 `attack` 拦截，拦截数据带 `substitute: true`。
- 这一下不结算伤害。它用掉片段，送出带 `substitute: true` 与 `targetIds` 的 `attack-hit`，技力与弹药照普攻算。
- 出手时目标都已离场的，这一下不打。
- 同一个 id 注册两次时抛错。

引擎自己注册了 `skill:ally-cast`，排在模块的前面，规则见 [技能](./07-skill.md)。

## 附加段

**附加段**是跟在一次普攻本体之后的几段伤害，如驭械术师的浮游单元。`registerAttackSegment` 注册附加段。

```ts
import type { MissionModule } from "arknights-mission-core"

export const spark: MissionModule = {
  id: "spark",
  install(ctx) {
    ctx.registerAttackSegment({
      id: "spark:echo",
      segments: (attackerId) =>
        attackerId === "g" ? { hits: 1, scale: 0.5, tags: ["echo"] } : null,
    })
  },
}
```

- 普攻落到单个目标上时，引擎按注册先后问每个附加段，返回 `null` 的不附加
- 附加段在本体的每一下之后结算，每段的数额是这一击的攻击伤害乘 `scale`，种类缺省与本体相同
- 附加段不算普攻：`dealDamage` 不带 `attack`，伤害标签带上 `tags` 与 `addition`（`ADDITION_TAG`）
- 有附加段时，本体与附加段共用一个 `attackId`，`hit` 与 `damaged` 都带它；没有附加段的普攻不带
- 一次普攻只送出一次 `attack-hit`，技力与弹药只算一次
- 目标在本体或某一段之后倒下或离场时，余下的段作废，不转给别的目标
- 投射物到达时目标已经离场的，本体与附加段都不落下
- 治疗攻击不带附加段；溅射、弹射波及的其他单位不带附加段
- `scale` 不是有限正数或 `hits` 不足 1 时略过
- 同一个 id 注册两次时抛错

### 官方浮游单元

`officialFunnelModule`（id `official-funnel`）给带 `FUNNEL` 标签（id `funnel`）的单位附加浮游单元。

- 每次普攻附加 `funnelDrones` 段，伤害标签 `funnel`
- 倍率按目标递增：换了目标是 `funnelInit`，同一目标每次加 `funnelDelta`，到 `funnelMax` 为止
- 再部署时递增清零，下一次从 `funnelInit` 起算
- 参数从单位的 `script` 读，没写时用 `FUNNEL_DEFAULTS`：`init` 0.2、`delta` 0.15、`max` 1.1、`drones` 1
- 倍率在落到目标时计算，飞行中的一发按落地时的递增状态

## 结算

没有 `attackShape` 时，取选择器链的第一个单位，造成 `physical` 伤害。

`attackShape` 上的字段可以同时存在。`damage` 是 `physical`、`arts` 或 `heal`，缺省 `physical`。`heal` 改选受伤的同阵营单位，生命比例低的在前。

- `splash`：以落点为圆心，按站位中心量半径。`othersOnly` 为真时主目标吃未乘倍率的一击，其他人吃 `scale`（缺省 1）。为假时圈内每个人，包括主目标，只吃 `scale`。`groundOnly` 跳过飞行单位。攻击者打不到飞行单位时，溅射也不打
- `bounce`：从主目标再跳到附近的对方单位。`count` 含主目标。第 k 跳的倍率是 `(1 - falloff) ^ k`。`pause` 大于 0 时，主目标和每一跳获得这么多秒的 `sluggish`
- `chain`：从主目标再治疗附近的同阵营。每一跳从上一个治到的人出发，缺省找它所在格子周围 3×3（`CHAIN_HEAL_REACH` 为 1，切比雪夫距离），写了 `radius` 时按直线距离。跳过已经治过的、带 `isolated`（治疗者自己除外）、带 `no-heal`（`healThrough` 认的除外）或 `no-ally-heal` 的；生命比例最低的在前，满血的也能跳（白治一下，链从它接着跳），比例相同时最晚部署（`aggroSeq` 大）的在前。`count` 含主目标，衰减和弹射同一写法
- `healCount`：同时治疗这么多个受伤的同阵营单位。没写时是 1
- 治疗攻击的主目标与 `healCount` 的目标不看 `isolated`：只带孤立的受伤友方照常被选中。挡住治疗的只有 `no-heal` 与 `no-ally-heal`
- `lockRange`：范围内每个可选目标立刻命中。和 `projectile` 一起写时也不飞弹
- `blockTargets`：一次攻击的目标数等于阻挡数（`blockCnt` 汇总值，不足 1 按 1），从选择器链的前面取，链里 `block` 把阻挡的敌人排在前面。`lockRange` 同时写时以 `lockRange` 为准
- `filters`：普攻选目标时追加在选择器链末尾的筛选器 id，用 `registerSelector` 注册（`kind: "filter"`），`query.origin` 是攻击者。不过筛的单位不当普攻目标，自己挡着的也不打（阻挡照常）；技能的基础策略（`DEFAULT`、`SEARCH`、`ACTIVE_RANGE`）同样跳过它。治疗攻击也追加。开场时没注册的 id 报 `UnknownRegistrationError`
- `healThrough`：穿过禁疗的筛选器 id，用 `registerSelector` 注册（`kind: "filter"`），`query.origin` 是治疗者。过筛的友方带 `no-heal` 时仍是这个单位的治疗目标与治疗链的落点，它的治疗（含技能里以它为来源的 `heal`）也不看 `no-heal` 与 `heal-free`。别的治疗者照旧被拦；`no-ally-heal` 谁也穿不过。开场时没注册的 id 报 `UnknownRegistrationError`
- `projectile`：出手时 `launchProjectile`。速度见 `PROJECTILE_KIND_SPEEDS`：`arrow` 14、`bolt` 11、`orb` 10、`bomb` 8、`boomerang` 15，单位是格/秒。到达后才结算。`bomb` 带了溅射时，目标中途离场仍在最后坐标结算；其余种类目标离场则消掉。`boomerang` 再按 `BOOMERANG_RETURN_SPEED`（3.75）飞回，回程不造成伤害。投掷者已经离场则不再飞回

飞行中的回旋数量写在回旋组件 `attack:boomerang`（`combat/attack/boomerang.ts`），并抄进属性 `boomerangsOut`；组件的 `view` 把它写进快照的 `components`。能不能因此停手由 `readAttackTiming` 决定。

再加一种形状时，在 `AttackShape` 上加可选字段，并 `registerAttackResolver` 登记结算函数。新的投射物速度写进 `PROJECTILE_KIND_SPEEDS`，目标离场后是否仍落下写进 `PROJECTILE_RETAIN`，飞回速度写进 `PROJECTILE_RETURN_SPEEDS`。

- 友方的链是 `foe`、`fly`、`stealth`、`sleep`、`untargetable`、`isolated`、`range`、`ally-target`、`block`、`priority`、`taunt`、`remaining`、`distance`、`spawn`。
- `foe` 是敌人，加上带 `ally-target` 标签的友方；`ally-target` 排序把这些友方放到所有敌人之后。
- 没有单位带这个标签时与只选敌人相同。
- 打它们是普通的攻击（近战当场命中，远程飞投射物）；不在场时不选。
- 治疗攻击的链不变，带 `ally-target` 的友方照常是治疗目标与治疗链的落点。

敌人的链是 `ally`、`sleep`、`stealth`、`camouflage`、`liftoff`、`untargetable`、`isolated`、`range`、`block`、`priority`、`taunt`、`aggro`、`distance`。

各键的含义见 [选择器](./11-selector.md)。
