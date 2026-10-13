---
title: 地形与装置作用区
description: arknights-mission-core 让地块带上已注册的地形、让带朝向的装置圈出作用区，单位站上去时受影响；官方地形与风机气流由可选的内置模块提供。
---

# 地形与装置作用区

地形是注册在战斗里的一种地块规则。地块规格的 `terrain` 写地形 id，单位站在这一格时受它影响。机制本身不认识具体地形，数值由注册它的模块决定，一般从 `ctx.field()` 读。

## 示例

```ts
import {
  defineEffect,
  defineTerrain,
  type MissionModule,
} from "arknights-mission-core"

export const mudModule: MissionModule = {
  id: "my-mod",
  install(ctx) {
    ctx.registerEffect(
      defineEffect("my-mod:slow", {
        modifiers: [{ attribute: "moveSpeed", op: "percent", value: -0.3 }],
      }),
    )
    ctx.registerEffect(defineEffect("my-mod:stuck", { duration: 1 }))
    ctx.registerTerrain(
      defineTerrain("my-mod:mud", {
        effect: "my-mod:slow",
        period: 1,
        pathCost: 2,
        affects: { sides: ["enemy"] },
        onStay: (unitId, stay, count) => {
          if (count >= 3) {
            stay.applyEffect(unitId, "my-mod:stuck")
          }
        },
      }),
    )
  },
}
```

## 定义

地形用 `defineTerrain(id, definition)` 写出，用 `registerTerrain` 注册。规格写了未注册的地形 id 时，建战斗报 `UnknownRegistrationError`。可扩展契约名是 `terrain`，标成可扩展的地形可以 `replace` 或 `wrap`，见 [模块](./04-module.md)。

- `effect`：站上去时施加的效果。
  - 没有 `linger` 时，按来源 `terrain:<id>`（`terrainSource(id)`）单独挂一条，离开只取下这一条。单位自己身上的同名效果留着。
  - 有 `linger` 时施加计时效果，离开后继续计时到期。
- `linger`：秒，或读 `ctx` 算出秒数的函数。站在上面每拍把效果的剩余时长补到这么长。补时不送 `status`，不打断效果 `onTick` 的节奏。
- `period`：秒。进入那一拍与之后每隔这么久调用一次 `onStay`，`count` 从 1 起。
- `onEnter`、`onLeave`：进入、离开时调用。
- `affects.sides`：受影响的阵营，缺省两边。
- `affects.airborne`：为真时空中单位（飞行，或带 `airborne` 标签）也受影响，缺省不受。
- `pathCost`：地面流场走进这一格的代价，正整数，缺省 1。
- `tieBreak`：寻路权重，非负整数，缺省 0。少踩不可阻挡格的捷径沿途累计的权重不能比官方路线多。
- `deployable`：为 false 时这一格拒绝部署，与地块规格的 `deployable` 取「与」。

`pathCost`、`tieBreak`、`period`、`linger` 不成立时，`defineTerrain` 抛出 `RangeError`。

## 站位

站位系统 `engine:terrain` 在状态槽开头、条件效果之前运行，见 [战斗](./03-battle.md)。

- 判定的格子是单位坐标四舍五入后的那一格。
- 不在场、倒下、生命为 0、路线隐藏的单位与装置不受影响。
- 地形变了时先离开旧地形：送出 `terrain-leave`，取下它挂的那条效果，调 `onLeave`。
- 再进入新地形：送出 `terrain-enter`，挂上效果，调 `onEnter`。
- 推、拉、恐惧之后，在下一次站位时按新格子判定。
- 规格里没有地形、也没改过地形时，这个系统什么都不做。

站位记在组件 `TERRAIN_STANDING`（id 是 `terrain:standing`）：地形 id、进入的拍、`onStay` 的次数。再部署时清掉。

内置条件 `on-terrain` 读这份站位：单位正受 `params.terrain` 这种地形影响时成立，缺省任一地形。条件效果见 [效果](./10-effect.md)。

## 部署与寻路

