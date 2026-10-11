---
title: 战斗
description: createBattle 创建一场战斗，step 按十个阶段槽推进，snapshot、drainEvents、result、ledger 读出这一场，export 导出可继续推进的纯数据。
---

# 战斗

```ts
function createBattle(spec: BattleSpec, modules: readonly MissionModule[], archive?: WorldArchive): Battle

interface Battle {
  step(): void
  snapshot(): BattleSnapshot
  drainEvents(): readonly BattleEvent[]
  result(): BattleResult
  ledger(): BattleLedger
  systemOrder(): readonly SystemOrderEntry[]
  export(): WorldArchive
}

function runSteps(battle: Battle, steps: number): BattleResult
```

`modules` 里每个 `id` 都要出现在 `spec.modules` 中，规格点了却没有传入的模块，创建失败。安装顺序按 `dependsOn`，不按数组顺序。依赖必须也在 `spec.modules` 里。模块 id 重复，或依赖成环，创建失败。

内置的技能体、触发、选择器、计时器、状态、元素和伤害步骤在模块之前登记。同一个 id 再登记会换掉原来的定义。技能规格在模块安装之后检查。`deployStrategy` 不是 `null` 时，这个策略必须已经登记，否则拒绝创建。`deployModule` 登记的策略 id 是 `deploy`。

`step` 在推进中（系统或订阅者里）再被调用时抛出错误，这一拍照常走完。

`runSteps` 连续调用 `step`，然后返回 `result`。`createFrameClock()` 按帧累积秒数。`advance(battle, frameSeconds, speed?)` 把 `frameSeconds × speed` 换成拍，`speed` 缺省 1。每走完一拍就把这一拍的事件放进单独的一组。不满一拍的余数留到下一次。一帧最多补 `FRAME_CATCHUP`（150）拍。

创建战斗时，如果 `deployStrategy` 是 `null`，已经在场的单位会立即产生一次 `deploy` 事件；调用方应在第一次 `step` 前读取或丢弃这批初始事件。使用部署策略时，开场部署在战斗阶段槽中执行。

## 阶段槽

`step` 按下面的顺序走完一拍，然后 `tick` 加 1。同一槽里 `priority` 小的先执行，相同则按注册先后；`before`、`after` 列出的同槽系统 id 在这之上调整顺序。系统 id 重复时创建失败（`RegistrationConflictError`），`before`、`after` 引用不在同一槽的 id 时创建失败（`UnknownRegistrationError`），成环时创建失败。`systemOrder()` 按执行顺序列出 `{ slot, id }`。槽名是 `PhaseSlot`：

| 槽 | 这一拍 |
| --- | --- |
| `schedule` | `schedule(tick, run)` 里 tick 等于当前拍的回调，按登记顺序 |
| `spawn` | `atTick` 到达的刷出 |
| `cost` | 登记在这个槽上的系统 |
| `status` | 已经开始的状态计时器 |
| `enemy` | 先走还没完成的恐惧或诱导，否则沿路线移动，再推进已经开始的敌人攻击计时。路线速度用汇总后的 `moveSpeed`。`block` 在移动前后各看一次接触，`leak` 在移动之后看保护目标 |
| `enemy-index` | 登记在这个槽上的系统 |
| `ally` | 在场且未倒地的友方身上，已经开始的计时器 |
| `projectile` | 登记在这个槽上的系统 |
| `redeploy` | 登记在这个槽上的系统 |
| `finale` | 登记在这个槽上的系统 |

装上 `block`、`cost`、`deploy`、`leak`、`redeploy` 时的执行顺序：

| 槽 | 系统 |
| --- | --- |
| `schedule` | `engine:schedule` |
| `spawn` | `engine:spawn` |
| `cost` | `cost` |
| `status` | `engine:status-timers` |
| `enemy` | `block-before`、`engine:enemy-route`、`leak`、`block-after`、`engine:enemy-attack` |
| `ally` | `engine:ally-timers` |
| `projectile` | `engine:projectile` |
| `redeploy` | `redeploy` |
| `finale` | `engine:modifiers` |

