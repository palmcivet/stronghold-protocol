---
title: 特效与线索绑定
description: 特效种类按命名空间 id 注册，线索绑定决定每个事件画哪种特效、发哪种声音；舞台创建时封存并校验。
---

# 特效与线索绑定

舞台把释放的每条事件变成一条线索，按线索绑定决定画哪种特效、发哪种声音。特效种类登记在特效表里。特效表、线索绑定和头顶条读数表都在创建舞台之前配置，舞台创建时封存，之后不能再改。

```ts
import {
  createMissionCueBindings,
  createMissionEffectTable,
  createMissionStage,
  createPulseKind,
} from "arknights-mission-renderer"

const effects = createMissionEffectTable()
effects.register(
  createPulseKind({
    id: "my-mod:storm",
    accepts: ["cue:snow-storm"],
    anchor: (cue) => cue.data.unitId ?? null,
    shape: "ring",
    color: 0xc8e8ff,
    seconds: 1,
    radius: [0.5, 2],
    lift: 0.05,
  }),
)

const cues = createMissionCueBindings()
cues.declare("snow-storm")
cues.bind("cue:snow-storm", { effect: "my-mod:storm", sound: "element" })
cues.bind("my-mod:doll-swap", { effect: null, sound: null })

export const stage = createMissionStage(null, {
  effects,
  cues,
  onUnboundCue: (key) => console.warn(`no binding for ${key}`),
})
```

## 线索

线索由 `cueFor(event)` 从事件得到，带 `key`、`tick` 与 `data`。线索键有三种：

- 核心事件：事件名本身，kebab-case，不带冒号，如 `damaged`。
- 内容的线索种类：`cue:<kind>`。`cue` 是保留的命名空间，裸的 `cue` 不能绑定。
- 模组事件：`<namespace>:<event>`，必须带命名空间。经声明合并加入 `BattleEventMap` 的事件类型是 `MissionExtensionEventType`（即 `Exclude<BattleEventType, CoreEventType>`），不带命名空间时编译不过。

`data` 是事件数据。内容经 `CueMap` 声明的种类、模组经 `BattleEventMap` 声明的事件有类型；运行时才注册的模组事件，`data` 是普通记录。

## 线索绑定

绑定表的方法：`bind`、`declare`、`declared`、`get`、`keys`、`seal` 与只读的 `sealed`。新建的绑定表已经带上 `MISSION_EVENT_BINDINGS`：

- 它是每个核心事件的默认绑定，类型是 `MissionEventBindings`
- `MissionEventBindings` 以 `MissionCoreEventCueKey`（除裸 `cue` 外的 `CoreEventType`）为键，漏掉任何一个核心事件都编译不过
- 扩展事件不在默认表里，模组加入事件不会让渲染器编译失败；它们在运行时用 `bind` 绑定，没绑定时走 `onUnboundCue`

`bind` 新增或改绑一个键：

- `effect` 可以是一个种类 id，也可以是种类 id 的数组；数组里的每种特效都会为这条线索启动。`effectsOf(binding)` 把它统一成数组。
- `effect` 为 `null` 表示明确不画特效，`sound` 为 `null` 表示明确不发声。
- 不带冒号的键必须是核心事件；带冒号的键必须是 kebab-case 的 `<namespace>:<name>`。不合规时抛出 `RangeError`。
- 内容在运行时用 `declare(...kinds)` 声明自己会发出的 cue 种类（kebab-case，不带 `cue:`）。每个声明的种类在封存时都必须有 `cue:<kind>` 的绑定，明确不画、不发声也要写成 `{ effect: null, sound: null }`。
- 没有绑定的键不当作无画面：发出了既没绑定也没声明的键（例如漏声明的种类、模组事件）时，舞台对每个这样的键调用一次 `onUnboundCue`，不画也不发声。`onUnboundCue` 只是这类键的兜底。

## 特效表

特效表的方法：`register`、`replace`、`has`、`get`、`ids`、`seal` 与只读的 `sealed`。

id 是 kebab-case 的 `<namespace>:<name>`，名字可以用 `/` 分段。引擎的种类用 `mission:`。同一 id 再 `register` 抛错，换掉已有的种类用 `replace`；`replace` 不存在的 id 也抛错。绑定按 id 引用种类，所以换掉一个种类，绑定它的线索都会改画新的。

新建的特效表已经带上引擎的种类 `MISSION_EFFECT_KINDS`：

