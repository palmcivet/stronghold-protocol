---
title: 演员
description: 快照里的每个单位对应一个演员；表现数据决定它的模型、缩放与头顶条，骨骼端口负责动画与绘制。
---

# 演员

舞台为快照中的每个单位建立一个**演员**。演员只读快照的顶层字段（位置、高度、朝向、`downed`、生命、生效的最大生命 `maxHp`、护盾）与组件视图（如 `attack:stand`），不推断玩法。模型、缩放、镜像这些纯表现的数据由宿主通过 `set-appearances` 给出。

```ts
import type {
  MissionAppearance,
  MissionBoard,
} from "arknights-mission-renderer"

const guard: MissionAppearance = {
  spine: "spine:enemy/slime",
  roles: {
    idle: "Idle",
    deploy: "Start",
    attack: { begin: null, loop: "Attack", end: null },
    attackDown: null,
    skill: null,
    die: "Die",
    move: { begin: null, loop: "Move", end: null },
    stun: null,
  },
  scale: 1,
  scaleY: 1,
  mirrorX: false,
  offset: { x: 0, y: 0, z: 0 },
}

export function dress(stage: MissionBoard): void {
  stage.dispatch({ type: "set-appearances", appearances: { guard } })
}
```

## 表现数据

`MissionAppearance` 的字段：

- `spine`：骨骼的资源键
- `roles`：动画角色表，把待机、部署、攻击、技能、倒下、移动、眩晕映射到骨骼里的动画名；没有的写 `null`
- `scale`：模型缩放；`scaleY`：在 `scale` 之上的纵向缩放
- `mirrorX`：单位朝右时模型朝左
- `offset`：偏移，单位是格；x 沿列、y 沿行、z 向上
- `tint`：可选，`0xRRGGBB`，乘进模型颜色
- `hpBar`：可选，缺省 `true`
- `forms`：可选，模型的形态列表，见下文
- `hover`：可选，模型离地的格数，飞行单位用；它在死亡动画期间保持离地，淡出时随透明度落下

`set-appearances` 按单位 id 合并，后给的覆盖先给的。

### 形态

形态是同一个模型的另一套动画。每个形态列出 `tags`、可选的 `without` 与可选的 `blocked`，再给一套 `roles`：

```ts
import type { MissionAnimRoles, MissionAppearanceForm } from "arknights-mission-renderer"

declare const hidden: MissionAnimRoles

export const stealthed: MissionAppearanceForm = {
  tags: ["stealth"],
  without: ["reveal", "stealth-off"],
  blocked: false,
  roles: hidden,
}
```

规则：

- 单位持有 `tags` 的每个标签、不持有 `without` 的任何标签，并且阻挡状态符合 `blocked`（给出时）时，这个形态生效。
- 按列表顺序取第一个生效的形态；没有生效的形态时用 `roles`。
- 形态切换时，当前的角色立刻改播新一套里的同名动画，没有过渡动画。
- `formOf(appearance, unit)` 给出生效形态在 `forms` 里的下标，没有生效的形态时为 -1。
- 上例按参考实现里假想敌：骨刺的写法，按有效隐匿切换形态；各模型的形态表是表现数据，由宿主给出。

## 生命周期

- 单位第一次出现在快照中：从对象池按单位种类取出根节点；有表现数据时经资源端口申请骨骼并创建实例
- `deploy` 事件：播部署动画，之后回到待机
  - 模型在部署之后才加载完时，从部署事件起已过的时间接着播部署动画
  - 那时部署动画已经播完的，不再补播，直接待机
- `attack` 事件：从头完整播攻击动画，之后回到待机
  - 攻击会顶掉还没开播的部署动画
- 位置在两帧之间变化：播移动动画
- `downed` 事件，或快照 `downed` 为 `true`：播倒下动画并停在最后一帧，头顶条隐藏
  - 倒下动画播完后姿态不再变化：骨骼不再推进，替身图集也不再重画，直到单位重新站起
- 快照 `downed` 回到 `false`：回到站立
- `removed` 事件：站着的单位先播完倒下动画，最多 `MISSION_ACTOR_DIE_SECONDS`（8 秒），再淡出
- 淡出：在 `MISSION_ACTOR_FADE_SECONDS`（0.6 秒）内淡出，之后释放骨骼实例与资源句柄，根节点归还对象池
- 单位不再出现在快照中而没有 `removed` 事件时，直接淡出

