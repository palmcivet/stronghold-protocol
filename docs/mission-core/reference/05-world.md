---
title: 世界、组件、资源与标签
description: 一场战斗的可变状态放在 World 里。模块用 defineComponent、defineResource、defineTag 定义带类型的键，按键读写和查询。
---

# 世界、组件、资源与标签

一场战斗的全部可变状态在一个 `World` 里（`kernel/world/`）。核心记录是按入场顺序排列的单位，其余数据挂在组件表、资源和标签上。模块不拿字符串去存取数据，而是先定义一个带类型的键，再按键读写。

`World` 的字段、单位记录内容、内置组件与资源的文件路径，以及 `exportWorld` / `importWorld` 的编码表，见 [World 与状态模型](../maintain/02-world-state.md)。

## 组件

组件是按单位存的一张表。`defineComponent` 返回键，id 写成 `模块id:名字`。

```ts
import { defineComponent, type MissionModule } from "arknights-mission-core"

const HITS = defineComponent<{ count: number }>("tally:hits", {
  create: () => ({ count: 0 }),
  view: (value) => value.count,
  reset: "clear",
})

export const tally: MissionModule = {
  id: "tally",
  install(reg) {
    reg.subscribe("attack-hit", (event, ctx) => {
      const unitId = event.data.unitId
      if (typeof unitId === "string") {
        ctx.component(HITS).ensure(unitId).count += 1
      }
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

内置组件按机制挂在各领域组（攻击画像与回旋、阻挡、索敌优先、限伤与护盾、免疫、元素槽、位移、路线、站定、额外攻击范围、技能触发区、再部署计划等）；路径与 view 见 [World 与状态模型](../maintain/02-world-state.md#内置组件)。

## 资源

资源是一场战斗里只有一份的数据。`create` 收到本场规格。

```ts
import { defineResource, type MissionModule } from "arknights-mission-core"

const KILLS = defineResource<{ kills: number }>("tally:kills", () => ({
  kills: 0,
}))

export const killCount: MissionModule = {
  id: "tally-kills",
  install(reg) {
    reg.subscribe("downed", (_event, ctx) => {
      ctx.resource(KILLS).ensure().kills += 1
    })
  },
}
```

`ctx.resource(key)` 返回 `get`、`ensure`、`set`、`delete`。内置的地图（`field:grid`）、投射物（`combat:projectiles`）、费用（`economy:cost`）、内容排下的回调（`battle:schedule`）、已出场的刷出项（`battle:spawned`）、结果（`battle:result`）和账本（`ledger:book`）都是资源。

`defineResource(id, create, options)` 的 `options.codec` 是 `encode` / `decode(data, spec)`，缺省时值本身就是纯数据；`options.transient` 为真的资源不导出也不导入，建战斗时重新放好（`core:engine` 指回本场的世界与注册表）。

## 标签

标签是 `defineTag` 返回的带类型的键，带一句含义，可以蕴含别的标签。查询按键，不按字符串。

```ts
import { defineTag, type MissionModule } from "arknights-mission-core"

const CHARMED = defineTag("charmed", { meaning: "follows the charmer" })

export const charm: MissionModule = {
  id: "charm",
  install(reg) {
    reg.registerTag(CHARMED)
  },
}
```

### 授予与撤销

标签按来源授予。同一来源授予几次就要撤销几次，所有来源都撤销后标签消失。

```ts
import type { ContentContext, TagKey } from "arknights-mission-core"

export function charmFor(ctx: ContentContext, unitId: string, tag: TagKey) {
  ctx.grantTag(unitId, tag, "mark:charm")
  ctx.hasTag(unitId, tag) // true
  ctx.tagSources(unitId, tag) // ["mark:charm"]
  ctx.revokeTag(unitId, tag, "mark:charm")
}
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

除 `NO_RANGE_EXTEND` 外，包根都导出这些键；`NO_RANGE_EXTEND` 只能经 `CORE_TAGS` 取到。

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
| `GROUNDBIND` | `groundbind` | 缚地：敌方空中单位算作地面单位，浮空时除外 |
| `FEAR` | `fear` | 恐惧 |
| `ATTRACT` | `attract` | 诱导 |
| `TREMBLE` | `tremble` | 战栗：被阻挡时停止普攻 |
| `NO_ATTACK` | `no-attack` | 单位本身不普攻 |
| `ATTACK_MOVES` | `attack-moves` | 不停止移动：敌人出手前后都不站定，边走边打 |
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
| `FLOAT` | `float` | 近地悬浮，蕴含 `airborne` 与 `no-displace`：算空中单位（只有能对空的才挡得住、打得到），仍走地面路线，推拉移不动 |
| `NO_DISPLACE` | `no-displace` | 位移免疫 |
| `STATIC_BODY` | `static-body` | 静态刚体：不被位移 |
| `HIDDEN` | `hidden` | 不在场上可见，快照给路线消失的单位写上它 |
| `HIT_COUNT` | `hit-count` | 每下受击记 1 点，跳过减伤与乘区 |
| `HIT_COUNT_ARTS` | `hit-count-arts` | 只按次数计法术伤害 |
| `HIT_SLEEP` | `hit-sleep` | 攻击者能打到沉睡的目标 |
| `HEAL_FREE` | `heal-free` | 不接受治疗，生命回复与指明忽略的除外 |
| `NO_HEAL` | `no-heal` | 禁疗，来自自己的治疗除外；治疗者的 `attackShape.healThrough` 可以穿过 |
| `NO_ALLY_HEAL` | `no-ally-heal` | 不能被友方治疗，来自自己的治疗除外；`healThrough` 穿不过 |
| `ALLY_TARGET` | `ally-target` | 友方目标：同阵营的普攻也选它，排在敌人之后 |
| `BURST_LOCK` | `burst-lock` | 元素损伤不累积、不爆发 |
| `NO_SP` | `no-sp` | 阻回：技力不自然回复，也不接受外界给予 |
| `TOKEN` | `token` | 召唤物，开战排在干员后面 |
| `DEFER_DEPLOY` | `defer-deploy` | 开战不上场，初始格子留给它 |
| `NO_RANGE_EXTEND` | `no-range-extend` | 技能标记：`ACTIVE_RANGE` 的触发范围不加永久攻击距离 |

沉睡蕴含 `cannot-act`、`no-block`、`unblockable`：不能行动、不阻挡、不被阻挡。其余由各处查 `sleep`：选择器的 `sleep` 一项与范围效果去掉沉睡的单位，治疗的名单不带 `sleep` 一项，照常选中沉睡的友方；伤害挡下打向沉睡目标的一击，忽略沉睡的伤害与带 `hit-sleep` 的攻击者照常命中。眩晕的状态另授 `no-block`，被眩晕的干员放开所挡的敌人。

`CORE_TAGS` 列出全部核心标签。

### 官方等级标签

`officialRankModule`（id `official-rank`）注册明日方舟的单位等级标签。它是可选的内置模块，规格的 `modules` 写上它才生效。

```ts
import { BOSS, createBattle, officialRankModule } from "arknights-mission-core"
import type { BattleSpec } from "arknights-mission-core"

declare const spec: BattleSpec
const battle = createBattle(
  { ...spec, modules: [...spec.modules, officialRankModule.id] },
  [officialRankModule],
)
console.log(battle.snapshot().units.filter((unit) => unit.tags.includes(BOSS.id)))
```

| 键 | id | 含义 |
| --- | --- | --- |
| `BOSS` | `boss` | 首领 |
| `ELITE` | `elite` | 精英 |

- 两个标签只是标记，不改战斗规则
- 画面按它们给头顶条加边框
