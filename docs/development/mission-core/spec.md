---
title: 规格
description: BattleSpec 描述一场战斗的种子、地块、单位、刷出和要安装的模块。
---

# 规格

`BattleSpec` 是 `createBattle` 的第一参。字段都要给出，可选行为用字段里的缺省值，不用省略整个规格。

```ts
interface CostPoolSpec {
  initial: number
  regen: number
  cap: number
}

interface BattleSpec {
  seed: number
  modules: readonly string[]
  tiles: readonly TileSpec[]
  units: readonly UnitSpec[]
  spawns: readonly SpawnSpec[]
  deployStrategy: string | null
  cost: { ally: CostPoolSpec; enemy: CostPoolSpec }
}
```

`seed` 生成这场战斗的随机数。种子 0 换成固定的非零值。`modules` 是要安装的模块 id，顺序不决定安装顺序，依赖见 [模块](./module.md)。`units` 在创建时放入，id 重复会失败。`spawns` 留到 `spawn` 槽，`atTick` 等于当前拍数时放入。`deployStrategy` 为 `null` 时，`units` 一开始就在场。写了策略 id 时，它们先不在场，创建结束时按该策略的 `opening` 上场。内置策略的 id 是 `deploy`，要同时把 `deploy` 放进 `modules`。

`cost` 是两个阵营各自的费用池。`initial` 是开场值，`regen` 是每游戏秒回复，`cap` 是上限。没有内置的 10 / 1 / 99。负值或非有限数按 0。开场值超过上限时夹到上限。装了 `cost` 模块才每拍回复。`spendCost` 和 `addCost` 不依赖这个模块。见 [费用、阻挡与投射物](./field.md)。

## 地块

```ts
interface TileSpec {
  x: number
  y: number
  height: number
  deployable: boolean
  walkableBy: readonly string[]
  objective?: boolean
}
```

`x` 是列，`y` 是行，行号向上增加。`walkableBy` 里的 `WALK`、`walk`、`ground`、`GROUND`、`ALL`、`all` 表示地面可走，`FLY`、`fly` 表示只有飞行可过。地面可走的格子，飞行也能过。`objective` 为真的格子是保护目标，恐惧选落点时跳过。装了 `leak` 模块时，敌人站上这种格子会离场。

## 单位

```ts
interface UnitSpec {
  id: string
  side: "ally" | "enemy"
  attributes: Readonly<Record<string, number>>
  skills: readonly SkillSpec[]
  attackRange: readonly TileCoord[]
  tags: readonly string[]
  deployPositions: readonly string[]
  x: number
  y: number
  facing?: "UP" | "RIGHT" | "DOWN" | "LEFT"
  hitArea?: HitArea | null
  motion?: "WALK" | "FLY"
  route?: RouteSpec | null
  attackClip?: AttackClip
  attackShape?: AttackShape
  targetPriority?: string
  blocking?: readonly string[]
  blockedBy?: string | null
  aggroSeq?: number
  hitLimit?: boolean
  immunity?: readonly string[]
  timers?: readonly string[]
}
```

`attributes` 是调用方已经算好的基础值。当前生命读 `hp`。引擎会读的键还有 `maxHp`、`atk`、`def`、`res`、`aspd`、`bat`、`batPct`、`spRecovery`、`moveSpeed`、`massLevel`、`redeployMul`、`rangeExtend`、`timerRate`、`times`、`ammoMax`、`atk_scale`、`taunt`，以及伤害和治疗乘区。再部署读 `cost` 和 `respawnTime`（秒），没写或不是非负有限数时按 0。阻挡读 `blockCnt` 和 `blockWeight`：没写 `blockCnt` 时按 1，没写 `blockWeight` 时按 1。战斗读取属性时再叠状态和正在生效的技能修饰，见 [战斗](./battle.md)。`cost` 和 `respawnTime` 按单位上存放的数字读，不走这层汇总。`taunt` 是选择器里的嘲讽键。

`facing` 缺省 `RIGHT`。`motion` 缺省 `WALK`。`attackRange` 和技能的 `triggerRange` 都按面向 `RIGHT` 填写，`x` 是列偏移，`y` 是行偏移，使用时转到单位朝向。

