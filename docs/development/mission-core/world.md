---
title: 世界、组件、资源与标签
description: 一场战斗的可变状态放在 World 里。模块用 defineComponent、defineResource、defineTag 定义带类型的键，按键读写和查询。
---

# 世界、组件、资源与标签

一场战斗的全部可变状态在一个 `World` 里（`kernel/world/`）。核心记录是按入场顺序排列的单位，其余数据挂在组件表、资源和标签上。模块不拿字符串去存取数据，而是先定义一个带类型的键，再按键读写。

```ts
interface World<E extends { id: string }> {
  readonly spec: BattleSpec
  tick: number
  readonly units: Map<string, E>
  readonly random: Random
  readonly components: ComponentStore
  readonly resources: ResourceStore
  readonly events: EventLog
}
```

作战核心用的是 `World<UnitState>`。`kernel/` 只引用 `contract/` 与 `kernel/` 自己，单位记录、注册表和内置规则都在领域组里。

单位记录（`unit/record/`）只放各机制共用的事实：身份、阵营与种类、坐标与朝向、受击范围、移动方式、属性与基础值、状态与修饰、技能、计时器、标签、在场与倒下、`deployEpoch`、脚本参数。`deployEpoch` 每次部署（开场上场与再部署）加一，回旋物的世代读它。只有一种机制用的数据放在那个机制的组件里，见下面的内置组件表。

## 组件

组件是按单位存的一张表。`defineComponent` 返回键，id 写成 `模块id:名字`。

```ts
import { defineComponent, type MissionModule } from "arknights-mission-core"

const HITS = defineComponent<{ count: number }>("tally:hits", {
  create: () => ({ count: 0 }),
  view: (value) => value.count,
  reset: "clear",
})

const tally: MissionModule = {
  id: "tally",
  install(reg) {
    reg.subscribe("attack-hit", (event, ctx) => {
      const unitId = event.data.unitId
      if (typeof unitId === "string") ctx.component(HITS).ensure(unitId).count += 1
    })
  },
}
```

| 选项 | 含义 |
| --- | --- |
| `create(entityId)` | `ensure` 第一次取这个单位的值时调用 |
| `view(value)` | 给画面看的显示值，不计入状态 |
| `reset` | 再部署时 `keep` 保留原值，`clear` 删掉、下次 `ensure` 重建。缺省 `keep` |
| `codec` | 可选的 `encode` / `decode`，把值换成纯数据。缺省时值本身就是纯数据 |

`ctx.component(key)` 返回这张表：`get`、`ensure`、`set`、`delete`，以及按第一次写入顺序列出的 `entries()`。同一 id 定义了两个不同的键时，第一次使用就报错。

带 `view` 的组件，每个持有它的单位在快照的 `components` 里有一项，键是组件 id，值是 `view` 的返回值，按组件第一次使用的顺序。这一栏只给画面，不计入状态。

内置组件：

| id | 所在 | 内容 | view |
| --- | --- | --- | --- |
| `attack:profile` | `combat/attack/profile.ts` | 规格的 `attackClip`、`attackShape`，放入时建，只读 | 无 |
| `attack:boomerang` | `combat/attack/boomerang.ts` | 还没回到手上的回旋数量 | `{ out }` |
| `block:hold` | `unit/block/hold.ts` | `blocking`、`blockedBy` | 无（快照另有 `blocking`、`blockedBy`） |
| `target:priority` | `combat/target/priority.ts` | 规格或 `setAim` 写的索敌优先 | 无 |
| `damage:hit-limit` | `combat/damage/limit.ts` | 规格打开的首领限伤 | 无 |
| `damage:overheal-shield` | `combat/damage/shield.ts` | 治疗溢出转成的护盾 | 无 |
| `effect:immunity` | `ability/effect/immunity.ts` | 规格的免疫名单 | 无 |
| `element:gauges` | `combat/element/gauge.ts` | 各元素槽的值、上限、锁定，爆发中，最近打满的来源 | 最满的一槽 `{ element, ratio, locked }`，没有非空槽时是 `null` |
| `motion:shift` | `field/motion/shift.ts` | 正在走的强制位移 | 无 |
| `grid:route` | `field/grid/route.ts` | 敌人的路线进度与路线消失 | 无（快照的 `tags` 写 `hidden`） |

## 资源

资源是一场战斗里只有一份的数据。`create` 收到本场规格。

```ts
import { defineResource } from "arknights-mission-core"

const LEDGER = defineResource<{ kills: number }>("ledger:kills", () => ({ kills: 0 }))

// 在系统或订阅者里
ctx.resource(LEDGER).ensure().kills += 1
```

`ctx.resource(key)` 返回 `get`、`ensure`、`set`、`delete`。内置的地图（`field:grid`）、投射物（`combat:projectiles`）、费用（`economy:cost`）、内容排下的回调（`battle:schedule`）、已出场的刷出项（`battle:spawned`）和结果（`battle:result`）都是资源。

## 标签

标签是 `defineTag` 返回的带类型的键，带一句含义，可以蕴含别的标签。查询按键，不按字符串。

```ts
import { defineTag } from "arknights-mission-core"

const CHARMED = defineTag("charmed", { meaning: "follows the charmer" })
```

### 授予与撤销

标签按来源授予。同一来源授予几次就要撤销几次，所有来源都撤销后标签消失。

```ts
ctx.grantTag(unitId, CHARMED, "mark:charm")
ctx.hasTag(unitId, CHARMED) // true
ctx.tagSources(unitId, CHARMED) // ["mark:charm"]
ctx.revokeTag(unitId, CHARMED, "mark:charm")
```