| id | 线索键 | 画面 |
| --- | --- | --- |
| `mission:hit-flash` | `damaged` | 实际扣血时，受击单位脚下的红色闪光，0.2 秒 |
| `mission:heal-flash` | `heal` | 实际回血时，单位脚下的绿色闪光，0.35 秒 |
| `mission:deploy-ring` | `deploy` | 部署时从单位脚下扩散的光环，0.5 秒 |
| `mission:damage-number` | `damaged`、`heal`、`dodged` | 单位头顶升起的伤害、治疗数字与 MISS，0.9 秒 |
| `mission:hit-spark` | `hit` | 没被取消的一击落在目标身上的几点火花，按伤害类型着色，0.25 秒 |
| `mission:projectile` | `projectile` | 从出手者胸口飞向目标胸口的光点，每游戏秒 12 格，追着移动的目标 |
| `mission:death-dissolve` | `removed` | 离场单位身上升起的光点：敌人暖色，友方薄荷色，约 1 秒 |
| `mission:shatter` | `removed` | 装置被摧毁时的碎片：箱子木色，炮台灰色，0.6 秒 |
| `mission:muzzle-flash` | `attack` | 装置出手时炮口的闪光，0.1 秒 |
| `mission:element-burst` | `element-burst` | 元素爆发时目标身上按元素着色的爆散，0.5 秒 |

`createPulseKind` 是前三种的通用实现：在线索所指单位的脚下画一个逐渐放大、淡出的圆盘或圆环。

## 伤害数字

伤害数字是单位头顶朝向镜头的一行字，它上升一段后淡出。`createDamageNumberKind(options)` 创建这种特效，引擎的 `mission:damage-number` 用缺省选项。

```ts
import {
  createDamageNumberKind,
  createMissionEffectTable,
} from "arknights-mission-renderer"

const effects = createMissionEffectTable()
effects.replace(createDamageNumberKind({ official: true }))
```

规则与参考实现一致：

- 缺省模式下，每次实际扣血按伤害类型着色显示四舍五入后的整数，实际回血显示绿色的 `+` 数字。
- `official: true` 时只显示核心标为红字（`red`）的扣血，以及 `miss` 的闪避。
- `miss` 的闪避显示黄色 `MISS`；普通闪避不显示数字。
- 数字在 0.9 秒内缓出上升 0.45 格，最后 0.27 秒淡出。
- 一次至少扣掉最大生命 18% 的数字放大到 1.35 倍。
- 颜色见 `MISSION_NUMBER_COLORS`，运动参数见 `MISSION_NUMBER_MOTION`。
- `texture(text, style)` 可以换掉文字的绘制；缺省的 `defaultNumberTexture` 用画布绘制，没有 DOM 时是空白贴图。
- `damageNumberOf(cue, official)` 给出一条线索要显示的单位、文字、样式与数值；这一模式下不显示时为 `null`。

## 通用形状

特效种类可以用八种通用形状写成，各自接一个函数，把线索换成这一次要画的样子，返回 `null` 时不画：

| 函数 | 画面 |
| --- | --- |
| `createBurstKind` | 从一点向外飞散的粒子，可以带上升速度与重力，随寿命淡出 |
| `createZoneKind` | 地面上的圆盘或圆环，淡入、保持、淡出；`blink` 时闪烁，用作范围预警 |
| `createBeamKind` | 两个单位胸口之间的光束，跟着单位移动，随时长淡出 |
| `createProjectileKind` | 从出手者飞向目标的光点，速度按游戏秒计 |
| `createTilesKind` | 点亮一组格子，渐隐；`warn` 时闪烁，用作预警 |
| `createVeilKind` | 盖住整个画面的一层颜色，随时长淡出，用作全屏闪光 |
| `createSnowKind` | 一片区域上的雪花：缓缓飘落，或 `gust` 时被风吹向行号增大的方向 |
| `createSlashKind` | 飞向一点的刀光：从起点拉出的拖尾，加上沿行进方向的新月 |

```ts
import { actorPoint, createBurstKind } from "arknights-mission-renderer"

export const sparks = createBurstKind({
  id: "my-mod:sparks",
  accepts: ["hit"],
  burst: (cue, context) => {
    const at = actorPoint(context, cue.data.targetId, 0.5)
    return at ? { at, color: 0xffffff, count: 6, life: 0.3, speed: 2 } : null
  },
})
```

`actorPoint` 给出单位模型所在的点，已加上 `hover`；第三个参数是额外的抬升格数。

## 官方特效模块

`installOfficialFx(table, bindings)` 把参考实现的全部 179 种 fx 种类装进特效表与线索绑定：

```ts
import {
  createMissionCueBindings,
  createMissionEffectTable,
  createMissionStage,
  installOfficialFx,
} from "arknights-mission-renderer"

const effects = createMissionEffectTable()
const cues = createMissionCueBindings()
installOfficialFx(effects, cues)
export const stage = createMissionStage(null, { effects, cues })
```

规则：