位置与朝向：

- 根节点在场景坐标中（x 为列，y 为高度，z 为负的行），位置是单位位置加 `offset`
- 有表面函数时站在它返回的高度上，否则用快照的 `height`；舞台有地面时用地面的 `surfaceHeight`，覆盖 `actors.surface`
- 朝向取快照的 `facing`：朝左时水平翻转，`mirrorX` 再翻转一次
- 缩放为 `scale`，纵向再乘 `scaleY`

### 推拉滑行

`displace` 事件之后，快照只给出终点。演员从事件到来时的位置匀减速滑向单位的位置：

- 滑行时长是事件的 `duration`（游戏秒）除以倍速；没有时长时是 0.14·√D 现实秒（D 是格数），夹在 0.12 到 0.45 秒之间，见 `MISSION_ACTOR_SLIDE`
- 走过的比例是 2u − u²，u 是已过时间占时长的比例，到时长时正好停在单位的位置
- `keepFacing` 为真时，滑行期间保持事件到来时的朝向；为假时随快照转向
- 滑行期间演员算作移动，播移动动画

### 炮台后坐

装置出手时朝目标反方向后坐 `MISSION_ACTOR_RECOIL.tiles`（0.06 格），后坐量每秒减少 5 倍，与参考实现的炮台一致。没有目标时沿朝向后坐。

## 头顶条

头顶条画在站立的演员上方，显示生命与护盾占 `maxHp` 的比例。

- `hpBar` 为 `false` 的单位不显示
- `stage.hud.bar(unitId)` 返回正在显示的比例，没有头顶条时为 `null`

另有三种读数，`stage.hud.readouts(unitId)` 返回正在显示的值：

- 弹匣 `magazine`：弹药技能持续时的剩余弹药，读快照 `skills` 的 `ammo`，画成生命条下方的黄色条；敌人不显示
- 计数 `pips`：一排小方块，剩余的亮，用掉的暗
- 负生命池 `negative`：0 到 1，画成盖在生命条上的红色条

计数与负生命池的读法由使用方登记在读数表里，经 `options.hud` 传给舞台：

```ts
import {
  createMissionHudReaders,
  createMissionStage,
  type MissionHudCount,
} from "arknights-mission-renderer"

const hud = createMissionHudReaders()
hud.register({
  id: "my-mod:stock",
  readout: "pips",
  read: (unit) =>
    (unit.components["my-mod:stock"] as MissionHudCount | undefined) ?? null,
})
const stage = createMissionStage(null, { hud })
console.log(stage.hud.readouts("guard"))
```

- 读数表按命名空间 id 登记，可以 `replace`，舞台创建时封存
- 同一种读数有多个读法时，按登记顺序取第一个读到值的
- `hudReadoutsOf(unit, readers)` 单独计算一个单位的读数

### 状态、等级与残影

头顶条还按单位的标签画出状态图标与等级边框，并在生命下降时留下残影。

```ts
import { BOSS } from "arknights-mission-core"
import { createMissionStage, MISSION_HUD_ICONS } from "arknights-mission-renderer"

const stage = createMissionStage(null, {
  hudStyle: {
    icons: MISSION_HUD_ICONS,
    iconTexture: () => null,
  },
})
console.log(stage.hud.icons("guard"), stage.hud.frame("guard") === BOSS.id)
```

- 状态图标：单位带上 `MISSION_HUD_ICONS` 里的标签时，条上方画出对应图标，按表的顺序排列
- `iconTexture(icon)` 返回图标贴图；返回 `null` 时画图标颜色的方块
- 等级边框：取 `MISSION_HUD_FRAMES` 里单位带的第一个标签；首领 `boss` 是红框、条宽两倍，精英 `elite` 是橙框
- 残影：浅色条停在先前的生命比例上，每秒下降 `MISSION_HUD_GHOST_DRAIN`（0.9）个满条，降到当前生命为止；生命回升时立即跟上
- `stage.hud.icons(unitId)`、`stage.hud.frame(unitId)`、`stage.hud.ghost(unitId)` 返回正在显示的图标键、边框标签与残影比例
- 图标表与边框表可以经 `hudStyle.icons`、`hudStyle.frames` 换掉