| 来源 | 授予者 |
| --- | --- |
| `spec` | 单位规格的 `tags`，放入单位时授予 |
| `status:<状态id>` | 状态定义的 `tags`，状态施加、刷新、取下时重算 |
| `skill:<技能id>` | 技能规格的 `flags`，技能效果生效期间 |
| 模块自定 | `ctx.grantTag` |

`hasTag` 在持有这个标签、或持有的标签蕴含它时为真。蕴含只用于查询：蕴含得到的标签不进持有列表，也没有来源。需要区分来源的查询读 `tagSources`。

`grantTag` 要求标签已经注册。

### 注册

规格里的标签 id 要在建战斗前注册。核心标签每场战斗自动注册；内容模块在 `install` 里调用 `registerTag(key)`。模块都装好之后，开场单位与刷出项的规格标签、技能的 `flags` 里有未注册的 id，`createBattle` 抛出 `UnknownRegistrationError`，报出标签和来自哪个单位规格（技能的再报出技能 id）。`ctx.spawnUnit` 放入的规格也在放入时检查。

### 核心标签

包根导出这些键。

| 键 | id | 含义 |
| --- | --- | --- |
| `CANNOT_ACT` | `cannot-act` | 不能普攻、不能放技能 |
| `CANNOT_ATTACK` | `cannot-attack` | 状态持续期间不能普攻 |
| `CANNOT_CAST` | `cannot-cast` | 不能放技能 |
| `NO_MOVE` | `no-move` | 不能自主移动 |
| `STUN` | `stun` | 眩晕，蕴含 `cannot-act` |
| `FREEZE` | `freeze` | 冻结 |
| `COLD` | `cold` | 寒冷，再次寒冷会冻结 |
| `SILENCE` | `silence` | 沉默，蕴含 `cannot-cast` |
| `DISARM` | `disarm` | 缴械，蕴含 `cannot-attack` |
| `BIND` | `bind` | 束缚 |
| `FEAR` | `fear` | 恐惧 |
| `ATTRACT` | `attract` | 诱导 |
| `TREMBLE` | `tremble` | 战栗：被阻挡时停止普攻 |
| `NO_ATTACK` | `no-attack` | 单位本身不普攻 |
| `NO_BLOCK` | `no-block` | 不阻挡 |
| `UNBLOCKABLE` | `unblockable` | 不被阻挡 |
| `BLOCK_FLY` | `block-fly` | 能挡住飞行单位 |
| `DEVICE` | `device` | 装置，阻挡接触用装置半径 |
| `UNTARGETABLE` | `untargetable` | 不被选择器与普攻选中 |
| `INVULNERABLE` | `invulnerable` | 不受伤害 |
| `SLEEP` | `sleep` | 沉睡，见下文 |
| `STEALTH` | `stealth` | 隐匿：未破隐时不被普攻与范围效果选中 |
| `REVEAL` | `reveal` | 显形：隐匿不再生效 |
| `STEALTH_OFF` | `stealth-off` | 破隐期：隐匿不再生效 |
| `CAMOU` | `camou` | 迷彩：不被敌方普通攻击选中，正在挡它的单位除外 |
| `LIFTOFF` | `liftoff` | 起飞：敌方地面单位不能选中、不能命中 |
| `ISOLATED` | `isolated` | 孤立：不被友方选择器选中 |
| `CAN_HIT_FLY` | `can-hit-fly` | 普攻能打飞行单位 |
| `AIRBORNE` | `airborne` | 视为空中，敌人带着它算空中单位 |
| `LEVITATE` | `levitate` | 浮空，蕴含 `airborne` |
| `FLOAT` | `float` | 近地悬浮，蕴含 `airborne` |
| `NO_DISPLACE` | `no-displace` | 位移免疫 |
| `STATIC_BODY` | `static-body` | 静态刚体：不被位移 |
| `HIDDEN` | `hidden` | 不在场上可见，快照给路线消失的单位写上它 |
| `HIT_COUNT` | `hit-count` | 每下受击记 1 点，跳过减伤与乘区 |
| `HIT_COUNT_ARTS` | `hit-count-arts` | 只按次数计法术伤害 |
| `HIT_SLEEP` | `hit-sleep` | 攻击者能打到沉睡的目标 |
| `HEAL_FREE` | `heal-free` | 不接受治疗，生命回复与指明忽略的除外 |
| `NO_HEAL` | `no-heal` | 禁疗，来自自己的治疗除外 |
| `BURST_LOCK` | `burst-lock` | 元素损伤不累积、不爆发 |
| `NO_SP` | `no-sp` | 阻回：技力不自然回复，也不接受外界给予 |
| `TOKEN` | `token` | 召唤物，开战排在干员后面 |
| `DEFER_DEPLOY` | `defer-deploy` | 开战不上场，初始格子留给它 |

沉睡蕴含 `cannot-act`、`no-block`、`unblockable`：不能行动、不阻挡、不被阻挡。其余由各处查 `sleep`：选择器的 `sleep` 一项与范围效果去掉沉睡的单位，治疗的名单不带 `sleep` 一项，照常选中沉睡的友方；伤害挡下打向沉睡目标的一击，忽略沉睡的伤害与带 `hit-sleep` 的攻击者照常命中。眩晕的状态另授 `no-block`，被眩晕的干员放开所挡的敌人。

`CORE_TAGS` 列出全部核心标签。
