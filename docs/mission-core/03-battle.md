---
title: 战斗
description: createBattle 创建一场战斗，step 按十个阶段槽推进，snapshot、drainEvents、result、ledger 读出这一场，export 导出可继续推进的纯数据。
---

# 战斗

```ts
import {
  type BattleSpec,
  createBattle,
  type MissionModule,
  runSteps,
} from "arknights-mission-core"

export function replay(spec: BattleSpec, modules: readonly MissionModule[]) {
  const battle = createBattle(spec, modules)
  battle.drainEvents()
  const result = runSteps(battle, 300)
  const archive = battle.export()
  const resumed = createBattle(spec, modules, archive)
  return { result, hash: resumed.contentHash() }
}
```

`Battle` 的方法：

| 方法 | 返回 |
| --- | --- |
| `step(inputs?)` | 推进一拍 |
| `snapshot()` | `BattleSnapshot` |
| `drainEvents()` | 取出并清空事件缓冲 |
| `result()` | `BattleResult` |
| `ledger()` | `BattleLedger` |
| `systemOrder()` | 系统的执行顺序 |
| `export()` | 可继续推进的纯数据 |
| `contentHash()` | 16 位十六进制摘要 |

签名见 [API 参考](./15-api.md#战斗)。

`modules` 里每个 `id` 都要出现在 `spec.modules` 中，规格点了却没有传入的模块，创建失败。安装顺序按 `dependsOn`，不按数组顺序。依赖必须也在 `spec.modules` 里。模块 id 重复，或依赖成环，创建失败。

内置的属性、叠加策略、条件、技能体、触发、选择器、计时器、效果、元素和伤害步骤在模块之前登记。同一个 id 再登记报 `RegistrationConflictError`。要换掉内置项，用标成可扩展的 id 调用 `replace` 或 `wrap`，见 [模块](./04-module.md#扩展)。规格在模块安装之后检查：必须是纯数据（函数、类实例、`Map` 等报出路径），引用的技能体、触发、技能钩子、标签、计时器、条件与效果都要已注册。

`contentHash()` 是规格、按安装顺序的模块 id 与 `version`、替换链的摘要，16 位十六进制。同样的规格与模块得到同样的摘要，JSON 往返后的规格也一样。`deployStrategy` 不是 `null` 时，这个策略必须已经登记，否则拒绝创建。`deployModule` 登记的策略 id 是 `deploy`。

`step` 在推进中（系统或订阅者里）再被调用时抛出错误，这一拍照常走完。

## 玩家输入

`BattleInput` 有三种，都带 `unitId`：

- `{ type: "retreat" }`
- `{ type: "redeploy", tile? }`
- `{ type: "cast", skillId }`

`step(inputs)` 在这一拍的第一个阶段槽之前按提交顺序执行输入。接受的送出 `input`，拒绝的送出 `input-refused`（带 `reason`），世界不变。世界里不记输入，`export()` 只导出当前状态；回放要的输入日志由调用方保存，按拍重新提交。输入只对友方单位生效，否则是 `not-ally`；单位不存在或已移除是 `unknown-unit`；形状不对是 `bad-input`。

- `retreat`：撤下在场的单位，与内容命令 `retreatUnit` 同一段实现，见 [模块](./04-module.md#命令和查询)。在场才行（`not-fielded`）。
- `redeploy`：等待再部署的单位（`not-waiting`）计时走完（`not-ready`）、`tile`（缺省是等待时的坐标）站得住（`tile-blocked`）、费用够（`no-cost`）时这一拍回来。费用是单位的 `cost`，等待是再部署计时，输入里不能改；改规则走内容命令 `redeployUnit`。
- `cast`：等于 `castSkill`，放不出是 `cannot-cast`。

部署干员等其余玩家操作还没有做成输入。

`runSteps` 连续调用 `step`，然后返回 `result`。`createFrameClock()` 按帧累积秒数。`advance(battle, frameSeconds, speed?)` 把 `frameSeconds × speed` 换成拍，`speed` 缺省 1。每走完一拍就把这一拍的事件放进单独的一组。不满一拍的余数留到下一次。一帧最多补 `FRAME_CATCHUP`（150）拍。

创建战斗时，如果 `deployStrategy` 是 `null`，已经在场的单位会立即产生一次 `deploy` 事件；调用方应在第一次 `step` 前读取或丢弃这批初始事件。使用部署策略时，开场部署在战斗阶段槽中执行。

## 阶段槽

`step` 按下面的顺序走完一拍，然后 `tick` 加 1。同一槽里 `priority` 小的先执行，相同则按注册先后；`before`、`after` 列出的同槽系统 id 在这之上调整顺序。系统 id 重复时创建失败（`RegistrationConflictError`），`before`、`after` 引用不在同一槽的 id 时创建失败（`UnknownRegistrationError`），成环时创建失败。`systemOrder()` 按执行顺序列出 `{ slot, id }`。槽名是 `PhaseSlot`：

- `schedule`：`schedule(tick, run)` 里 tick 等于当前拍的回调，按登记顺序
- `spawn`：`atTick` 到达的刷出
- `cost`：登记在这个槽上的系统
- `status`：已经开始的状态计时器
- `enemy`：先走还没完成的恐惧或诱导，否则沿路线移动，再推进已经开始的敌人攻击计时。路线速度用汇总后的 `moveSpeed`。`block` 在移动前后各看一次接触，`leak` 在移动之后看保护目标
- `enemy-index`：登记在这个槽上的系统
- `ally`：在场且未倒地的友方身上，已经开始的计时器
- `projectile`：登记在这个槽上的系统
- `redeploy`：登记在这个槽上的系统
- `finale`：登记在这个槽上的系统

装上 `block`、`cost`、`deploy`、`leak`、`redeploy` 时的执行顺序：

| 槽 | 系统 |
| --- | --- |
| `schedule` | `engine:schedule` |
| `spawn` | `engine:spawn` |
| `cost` | `cost` |
| `status` | `engine:conditional-effects`、`engine:status-timers` |
| `enemy` | `block-before`、`engine:enemy-route`、`leak`、`block-after`、`engine:enemy-attack` |
| `ally` | `engine:ally-timers` |
| `projectile` | `engine:projectile` |
| `redeploy` | `redeploy` |
| `finale` | `engine:modifiers`、`engine:max-hp` |

友方槽对每个这样的友方，按登记顺序推进已开始的技能体、技力、特性计数和攻击。规格列出的独立计时排在攻击之后。敌人移动见 [规格](./02-spec.md) 的路线。

## 属性汇总

见 [效果与属性](./10-effect.md#属性)。

## 快照

字段见 [API 参考](./15-api.md#快照)。

单位按 `id` 排序。属性抄单位上存放的数字，再叠正在生效的技能修饰。当前生命不叠技能修饰。状态带来的属性修饰在战斗读取属性时现算，不写进这份快照。`maxHp` 是生效的最大生命，即基础值叠上效果修饰之后的值，计入状态；读快照不会结算当前生命的缩放。`height` 是单位所在地块的高度，不在地块上时是 0。`tags` 是单位持有的标签 id，不分来源（规格、状态、技能与模块授予的合在一起），按 id 排序；路线隐藏额外有 `hidden`；不含蕴含得到的标签。元素槽按标识抄当前值。`blocking` 和 `blockedBy` 抄阻挡组件里已经写好的阻挡关系。`skills` 按单位的技能顺序给出技力、花费、层数和是否持续；弹药技能持续且单位在场时 `ammo` 是向上取整的剩余弹药与弹匣，其余时候是 `null`。`shield` 是护盾池与状态护盾的合计。倒下时 `redeploy` 是再部署计时已过的秒数与要等的秒数，没倒下时是 `null`。`unbalanceUntil` 是失衡结束的拍（不含），没有失衡时是 `null`，见 [费用、阻挡与投射物](./12-field.md#失衡)。

`components` 是带 `view` 的组件给画面的显示值，键是组件 id（见 [世界](./05-world.md#组件)）。它只给画面，不计入状态：黄金摘要先去掉它再算。快照不调用选择器。

## 事件

一条事件是 `{ tick, type, data }`，`data` 的类型由 `type` 决定（`EventData<type>`）。

`BattleEventMap` 是事件名到数据的表，模块经声明合并加入自己的事件。写成 `Intercept<数据>` 的事件可拦截，只用于否决与保留（`cancel`、`prevented`、`keep`），改数值走 [伤害修饰](./06-damage.md#伤害修饰)：发出者用 `ctx.intercept`，订阅者按订阅顺序同步收到可写的 `data`，发出者在返回后读回改写。其余事件只读：用 `ctx.emit` 发出，`data` 是 `Readonly`；在分发中发出时排进队列，等最外层这一条分发完按先进先出分发，所以订阅者里再发事件不会压栈。

```ts
import type { Intercept } from "arknights-mission-core"

declare module "arknights-mission-core" {
  interface BattleEventMap {
    "my-mod:doll-swap": { readonly unitId: string }
    "my-mod:doll-guard": Intercept<{ readonly unitId: string; cancel: boolean }>
  }
}
```

处理函数可以直接改写可拦截事件的 `data`，也可以用 `ctx.revise(event, { prevented?, cancel?, keep? })`：只写事件数据里本来就有的那几个字段。

核心不丢事件，也不吞异常：订阅者、拦截器或系统里抛出的异常原样从 `step` 传出。

`drainEvents` 取出缓冲并清空，没人取走时事件一直留着。一条事件的 `tick` 是送出时的拍数。`cue` 是给画面与音效的线索，`kind` 的种类在 `CueMap` 里声明合并。

战斗自己送出的 `type`：

- `spawn`：刷出槽放入单位，或 `spawnUnit`
- `deploy`：部署策略让单位上场，或再部署回到场上
- `retreat`：单位被撤下（`retreat` 输入或 `retreatUnit`），开始再部署计时。不算倒下，账本不记
- `input`：这一拍开始时接受的玩家输入
- `input-refused`：这一拍开始时拒绝的玩家输入与 `reason`
- `downed`：生命到 0。有部署策略时 `data` 带落点坐标和 `canStand`。`kind` 是 `device` 的单位倒下就是被摧毁，随后送出 `removed`
- `removed`：单位离场且不再回来：装置被摧毁、敌人漏出、`removeUnit`。从下一次快照起不再出现，账本仍记着它
- `attack`（可拦截）：普攻出手之前（包括 `forceAttack`）。`cancel` 改成真时这一下不打出去；`noAmmo` 改成真时这一下不用掉弹药
- `palsy-interrupt`（可拦截）：麻痹打断敌人普攻、用掉一层之前。`stacks` 是用掉之前的层数；`keep` 改成真时这一层留着。订阅者里敌人倒下时这次普攻同样结束
- `attack-hit`：攻击出手。`data.unitId` 是攻击者；这一下不用掉弹药时带 `noAmmo: true`
- `hit`：`dealDamage` 进入步骤之前，`hit` 阶段的伤害修饰改写之后。数据是改写后的数额、种类与 `cancel`
- `element-hit`：元素进槽之前，`element-hit` 阶段的伤害修饰改写之后
- `fatal`（可拦截）：这一下会把生命扣到 0。`data.prevented = true` 时生命留在 1 和最大生命里较小的那个
- `damaged`：生命已经写下。`amount` 是这一下的数额，`applied` 是实际扣掉的生命（结算前减结算后，不含溢出），`hp` 是结算后的生命
- `loss`：`loseHp` 扣了生命
- `heal`：治疗写下生命或护盾
- `displace`：坐标被改了。`duration` 是位移秒数（推和拉是这次失衡的秒数，画面按它滑动；直接 `displace` 是 0），`keepFacing` 为真时画面保持原朝向：推和拉缺省保持，`keepFacing: false` 或直接 `displace` 不保持
- `projectile`：`launchProjectile` 发出一发，开始飞行
- `cost`：费用池的数字变了。`data.side` 是阵营，`data.value` 是新的数量
- `leak`：敌人站上保护目标，随后 `removed`。`data.unitId` 是这名敌人
- `blocked`：新挡上一名敌人。`data.blockerId`、`data.enemyId`
- `unblocked`：这名敌人不再被挡
- `skill-start`、`skill-end`：技能开始、结束
- `ammo-used`：弹药技能用掉一发
- `status`：状态施加成功，`stacks` 是施加后的层数
- `element-burst`：元素槽蓄满
- `cue`：画面线索

无来源的命中和伤害里，`sourceId` 是空字符串，`creditId` 仍是调用时给的来源。

## 结果

`BattleResult` 有 `finished` 与 `winner`（`ally`、`enemy` 或 `null`）。创建时 `finished` 是 false，`winner` 是 `null`。`ContentContext.finish(winner)` 把结果写成结束。

## 账本

`BattleLedger` 有全场合计 `battle` 与按 `owner` 分行的 `owners`。核心不解释 `owner`，也没有玩家与房间的概念，按人汇总由调用方完成。`battle` 是全场合计，包括没有 `owner` 的单位。每行的字段：

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

`export()` 返回 `WorldArchive`：拍数、随机流状态、单位记录、组件表与资源，只有普通对象、数组与原始值，和世界不共享对象。用同样的规格与模块调用 `createBattle(spec, modules, archive)`，先照常建好，再把世界换成导出时的状态，待取走的事件清空；接着推进与不中断推进的事件、快照、结果和账本一致。快照的 `components` 视图、待取走的事件与订阅者不导出。导出时值不是纯数据会报出路径。组件与资源的编码见 [世界](./05-world.md#导出与导入)。
