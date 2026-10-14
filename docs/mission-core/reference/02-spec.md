---
title: 规格
description: BattleSpec 描述一场战斗的种子、地块、单位、刷出和要安装的模块。
---

# 规格

`BattleSpec` 是 `createBattle` 的第一个参数，是一份纯数据。除 `notes` 外的字段都要给出。

```ts
import type { BattleSpec } from "arknights-mission-core"

export const spec: BattleSpec = {
  seed: 7,
  modules: ["deploy", "cost"],
  tiles: [
    { x: 0, y: 0, height: 0, deployable: true, walkableBy: ["ground"] },
    { x: 1, y: 0, height: 0, deployable: false, walkableBy: ["ground"] },
  ],
  units: [],
  spawns: [],
  deployStrategy: "deploy",
  cost: {
    ally: { initial: 10, regen: 1, cap: 99 },
    enemy: { initial: 0, regen: 0, cap: 0 },
  },
  notes: { mode: "practice" },
}
```

字段与类型见 [API 参考](./15-api.md#规格)。

- `seed` 生成这场战斗的随机数。
- 种子 0 换成固定的非零值。
- `modules` 是要安装的模块 id，顺序不决定安装顺序，依赖见 [模块](./04-module.md)。
- `units` 在创建时放入，id 重复会失败。
- `spawns` 留到 `spawn` 槽，`atTick` 等于当前拍数时放入。
- `deployStrategy` 为 `null` 时，`units` 一开始就在场。
- 写了策略 id 时，它们先不在场，创建结束时按该策略的 `opening` 上场。
- 内置策略的 id 是 `deploy`，要同时把 `deploy` 放进 `modules`。

- `cost` 是两个阵营各自的费用池。
- `initial` 是开场值，`regen` 是每游戏秒回复，`cap` 是上限。
- 没有内置的 10 / 1 / 99。
- 负值或非有限数按 0。
- 开场值超过上限时夹到上限。
- 装了 `cost` 模块才每拍回复。
- `spendCost` 和 `addCost` 不依赖这个模块。
- 见 [费用、阻挡与投射物](./12-field.md)。

`notes` 是给内容模块读的本场事实（例如地图或模式的参数），核心不解释，内容用 `ctx.field()` 读取；没写时读到空记录。它和规格的其余部分一样是纯数据，计入 `contentHash`。

## 地块

- `x` 是列，`y` 是行，行号向上增加。
- `walkableBy` 里的 `WALK`、`walk`、`ground`、`GROUND`、`ALL`、`all` 表示地面可走，`FLY`、`fly` 表示只有飞行可过。
- 地面可走的格子，飞行也能过。
- `objective` 为真的格子是保护目标，恐惧选落点时跳过。
- `terrain` 是已注册的地形 id，未注册时建战斗报 `UnknownRegistrationError`，见 [地形](./14-terrain.md)。
- 装了 `leak` 模块时，敌人站上这种格子会离场。

地块规格只写通用的几何与通行。高台、近战位、远程位这类部署规则由调用方的地图数据与部署策略解释（见 [模块 · 部署策略](./04-module.md#部署策略) 的 `canStand`），不在地块上加模式专用的字段。

### 寻路

- 地面单位按目的地建一张流场：从目的地出发按上、右、下、左四个方向逐格扩展，再把每一格的下一步拉直到视线可达的最远一格。
- 同样长的路线里，选穿过「不可阻挡格」更少的一条。
- 不可阻挡格是地面可走、但不是可部署的低地（`deployable` 为假或 `height` 大于 0）的格子，干员站不上去，也就挡不住走在上面的敌人。
- 流场按目的地与网格版本缓存；`setObstacle` 改动障碍、`setTerrain` 改动地形时网格版本加一，已算好的流场作废。
- 飞行单位直线飞向检查点，不走流场。

地形影响地面流场：

- `pathCost` 是走进这一格的代价，缺省 1
- `tieBreak` 加在不可阻挡格的同分罚分上
- 地形 `deployable: false` 的格子也算不可阻挡格

## 单位

- `attributes` 是调用方已经算好的基础值。
- 当前生命读 `hp`。
- 引擎会读的键还有 `maxHp`、`atk`、`def`、`res`、`aspd`、`bat`、`batPct`、`spRecovery`、`moveSpeed`、`massLevel`、`redeployMul`、`rangeExtend`、`rangeExtendBase`、`timerRate`、`times`、`ammoMax`、`atk_scale`、`taunt`，以及伤害和治疗乘区。
- 再部署读 `cost` 和 `respawnTime`（秒），没写或不是非负有限数时按 0。
- 阻挡读 `blockCnt` 和 `blockWeight`：没写 `blockCnt` 时按 1，没写 `blockWeight` 时按 1。
- 战斗读取属性时再叠状态和正在生效的技能修饰，见 [战斗](./03-battle.md)。
- `cost` 和 `respawnTime` 按单位上存放的数字读，不走这层汇总。
- `taunt` 是选择器里的嘲讽键。

`owner` 是记账的归属 id，对核心不透明，账本按它分行，缺省时只计入全场合计，见 [战斗](./03-battle.md#账本)。`kind` 缺省时友方是 `operator`、敌方是 `enemy`；`device` 是装置，倒下就被移除。

`facing` 缺省 `RIGHT`。`motion` 缺省 `WALK`。`attackRange` 和技能的 `triggerRange` 都按面向 `RIGHT` 填写，`x` 是列偏移，`y` 是行偏移，使用时转到单位朝向。

`hitArea` 是大体型受击矩形，单位是格。`w`、`h` 是宽高，`dx`、`dy` 是相对站位中心的偏移。缺省时单位占所站的一格。所站的格由坐标四舍六入五成双取整：恰在两格正中时取偶数格，如列 10.5 在第 10 列，列 11.5 在第 12 列。

`attackClip` 是攻击片段，`duration` 和 `hit` 都是秒，`hit` 是片段里的出手点。缺省时前摇是 0，命中后停 0.35 秒。见 [攻击](./08-attack.md)。

- `attackShape` 可选。
- 溅射、弹射、治疗链、治疗人数、锁定范围和投射物可以写在同一次攻击上。
- `damage` 单独表示物理、法术或治疗。
- 没写时是单体即时物理攻击。
- 字段见 [攻击](./08-attack.md)。

`tags` 里的每个 id 都要已注册：核心标签之外的由内容模块在 `install` 里 `registerTag`，否则 `createBattle` 报错。`token` 表示召唤物，`defer-deploy` 表示开战不上场，内置部署策略读这两个标签，见 [模块 · 部署策略](./04-module.md#部署策略)。核心标签见 [世界、组件、资源与标签](./05-world.md)。

- `targetPriority` 交给选择器的 `priority` 键。
- 空字符串不改变顺序。
- `blocking` 是这个单位正在阻挡的单位 id。
- `blockedBy` 是挡住它的单位 id。
- `aggroSeq` 缺省按入场先后，越晚越大；用部署策略时按部署先后重排，见 [选择器](./11-selector.md)。

- `hitLimit` 为真时，一次结算的数额向上取整达到 300000，这一整段取消。
- `immunity` 是免疫名。
- 冻结写 `frozen`，恐惧和战栗写 `feared`，其余与效果 id 相同。
- 见 [效果与属性](./10-effect.md)。
- `conditionalEffects` 见 [条件效果](./10-effect.md#条件效果)。

`script` 是这个单位的纯数据黑板，内容用 `ctx.script(unitId)` 读取，核心不解释；没写时读到空记录。

- `timers` 列出要启动的独立计时器 id。
- 引擎对每一项调用 `startTimer`。
- 缺省是空。
- 未知 id 拒绝创建。
- 内置 id 是 `charge`、`ammo`、`boomerang`，这三条只在友方身上启动。
- 见 [计时](./09-timer.md)。

- `route` 的检查点是 `move`、`wait`、`disappear`、`appear`，可以再带一个 `end`。
- 敌人在敌人槽里沿这条路线走。
- `FLY` 直飞检查点，地面走流场。
- 每秒移动的格数是汇总后的 `moveSpeed × 0.5`，`sluggish` 这类修饰算在里面。
- 正在走恐惧或诱导时，这一拍不沿路线走；带恐惧标签时也不沿路线走。
- `disappear` 给单位加上路线隐藏，快照多一个 `hidden` 标志。
- `blockedBy` 已经指向某个单位时，这一拍不再沿路线走。
- 走到 `end` 且那一格不是 `objective` 时停住。

- `redeployMul` 乘在再部署等待秒数上，缺省 1。
- `rangeExtend` 与 `rangeExtendBase` 把攻击范围每一行再往前延伸两者之和那么多格，见 [选择器](./11-selector.md)。
- `rangeExtendBase` 是永久的攻击距离：整场部署期间一直在、不随技能或限时效果结束的延伸（模组、天赋、常驻增益）；随技能或限时效果撤下的写进 `rangeExtend`。
- 技能触发只看 `rangeExtendBase`，见 [技能](./07-skill.md)。
- `massLevel` 参与推和拉的受力等级。

## 技能规格

`body` 和 `trigger` 必须是已经登记的标识，创建时检查。触发先归一化：转成大写，`ALWAYS` 记成 `SP_FULL`，`MANUAL` 记成 `NEVER`，以 `CUSTOM_RANGE` 开头的记成 `CUSTOM_RANGE`。`spType` 缺省 `time`，`operation` 缺省 `MANUAL`，`charges` 缺省 1。写了名单以外的技力类型或操作，放入单位时失败。

`mods` 在技能生效期间参加属性汇总，`op` 可以是 `add`、`percent`、`mul`、`independent`。`hooks` 是已注册技能钩子（`registerSkillHook`）的 id，规格保持纯数据；创建时检查，未注册报 `UnknownRegistrationError`。钩子和技能体上的同名回调一起被调用，看到 `{ unitId, skillId, reason, dt }`。

## 刷出

敌方的出场项缺省计入账本的总数，`inTotal: false` 时不计入（召唤物、分裂子体一类）。

到达该拍时单位放入、标成在场。友方有技能时开始技力和技能体计时，并送出 `spawn`。这次开始不加手动技能的 3 秒操作冷却。

## 技能与模块的选择

拼装单位规格之前，调用方按玩家选的技能与模块改写棋子记录，再取它部署时的攻击范围。

```ts
import {
  attackRangeGrid,
  type ChessRecord,
  loadoutRecord,
  resolveRecordLoadout,
} from "arknights-mission-core"

export function deployedRange(record: ChessRecord) {
  const loadout = resolveRecordLoadout(record, { skillIndex: 1, moduleId: "none" })
  return attackRangeGrid(loadoutRecord(record, loadout))
}
```

选择：

- `resolveRecordLoadout(record, request)` 给出生效的技能下标与模块 id，以及各自是否是缺省。
- 记录里没有的技能或模块退回缺省；模块写 `"none"` 表示不装。
- 没有模块可选的记录，`moduleId` 是 `null`；不是记录时结果是 `null`。

改写：

- `loadoutRecord(record, loadout)` 给出改写后的新记录，不改输入；缺省配置原样返回 `record`。
- 换了模块时，`stats` 是 `statsBase` 加模块的 `attr`（`composeStats`），保留六位小数。
- 换了模块时，`trait` 换成模块的 `traitOverride`，没有时用 `traitBase`。
- 换了模块时，`talents` 是 `talentsBase` 按模块的 `talentChanges` 改写（`composeTalents`）：同序号的覆盖，模块没写的键保留，`bb` 合并，新序号追加，空占位丢弃。
- 换了技能时，`skill` 是选中的技能，技能图标随之换掉；经容器召唤的天赋改用这个技能的召唤物。

攻击范围（`[行偏移, 列偏移]`，面向右）：

- 技能写着「被动效果：攻击范围扩大」时，用技能的范围。
- 否则，精英装着写「攻击范围扩大」的模块时，用模块序号 −1 那条天赋改写的范围。
- 都不是时用记录的 `rangeGrid`；没有范围时是 `null`。
- 最后加上特性的永久攻击距离（`traitRangeExtend`，向下取整）；只在集成战略生效的不加。
- `extendedGrid(grid, n)` 让每一行在最远端外多 1 到 ⌊n⌋ 格，最多 21 格；重复格去掉，无效项丢弃，不是数组得空。

签名见 [API 参考](./15-api.md#技能与模块的选择)。