### 技力条

有技力消耗的友方单位，生命条下方画一条技力条。

```ts
import { createMissionStage } from "arknights-mission-renderer"

const stage = createMissionStage(null)
const sp = stage.hud.sp("guard")
console.log(sp?.ratio, sp?.state, sp?.glow)
```

- 技力条读单位第一个 `spCost` 大于 0 的技能，长度是 `sp / spCost`
- 状态 `charging` 是蓝色，`ready` 是黄色，`active` 是橙色
- 技能未开且技力满时是 `ready`，条的右端加一团叠加混合的光
- 光的不透明度按 `MISSION_HUD_SP.pulse` 起伏：`0.55 + 0.35 · sin(6t)`，`t` 是头顶条累计的秒数
- 弹药技能持续时，弹匣条占用这个位置，技力条不画
- 敌人不画技力条
- `stage.hud.sp(unitId)` 返回 `{ ratio, state, glow }`，没有技力条时为 `null`

### 受击抖动

首领的头顶条与装置在受击后左右抖动，与参考实现相同。

- 头顶条：单位的生命比上一帧少 0.5 以上时，抖动时长重置为边框的 `shake` 秒；首领边框是 0.25 秒，其余边框不抖
- 头顶条的偏移是 `sin(90t) · 剩余秒数 · MISSION_HUD_SHAKE.amplitude` 格
- 参考实现按像素抖动；`amplitude` 0.16 格是按 64 像素一格换算的假定值
- 装置：`damaged` 事件的目标是装置时，演员的 `shake` 重置为 `MISSION_ACTOR_SHAKE.seconds`（0.2 秒）
- 装置根节点沿列方向偏移 `sin(80t) · shake · 0.05` 格
- 抖动时长每帧按真实秒数递减，到 0 停住
- `stage.hud.shake(unitId)` 返回头顶条这一帧的偏移

### 再部署圈

倒下且在等待再部署的单位头顶画一个圆环和剩余秒数。

- 圆环的亮弧是剩余等待占总时长的比例，读快照的 `redeploy`
- 弧按 `MISSION_HUD_RING.steps`（64）份量化，同一份数的几何体由所有圆环共用
- 秒数向上取整；每个数字的贴图只建一次，所有圆环共用；`hudStyle.digitTexture(digit)` 可以换掉缺省的画布数字
- `stage.hud.ring(unitId)` 返回 `{ left, seconds }`，没有圆环时为 `null`
- 单位站起或离场时圆环移除

## 替身

**替身**（impostor）把骨骼画进共享的渲染目标页，再用一块贴图显示，适合拥挤的场面和带裁剪附件的骨骼。`createMissionImpostorAtlas` 创建替身图集。

舞台选项 `impostor` 给出且地面有 WebGL 渲染器时，舞台在这个渲染器上建图集，演员经它绘制骨骼；地面每帧绘制之前 `flush` 一次。舞台销毁时清空图集。

```ts
import { createMissionStage } from "arknights-mission-renderer"

const stage = createMissionStage(null, {
  impostor: { interval: 3, pixelsPerUnit: 1 },
})
console.log(stage.actors.actors.size)
```

演员的规则：

- `impostor` 系统在 `skeleton` 之后运行。演员按更新序轮流，每帧从 0 数起；视锥外的演员不占轮次，保留原来的图像
- 槽的大小是骨骼的 `bounds()` 乘根节点缩放与 `pixelsPerUnit`（缺省 1）
- 换了骨骼、包围盒超出槽、或绘制缩放变化超过 `IMPOSTOR_RESCALE`（12 %）时，演员放掉旧槽、取新槽，当帧重画
- 有槽时骨骼从根节点取下，根节点上显示一块贴着槽的四边形；没有槽（图集满了）时骨骼直接挂在根节点上绘制
- 骨骼数据的 `clipping` 为真时，槽取在裁剪页上
- 演员释放、换骨骼或 `setImpostor(null)` 时放掉槽，骨骼挂回根节点
- 没有 WebGL 地面时舞台不建图集，骨骼都直接绘制
- 替身只经骨骼端口拿骨骼的 `object3d`、`bounds()` 与 `data.clipping`，不引用具体的骨骼运行时