- `OFFICIAL_FX` 照抄参考实现的 `FX_KINDS`：键是参考实现名字的 kebab-case（`chen3Wave` 写成 `chen3-wave`），值是原型、颜色与缺省的半径、时长、定点。
- 模块注册 `official-fx:zone`、`official-fx:tiles`、`official-fx:beam`、`official-fx:slash`、`official-fx:burst`、`official-fx:snow`、`official-fx:veil` 七种特效，声明每个种类，并把 `cue:<种类>` 绑定到它的原型用到的形状；原型的形状见 `OFFICIAL_FX_RECIPES`。
- 原型为 `none` 的种类（`hit-cap`、`doll-end`）绑定为 `null`，不画。
- 线索带 `unitId`，而 `x`、`y` 缺省或离这个单位不到 0.75 格时，画在单位身上；否则画在 `x`、`y` 的地面上。定点的种类总画在 `x`、`y`。
- 半径取线索的 `r` 或 `radius`，缺省取种类的值，夹在 0.3 到 30 格之间。
- 时长取线索的 `dur`、`duration` 或 `t`（游戏秒），除以倍速换成现实秒。
- 爆炸、区域与元素原型按线索的 `element` 改用元素的颜色；`dmgType` 为 `arts` 的爆炸改用法术紫。
- 光束原型连接线索的 `from`（或 `src`、`unitId`）与 `to`（或 `target`）；两端不全在场时改画一团粒子。
- 半径达到 12 格的爆炸与预警改画全屏闪光，不画地面与粒子。
- 预警带 `tiles` 时点亮这些格子，不画圆环；`tiles` 可以是格子列表，`"box"` 表示方形，其他真值表示半径内的圆，最多 6 格。
- 火墙点亮穿过 `x`、`y` 所在格的一整列；`axis` 为 `row` 时是一整行。
- 火墙横贯整个场地 `field`；没有场地时向两侧各点亮 4 格，并裁到 19 行 21 列的棋盘内。
- 寒冷线索不带单位时是全场的风：画面闪一层冷色，雪从下往上吹过场地。
- 寒冷线索带单位时，冷色闪光更淡，单位周围飘一阵小雪。
- 剑气画一道新月，新月朝向线索的 `dc`、`dr`；线索带 `fromX`、`fromY` 时，从那里拉出拖尾。
- 这些数值见 `OFFICIAL_FX_SCREEN`。
- `officialTilesAround` 与 `officialWallTiles` 给出预警与火墙点亮的格子。
- `officialFxPoint` 给出一条线索画在哪里，`officialFxColor` 给出它的颜色，规则同上。
- 和参考实现一样，单位进出地形时不画特效：`terrain-enter`、`terrain-leave` 绑定为 `null`。需要地形提示的内容可以注册自己的特效种类，再用 `bind` 把这两个键改绑到它。

## 特效种类

一种特效由 `id`、`accepts` 与五个生命周期函数组成：`create`、`start`、`update`、`end`、`dispose`。它们收到的上下文带特效层 `layer`（Three 的 `Group`）、演员表 `actors`、本帧的单位列表 `units`、倍速 `speed` 与场地 `field`。

`field` 是格子矩形：有相机时是相机矩形，否则是整张地图；没有地图时是 `null`。`fieldOf(map, camera)` 给出同样的值。完整签名见 [API 参考](./09-api.md#特效)。

`accepts` 列出这种特效能画的线索键，`start` 收到的线索按它收窄。实例按种类放进对象池，生命周期如下：

1. 线索到来时从池里取一个实例，池空时调用 `create`。
2. `start` 为这条线索摆好实例。返回 `false` 表示没有可画的（例如单位已经不在），实例立即 `end` 并回池。
3. 之后每帧 `update`，返回 `false` 时 `end`，把对象从 `layer` 上拿下，实例回池。
4. 池满或舞台清空时，多出的实例调用 `dispose` 释放材质等资源。

每帧先推进已有的实例，再启动本帧的新线索。`reset` 与 `destroy` 结束所有正在播放的特效，并清空对象池。`stage.effects` 的 `live()` 按种类给出正在播放的数量，`idle(id)` 给出池里等待的数量。

## 封存与校验

`createMissionStage` 封存传入的（或缺省新建的）特效表、线索绑定和头顶条读数表，之后调用 `register`、`replace`、`bind`、`declare` 都抛错。舞台的配置在整个生命周期内不变，不支持热重载。

封存时同时校验：每个声明的 cue 种类都有绑定；每个绑定的 `effect` 指向的种类已经注册，并且它的 `accepts` 包含这个键。不满足时 `createMissionStage` 抛出 `RangeError`，一次列出所有问题。也可以直接调用 `sealMissionCues(effects, cues)` 提前检查。