友方槽对每个这样的友方，按登记顺序推进已开始的技能体、技力、特性计数和攻击。规格列出的独立计时排在攻击之后。敌人移动见 [规格](./01-spec.md) 的路线。

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
  kind: UnitKind
  x: number
  y: number
  facing: Direction
  height: number
  attributes: Readonly<Record<string, number>>
  tags: readonly string[]
  attackRange: readonly TileCoord[]
  deployPositions: readonly string[]
  elements: Readonly<Record<string, number>>
  blocking: readonly string[]
  blockedBy: string | null
  skills: readonly SkillSnapshot[]
  shield: number
  downed: boolean
  redeploy: { elapsed: number; duration: number } | null
  components: Readonly<Record<string, unknown>>
}

interface SkillSnapshot {
  id: string
  sp: number
  spCost: number
  charges: number
  active: boolean
  ammo: { left: number; max: number } | null
}
```

单位按 `id` 排序。属性抄单位上存放的数字，再叠正在生效的技能修饰。当前生命不叠技能修饰。状态带来的属性修饰在战斗读取属性时现算，不写进这份快照。`height` 是单位所在地块的高度，不在地块上时是 0。`tags` 是单位持有的标签 id，不分来源（规格、状态、技能与模块授予的合在一起），按 id 排序；路线隐藏额外有 `hidden`；不含蕴含得到的标签。元素槽按标识抄当前值。`blocking` 和 `blockedBy` 抄阻挡组件里已经写好的阻挡关系。`skills` 按单位的技能顺序给出技力、花费、层数和是否持续；弹药技能持续且单位在场时 `ammo` 是向上取整的剩余弹药与弹匣，其余时候是 `null`。`shield` 是护盾池与状态护盾的合计。倒下时 `redeploy` 是再部署计时已过的秒数与要等的秒数，没倒下时是 `null`。

`components` 是带 `view` 的组件给画面的显示值，键是组件 id（见 [世界](./04-world.md#组件)）。它只给画面，不计入状态：黄金摘要先去掉它再算。快照不调用选择器。

## 事件

```ts
type BattleEvent<K extends BattleEventType = BattleEventType> = {
  [P in K]: { tick: number; type: P; data: EventData<P> }
}[K]
```

`BattleEventMap` 是事件名到数据的表，模块经声明合并加入自己的事件。写成 `Intercept<数据>` 的事件可拦截：发出者用 `ctx.intercept`，订阅者按订阅顺序同步收到可写的 `data`，发出者在返回后读回改写。其余事件只读：用 `ctx.emit` 发出，`data` 是 `Readonly`；在分发中发出时排进队列，等最外层这一条分发完按先进先出分发，所以订阅者里再发事件不会压栈。

```ts
declare module "arknights-mission-core" {
  interface BattleEventMap {
    "doll-swap": { readonly unitId: string }
    "doll-guard": Intercept<{ readonly unitId: string; cancel: boolean }>
  }
}
```

`drainEvents` 取出缓冲并清空，没人取走时事件一直留着。一条事件的 `tick` 是送出时的拍数。`cue` 是给画面与音效的线索，`kind` 的种类在 `CueMap` 里声明合并。

战斗自己送出的 `type`：

| type | 可拦截 | 何时 |
| --- | --- | --- |
| `spawn` | | 刷出槽放入单位，或 `spawnUnit` |
| `deploy` | | 部署策略让单位上场，或再部署回到场上 |
| `downed` | | 生命到 0。有部署策略时 `data` 带落点坐标和 `canStand`。`kind` 是 `device` 的单位倒下就是被摧毁，随后送出 `removed` |
| `removed` | | 单位离场且不再回来：装置被摧毁、敌人漏出、`removeUnit`。从下一次快照起不再出现，账本仍记着它 |
| `attack` | 是 | 普攻出手之前。`cancel` 改成真时这一下不打出去 |
| `attack-hit` | | 攻击出手。`data.unitId` 是攻击者 |
| `hit` | 是 | `dealDamage` 进入步骤之前。处理函数可以改 `amount`、`kind`、`cancel`、`mul` |
| `element-hit` | 是 | 元素进槽之前。处理函数可以改数额、乘数、种类和取消 |
| `fatal` | 是 | 这一下会把生命扣到 0。`data.prevented = true` 时生命留在 1 和最大生命里较小的那个 |
| `damaged` | | 生命已经写下。`amount` 是这一下的数额，`applied` 是实际扣掉的生命（结算前减结算后，不含溢出），`hp` 是结算后的生命 |
| `loss` | | `loseHp` 扣了生命 |
| `heal` | | 治疗写下生命或护盾 |
| `displace` | | 坐标被改了。`duration` 是位移秒数，`keepFacing` 为真时画面保持原朝向：推和拉缺省保持，`keepFacing: false` 或直接 `displace` 不保持 |
| `projectile` | | `launchProjectile` 发出一发，开始飞行 |
| `cost` | | 费用池的数字变了。`data.side` 是阵营，`data.value` 是新的数量 |
| `leak` | | 敌人站上保护目标，随后 `removed`。`data.unitId` 是这名敌人 |
| `blocked` | | 新挡上一名敌人。`data.blockerId`、`data.enemyId` |
| `unblocked` | | 这名敌人不再被挡 |
| `skill-start`、`skill-end` | | 技能开始、结束 |
| `ammo-used` | | 弹药技能用掉一发 |
| `status` | | 状态施加成功，`stacks` 是施加后的层数 |
| `element-burst` | | 元素槽蓄满 |
| `cue` | | 画面线索 |

无来源的命中和伤害里，`sourceId` 是空字符串，`creditId` 仍是调用时给的来源。

## 结果

```ts
interface BattleResult {
  finished: boolean
  winner: "ally" | "enemy" | null
}
```

创建时 `finished` 是 false，`winner` 是 `null`。`ContentContext.finish(winner)` 把结果写成结束。

## 账本

```ts
interface BattleLedger {
  battle: LedgerRow
  owners: Readonly<Record<string, LedgerRow>>
}
```

账本只按单位规格的 `owner` 分行，核心不解释 `owner`，也没有玩家与房间；按玩家汇总在 app/server。`battle` 是全场合计，包括没有 `owner` 的单位。每行的字段：

| 字段 | 记法 |
| --- | --- |
| `kills` | 敌方单位倒下，记给最后一次对它造成伤害的单位 |
| `leaks` | 敌方单位漏出，记给漏出的单位 |
| `damage` | `damaged` 的 `applied`，只记对另一方的伤害 |
| `healing` | `heal` 实际回复的生命，记给来源 |
| `deaths` | 友方单位倒下，记给倒下的单位 |
| `total` | 计入总数的敌方单位：开场的敌方单位与没写 `inTotal: false` 的敌方出场项，开场时算好；运行中 `spawnUnit` 放出的不算 |
| `killedInTotal`、`leakedInTotal` | 计入总数的敌方单位被击倒、漏出的次数 |
| `resolved` | `min(total, killedInTotal + leakedInTotal)` |

## 导出与导入

`export()` 返回 `WorldArchive`：拍数、随机流状态、单位记录、组件表与资源，只有普通对象、数组与原始值，和世界不共享对象。用同样的规格与模块调用 `createBattle(spec, modules, archive)`，先照常建好，再把世界换成导出时的状态，待取走的事件清空；接着推进与不中断推进的事件、快照、结果和账本一致。快照的 `components` 视图、待取走的事件与订阅者不导出。导出时值不是纯数据会报出路径。组件与资源的编码见 [世界](./04-world.md#导出与导入)。