图集的规则（按货架分配）：

- 槽的边长向上取整到 `grid`（缺省 16 像素）
- 槽排在**货架**上：一行同高的槽，从左往右排。高度在请求的 1 到 1.5 倍之间的货架可用；放不下时在页面上方剩下的空间开新货架
- 放掉的槽先给宽度在请求的 1 到 1.5 倍之间的请求复用
- 货架的最后一个槽放掉时货架清空；页面顶端的空货架交还，所以槽全部放掉的页从头开始
- 主页缺省 2048 像素、最多 3 页；带裁剪的骨骼用单独的裁剪页，缺省 1024 像素、最多 2 页；页按需新建
- 所有页都放不下或尺寸超过页面时，`alloc` 返回 `null`
- `draw` 把骨骼排进队列；`flush` 每帧一次，在主渲染之前逐个画进槽：只清空并重画排了队的槽（视口与裁剪框都设成槽），别的槽保留原来的图像；之后恢复原来的渲染目标与清屏透明度
- `impostorDue(refresh)` 决定这一帧是否重画：
  - 按演员在本帧更新序里的位置，把重画均匀分散到间隔内
  - 图像过期、缩放变化超过 12 % 或间隔不大于 1 时立即重画
  - 最迟两个间隔重画一次
  - `held` 为真且图像没过期、缩放没变时不重画；演员目前总是传 `false`，不判断姿态是否保持

## 剔除

舞台的 `cull` 系统按地面相机的视锥剔除：

- 演员用球测试：以位置为心，半径 1.5 格乘外观缩放
- 特效对象用包围盒测试
- 视锥外的演员 `culled` 为真、根节点不可见，`skeleton` 系统不推进它的动画（切换动作照常记下），回到视锥内时恢复
- 特效对象只隐藏，生命周期照常推进

## 骨骼端口

演员只经**骨骼端口** `MissionSkeletonRuntime` 使用骨骼：`load` 读入骨骼数据，`create` 建实例，`dispose` 释放数据。换运行时只换端口的实现。

```ts
import type { AssetResolver } from "arknights-assets-catalog"
import {
  createMissionResourcePort,
  createMissionSkeletonLoader,
  createMissionSkeletonRuntime,
  createMissionStage,
} from "arknights-mission-renderer"
import { TextureLoader } from "three"

export function stageWithModels(resolver: AssetResolver) {
  const textures = new TextureLoader()
  const skeleton = createMissionSkeletonRuntime({ scale: 0.01 })
  const resources = createMissionResourcePort({
    resolver,
    image: (url) => textures.loadAsync(url),
    spine: createMissionSkeletonLoader(skeleton, {
      bytes: async (url) =>
        new Uint8Array(await (await fetch(url)).arrayBuffer()),
      text: async (url) => (await fetch(url)).text(),
      texture: (url) => textures.loadAsync(url),
    }),
    model: async (url) => (await fetch(url)).text(),
    json: async (url) => (await fetch(url)).json(),
  })
  return createMissionStage(null, { actors: { skeleton, resources } })
}
```

默认实现 `createMissionSkeletonRuntime({ scale })` 读取 Spine 3.8 的二进制或 JSON 骨骼。`scale` 是每个骨骼单位（像素）对应的场景单位，缺省 0.01。

- 加载：`createMissionSkeletonLoader(runtime, fetch)` 是资源端口的 `spine` 加载函数；取骨骼、图集与页，按文件名把图集页对上条目的页文件；页贴图存的是颜色，读作 sRGB
- 图集：`parseMissionAtlas` 读 `.atlas` 文本；页贴图是宿主给的 Three 纹理，按默认的 `flipY` 上传
- 网格：每个实例一份 `BufferGeometry`，每帧按插槽的绘制顺序写入顶点、贴图坐标与颜色，按页与混合模式（normal、additive、multiply、screen）分组绘制
- 事件：`event` 是动画里的关键帧事件，`complete` 是一轮播完，`end` 是离开轨道
- 裁剪：裁剪附件用模板缓冲实现，凹多边形同样适用；渲染器需要模板缓冲，地面自动创建的渲染器带有模板缓冲。机制见 [架构设计](./10-architecture.md#骨骼运行时)
