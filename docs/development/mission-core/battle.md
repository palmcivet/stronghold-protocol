---
title: 战斗
description: createBattle 创建一场战斗，step 按十个阶段槽推进，snapshot、drainEvents 和 result 读出这一场。
---

# 战斗

```ts
function createBattle(spec: BattleSpec, modules: readonly MissionModule[]): Battle

interface Battle {
  step(): void
  snapshot(): BattleSnapshot
  drainEvents(): readonly BattleEvent[]
  result(): BattleResult
}

function runSteps(battle: Battle, steps: number): BattleResult
```

`modules` 里每个 `id` 都要出现在 `spec.modules` 中，规格点了却没有传入的模块，创建失败。安装顺序按 `dependsOn`，不按数组顺序。依赖必须也在 `spec.modules` 里。模块 id 重复，或依赖成环，创建失败。

内置的技能体、触发、选择器、计时器、状态、元素和伤害步骤在模块之前登记。同一个 id 再登记会换掉原来的定义。技能规格在模块安装之后检查。`deployStrategy` 不是 `null` 时，这个策略必须已经登记，否则拒绝创建。

`runSteps` 连续调用 `step`，然后返回 `result`。

## 阶段槽

`step` 按下面的顺序走完一拍，然后 `tick` 加 1。同一槽里 `priority` 小的先执行，相同则按注册先后。槽名是 `PhaseSlot`：

| 槽 | 这一拍 |
| --- | --- |
| `schedule` | `schedule(tick, run)` 里 tick 等于当前拍的回调，按登记顺序 |
| `spawn` | `atTick` 到达的刷出 |
| `cost` | 登记在这个槽上的系统 |
| `status` | 已经开始的状态计时器 |
| `enemy` | 先沿路线移动，再推进已经开始的敌人攻击计时 |
| `enemy-index` | 登记在这个槽上的系统 |
| `ally` | 在场且未倒地的友方身上，已经开始的计时器 |
| `projectile` | 登记在这个槽上的系统 |
| `redeploy` | 登记在这个槽上的系统 |
| `finale` | 登记在这个槽上的系统 |

友方槽对每个这样的友方，按登记顺序推进已开始的技能体、技力、特性计数和攻击。敌人移动见 [规格](./spec.md) 的路线。

## 属性汇总

读取属性时用基础值，加上状态和正在生效的技能修饰。运算是 `add`、`percent`、`mul`：

```text
(基础 + 加算) × (1 + 百分比) × 乘算
```

`dmgDealt`、`dmgTaken` 这一类乘区没有基础值时从 1 起算，其余从 0 起算。当前生命是单位上存放的 `hp`，不走这条公式。最大生命用 `hp` 和 `maxHp` 的修饰一起算，基础取 `maxHp`，没有则取 `hp`。

## 快照

```ts
interface BattleSnapshot {
  tick: number
  units: readonly UnitSnapshot[]
}

interface UnitSnapshot {
  id: string
  side: "ally" | "enemy"
  x: number
  y: number
  attributes: Readonly<Record<string, number>>
  flags: readonly string[]
  attackRange: readonly TileCoord[]
  tags: readonly string[]
  deployPositions: readonly string[]
  elements: Readonly<Record<string, number>>
}
```

单位按 `id` 排序。属性抄单位上存放的数字，再叠正在生效的技能修饰。当前生命不叠技能修饰。状态带来的属性修饰在战斗读取属性时现算，不写进这份快照。标志排序后抄上。路线隐藏额外有 `hidden`。元素槽按标识抄当前值。快照不调用选择器。

## 事件

```ts
interface BattleEvent {
  tick: number
  type: string
  data: Readonly<Record<string, unknown>>
}
```

`drainEvents` 取出缓冲并清空。事件在发生时已经交给 `subscribe` 的处理函数。一条事件的 `tick` 是送出时的拍数。

战斗自己送出的 `type`：

| type | 何时 |
| --- | --- |
| `spawn` | 刷出槽放入单位，或 `spawnUnit` |
| `deploy` | 部署策略让单位上场 |
| `downed` | 生命到 0。有部署策略时 `data` 带落点坐标和 `canStand` |
| `attack-hit` | 攻击出手。`data.unitId` 是攻击者 |
| `hit` | `dealDamage` 进入步骤之前。处理函数可以改 `amount`、`kind`、`cancel`、`mul` |
| `elementHit` | 元素进槽之前。处理函数可以改数额、乘数、种类和取消 |
| `damaged` | 生命已经写下 |
| `fatal` | 这一下会把生命扣到 0。`data.prevented = true` 时生命留在 1 和最大生命里较小的那个 |
| `loss` | `loseHp` 扣了生命 |
| `heal` | 治疗写下生命或护盾 |
| `displace` | `displace` 改了坐标 |
| `projectile` | `launchProjectile` 记下一次发射 |
| `elementBurst` | 元素槽蓄满 |

无来源的命中和伤害里，`sourceId` 是空字符串，`creditId` 仍是调用时给的来源。`emit` 可以送出别的 `type`。

## 结果

```ts
interface BattleResult {
  finished: boolean
  winner: "ally" | "enemy" | null
}
```

创建时 `finished` 是 false，`winner` 是 `null`。`ContentContext.finish(winner)` 把结果写成结束。