`hitArea` 是大体型受击矩形，单位是格。`w`、`h` 是宽高，`dx`、`dy` 是相对站位中心的偏移。缺省时单位占所站的一格。

`attackClip` 是攻击片段，`duration` 和 `hit` 都是秒，`hit` 是片段里的出手点。缺省时前摇是 0，命中后停 0.35 秒。见 [攻击](./attack.md)。

`attackShape` 可选。溅射、弹射、治疗链、治疗人数、锁定范围和投射物可以写在同一次攻击上。`damage` 单独表示物理、法术或治疗。没写时是单体即时物理攻击。字段见 [攻击](./attack.md)。

`tags` 里，`token` 表示召唤物，`deferDeploy` 表示开战不上场。内置部署策略读这两个标签，见 [模块](./module.md)。

`targetPriority` 交给选择器的 `priority` 键。空字符串不改变顺序。`blocking` 是这个单位正在阻挡的单位 id。`blockedBy` 是挡住它的单位 id。`aggroSeq` 缺省按入场先后，越晚越大。

`hitLimit` 为真时，一次结算的数额向上取整达到 300000，这一整段取消。`immunity` 是免疫名。冻结写 `frozen`，恐惧和战栗写 `feared`，其余与状态 id 相同。见 [状态](./status.md)。

`timers` 列出要启动的独立计时器 id。引擎对每一项调用 `startTimer`。缺省是空。未知 id 拒绝创建。内置 id 是 `charge`、`ammo`、`boomerang`，这三条只在友方身上启动。见 [计时](./timer.md)。

`route` 的检查点是 `move`、`wait`、`disappear`、`appear`，可以再带一个 `end`。敌人在敌人槽里沿这条路线走。`FLY` 直飞检查点，地面走流场。每秒移动的格数是汇总后的 `moveSpeed × 0.5`，`sluggish` 这类修饰算在里面。正在走恐惧或诱导时，这一拍不沿路线走。`disappear` 给单位加上路线隐藏，快照多一个 `hidden` 标志。`blockedBy` 已经指向某个单位时，这一拍不再沿路线走。走到 `end` 且那一格不是 `objective` 时停住。

`redeployMul` 乘在再部署等待秒数上，缺省 1。`rangeExtend` 把攻击范围每一行再往前延伸这么多格，见 [选择器](./selector.md)。`massLevel` 参与推和拉的受力等级。

## 技能规格

```ts
interface SkillSpec {
  id: string
  body: string
  trigger: string
  spCost: number
  duration: number
  ammo: number
  spType?: "time" | "attack" | "hurt" | "none"
  initSp?: number
  charges?: number
  operation?: "MANUAL" | "AUTO"
  heal?: boolean
  mods?: readonly SkillModifier[]
  flags?: readonly string[]
  triggerRange?: readonly TileCoord[]
  triggerAllies?: boolean
  triggerHpAtMost?: number
  activateOnDeploy?: boolean
  onStart?: SkillHook
  onEnd?: SkillHook
  onTick?: SkillHook
  onHit?: SkillHook
}
```

`body` 和 `trigger` 必须是已经登记的标识，创建时检查。触发先归一化：转成大写，`ALWAYS` 记成 `SP_FULL`，`MANUAL` 记成 `NEVER`，以 `CUSTOM_RANGE` 开头的记成 `CUSTOM_RANGE`。`spType` 缺省 `time`，`operation` 缺省 `MANUAL`，`charges` 缺省 1。写了名单以外的技力类型或操作，放入单位时失败。

`mods` 在技能生效期间参加属性汇总。`onStart`、`onEnd`、`onTick`、`onHit` 和技能体上的同名回调一起被调用。回调看到 `{ unitId, skillId, reason, dt }`。

## 刷出

```ts
interface SpawnSpec {
  atTick: number
  unit: UnitSpec
}
```

到达该拍时单位放入、标成在场。友方有技能时开始技力和技能体计时，并送出 `spawn`。这次开始不加手动技能的 3 秒操作冷却。