`ctx.tile(x, y)` 返回合并后的地块：`deployable` 已与地形取「与」，`terrain` 是当前地形。部署策略的 `canStand`、倒地与恐惧落点都按它。地形拒绝部署的格子也算不可阻挡格，寻路见 [规格](./02-spec.md#寻路)。

## 改地形

- `ctx.setTerrain(x, y, id | null)`：改一格的地形，`null` 去掉地形。id 必须已注册，没有地块的格子不改。
- `ctx.terrainAt(x, y)`：读这一格当前的地形 id，没有时是 `null`。

改动让网格版本加一，已算好的流场作废。改过的格子随 `field:grid` 导出导入。签名见 [API 参考](./15-api.md#地形)。

## 装置作用区

作用区是装置按朝向圈出的一片格子。带作用区 `source` 标签的在场单位，按自己的攻击范围与朝向算出这些格子。单位站在里面时每拍受它影响。

```ts
import {
  defineTag,
  defineZone,
  type MissionModule,
} from "arknights-mission-core"

const PUSHER = defineTag("my-mod-pusher", { meaning: "pushes along its facing" })

export const pushModule: MissionModule = {
  id: "my-mod",
  install(ctx) {
    ctx.registerTag(PUSHER)
    ctx.registerZone(
      defineZone("my-mod:push", {
        source: PUSHER,
        onStay: (unitId, stay, visit) => {
          if (visit.moved !== null && visit.facing === "DOWN") {
            stay.setModifier(unitId, "my-mod:push", [
              { attribute: "moveSpeed", op: "mul", value: 1.2 },
            ])
          }
        },
        onLeave: (unitId, leave) => leave.clearModifier(unitId, "my-mod:push"),
      }),
    )
  },
}
```

- 作用区用 `defineZone(id, definition)` 写出，用 `registerZone` 注册，可扩展契约名是 `zone`。
- 系统 `engine:zones` 在状态槽里排在 `engine:terrain` 之后、条件效果之前。
- 放出作用区的单位要在场、未倒下、生命大于 0。
- 受影响的单位：在场、未倒下、生命大于 0、路线未隐藏，且不是装置。判定的格子是坐标四舍五入后的那一格。
- 同一格被同一种作用区的几台装置覆盖时，入场晚的那台算数。
- `onStay(unitId, ctx, visit)`：站在里面的每一拍调用。`visit` 带装置 id、装置朝向，以及上一拍以来的位移 `moved`。上一拍没有记录时 `moved` 是 `null`。
- `onLeave(unitId, ctx)`：离开作用格、自己倒下或离场、装置不在了时调用。
- 站位记在组件 `ZONE_STANDING`（id 是 `zone:standing`）。场上从没有过作用区装置时不建这张表。

## 官方地形

`officialTerrainModule`（id `official-terrain`）注册明日方舟的官方地块地形，以及风机气流作用区。它是可选的内置模块，规格的 `modules` 写上它才生效。

```ts
import {
  type BattleSpec,
  defineTerrain,
  type MissionModule,
  OFFICIAL_TERRAINS,
  officialTerrainModule,
} from "arknights-mission-core"

export const tiles: BattleSpec["tiles"] = [
  { x: 0, y: 0, height: 0, deployable: true, walkableBy: ["ground"], terrain: "mire" },
]

export const calmMire: MissionModule = {
  id: "my-mod",
  dependsOn: [officialTerrainModule.id],
  install(ctx) {
    ctx.replace(OFFICIAL_TERRAINS.mire, defineTerrain("mire", {}))
  },
}
```

- 数值从 `ctx.field()` 的 `special` 块读，块名与键名跟关卡数据一致。没写的项用 `OFFICIAL_TERRAIN_DEFAULTS`。
- 攻速写成绝对值小于 1 的小数时，按百分点换算，例如 -0.6 是攻速 -60。
- 四种地块地形都不影响空中单位。
- 沼泽在进入时先陷入一次，这是参考实现的假定：PRTS 只写「每秒触发一次」，没有写进入时是否先触发。
- 地形与作用区 id 都标成可扩展，可扩展键在 `OFFICIAL_TERRAINS`。内容模块可以 `replace` 或 `wrap`。
- 拒绝部署跟地块规格的 `deployable` 走，地形本身不拒绝。

| 地形 id | 影响 | 效果 | `special` 里的参数 |
| --- | --- | --- | --- |
| `mire` | 两边 | 进入时陷入一次，之后每个间隔一次。敌人每次一层，重量达到 `heavyWeight` 时两层；其他单位一层。每层攻速 `aspdPerStack`；敌人每层另减移速 `moveMulPerStack`。至多 `maxStacks` 层，离开即解除 | `mire.intervalSec`、`aspdPerStack`、`moveMulPerStack`、`maxStacks`、`heavyWeight` |
| `smog` | 干员 | 站在上面时隐匿，离开即解除 | 无 |
| `deepsea` | 敌人 | 攻速与移速降低。每秒受一次无来源真实伤害：不能闪避，不触发受击回复，伤害标签 `dot`、`periodic`、`deepsea`。寻路的 `tieBreak` 为 1 | `deepsea.bb` 的 `sea_drown[enemy].damage`、`.attack_speed`、`.move_speed` |
| `infection` | 两边 | 攻击力与攻速提升，每秒受一次无来源真实伤害，伤害标签 `terrain`。站在上面时一直补满时长，离开后计时到期 | `infection.bb` 的 `damage`、`atk`、`attack_speed`、`duration` |

缺省数值：

| 地形 | 缺省 |
| --- | --- |
| `mire` | 间隔 1 秒，每层攻速 -5、移速 -5%，至多 10 层，重量 3 |
| `deepsea` | 每秒 40，攻速 -60，移速 ×0.6 |
| `infection` | 每秒 70，攻击力 +20%，攻速 +20，持续 300 秒 |

### 风机气流

风机是带 `BLOWER` 标签（id `blower`）的装置。它的作用格是攻击范围按朝向旋出的格子，气流方向就是它的朝向。

- 黑板读风机自己的 `script`。没有时读 `ctx.field()` 的 `special.blower.bb`。
- 干员按自己的朝向与气流方向的关系改攻击力：相同是 `equal`，相反是 `opposite`，其余是 `vertical`。数值是 `blower_s_character[关系].atk`，按百分比加算。飞行干员不受影响。
- 敌人按上一拍以来的位移与气流方向的关系改移速。夹角余弦大于 0.7 是 `equal`，小于 -0.7 是 `opposite`，其余是 `vertical`。
- 敌人的移速乘 `1 + blower_s_enemy[关系].move_speed`，不小于 0。`vertical` 时不变。
- 敌人这一拍没动时，保持上一次的推力。单位第一次被记下的那一拍没有位移，按不变处理。
- 离开作用格或风机不在时解除。
