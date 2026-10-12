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

`createPulseKind` 是这三种的通用实现：在线索所指单位的脚下画一个逐渐放大、淡出的圆盘或圆环。

## 特效种类

一种特效由 `id`、`accepts` 与五个生命周期函数组成：`create`、`start`、`update`、`end`、`dispose`。它们收到的上下文带特效层 `layer`（Three 的 `Group`）、演员表 `actors` 与本帧的单位列表 `units`。完整签名见 [API 参考](./09-api.md#特效)。

`accepts` 列出这种特效能画的线索键，`start` 收到的线索按它收窄。实例按种类放进对象池，生命周期如下：

1. 线索到来时从池里取一个实例，池空时调用 `create`。
2. `start` 为这条线索摆好实例。返回 `false` 表示没有可画的（例如单位已经不在），实例立即 `end` 并回池。
3. 之后每帧 `update`，返回 `false` 时 `end`，把对象从 `layer` 上拿下，实例回池。
4. 池满或舞台清空时，多出的实例调用 `dispose` 释放材质等资源。

每帧先推进已有的实例，再启动本帧的新线索。`reset` 与 `destroy` 结束所有正在播放的特效，并清空对象池。`stage.effects` 的 `live()` 按种类给出正在播放的数量，`idle(id)` 给出池里等待的数量。

## 封存与校验

`createMissionStage` 封存传入的（或缺省新建的）特效表、线索绑定和头顶条读数表，之后调用 `register`、`replace`、`bind`、`declare` 都抛错。舞台的配置在整个生命周期内不变，不支持热重载。

封存时同时校验：每个声明的 cue 种类都有绑定；每个绑定的 `effect` 指向的种类已经注册，并且它的 `accepts` 包含这个键。不满足时 `createMissionStage` 抛出 `RangeError`，一次列出所有问题。也可以直接调用 `sealMissionCues(effects, cues)` 提前检查。
