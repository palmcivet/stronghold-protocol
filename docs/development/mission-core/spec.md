---
title: 规格
description: BattleSpec 描述一场战斗的种子、地块、单位、刷出和要安装的模块。
---

# 规格

`BattleSpec` 是 `createBattle` 的第一参。字段都要给出，可选行为用字段里的缺省值，不用省略整个规格。

```ts
interface BattleSpec {
  seed: number
  modules: readonly string[]
  tiles: readonly TileSpec[]
  units: readonly UnitSpec[]
  spawns: readonly SpawnSpec[]
  deployStrategy: string | null
}
```

`seed` 生成这场战斗的随机数。种子 0 换成固定的非零值。`modules` 是要安装的模块 id，顺序不决定安装顺序，依赖见 [模块](./module.md)。`units` 在创建时放入，id 重复会失败。`spawns` 留到 `spawn` 槽，`atTick` 等于当前拍数时放入。`deployStrategy` 为 `null` 时，`units` 一开始就在场。写了策略 id 时，它们先不在场，创建结束时按该策略的 `opening` 上场。

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

`x` 是列，`y` 是行，行号向上增加。`walkableBy` 里的 `WALK`、`walk`、`ground`、`GROUND`、`ALL`、`all` 表示地面可走，`FLY`、`fly` 表示只有飞行可过。地面可走的格子，飞行也能过。`objective` 为真的格子是保护目标，恐惧选落点时跳过。

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
  targetPriority?: string
  blocking?: readonly string[]
  blockedBy?: string | null
  aggroSeq?: number
  hitLimit?: boolean
  immunity?: readonly string[]
}
```

`attributes` 是调用方已经算好的基础值。当前生命读 `hp`。常用键还有 `maxHp`、`atk`、`def`、`res`、`aspd`、`bat`、`batPct`、`spRecovery`、`moveSpeed`。战斗读取属性时再叠状态和正在生效的技能修饰，见 [战斗](./battle.md)。

`facing` 缺省 `RIGHT`。`motion` 缺省 `WALK`。`attackRange` 和技能的 `triggerRange` 都按面向 `RIGHT` 填写，`x` 是列偏移，`y` 是行偏移，使用时转到单位朝向。

`hitArea` 是大体型受击矩形，单位是格。`w`、`h` 是宽高，`dx`、`dy` 是相对站位中心的偏移。缺省时单位占所站的一格。

`attackClip` 是攻击片段，`duration` 和 `hit` 都是秒，`hit` 是片段里的出手点。缺省时前摇是 0，命中后停 0.35 秒。见 [攻击](./attack.md)。

`targetPriority` 交给选择器的 `priority` 键。空字符串不改变顺序。`blocking` 是这个单位正在阻挡的单位 id。`blockedBy` 是挡住它的单位 id。`aggroSeq` 缺省按入场先后，越晚越大。

`hitLimit` 为真时，一次结算的数额向上取整达到 300000，这一整段取消。`immunity` 是免疫名。冻结写 `frozen`，恐惧和战栗写 `feared`，其余与状态 id 相同。见 [状态](./status.md)。

`route` 的检查点是 `move`、`wait`、`disappear`、`appear`，可以再带一个 `end`。敌人在敌人槽里沿这条路线走。`FLY` 直飞检查点，地面走流场。每秒移动的格数是 `moveSpeed × 0.5`。`disappear` 给单位加上路线隐藏，快照多一个 `hidden` 标志。

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
