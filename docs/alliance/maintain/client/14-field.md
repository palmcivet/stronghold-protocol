---
title: 战场
description: 对局页的战场怎样叠在 HUD 下面：三维舞台、地面资源、战斗线索与特效，以及键盘网格与备战手势。
---

# 战场

对局 HUD 阶段里，战场部件 `core:match.field` 铺满屏幕，HUD 叠在它上面。整备区、选中棋子菜单、朝向轮盘与棋子标签属于战场一侧，不是界面部件。

## 组成

| 层 | 职责 |
| --- | --- |
| 三维舞台 | `mission-renderer` 的 `createMissionStage`：地面、棋盘、演员与特效 |
| 战斗状态与棋子菜单 | 浮在舞台上的 DOM |
| 键盘网格 | 备战可部署区域的无障碍网格，平时隐藏 |
| 整备区列表 | 只给键盘与屏幕阅读器，视觉上隐藏 |

舞台的画布放进战场层，铺满视口，边带里是地图边缘。顶栏与底栏的占位量成相机上下内边距（含画布相对视口的偏移），使棋盘落在它们之间；左侧队伍与右侧效果浮在地图上，不挤占相机（地图从它们底下穿过）。

## 舞台接线

`match/field/` 把对局状态接到 `mission-renderer`：

| 步骤 | 位置 | 作用 |
| --- | --- | --- |
| 建舞台 | `stage.tsx` → `createMissionStage` | 地面、特效表、音效线索绑定、演员世界 |
| 演员模型 | `actors.ts` → `createMissionResourcePort` | 经资源 store 加载 Spine；无模型时渲染器退回替身 |
| 外观 | `set-appearances` | 按资源键写入演员外观 |
| 地图 | `set-map` | 关卡地图；按阶段裁半场（见下） |
| 快照 / 事件 | `push-snapshot`、`push-event` | 本机演算或推流画面进渲染器 |
| 指针 | 舞台宿主的 pointer 事件 | 备战拖放与点选（见备战手势） |

地面资源经 `createGroundArtPort` 接入。兼容模式下，master 的 `b.start` 经 `compat/upstream` 的 `battleSpecOf` 转成 `BattleSpec`，再由播放层推进；见 [战斗规格适配](../compat/04-battle.md)。

## 显示什么

| 阶段 | 舞台显示 |
| --- | --- |
| 备战（`PREP`、`SP_DRAFT`） | 自己的棋盘与整备区 |
| 作战，本机在演算 | 本机战斗的快照 |
| 作战，服务端推流 | 兼容层映射后的快照与事件 |
| 既无本机演算也无推流 | 备战棋盘 |

- 播放层在 `match/playback/`。有桥接且 `b.start` 要求本机演算时，用 `mission-core` 推进并回报 `b.progress`、`b.result`；否则只显示服务端进度。
- 演员模型经资源键加载 Spine（`spine:char/…`、`spine:enemy/…`）。没有对应后端时，渲染器退回替身。
- 干员统一缩放 `MODEL_SCALE`（0.4）。敌人再乘目录里的 `modelScale` / `modelScaleY`。

## 地面

地面按 master 的 `PACK_IMAGES` / `PACK_MESHES` 挂上全部 image / mesh 槽位，以及 `tiles` 与 `gatePrefab`。

- 资源 store 里有官方漫反射贴图时，用官方键。
- 没有时，漫反射用程序绘制的替代贴图（2048）；其他槽位仍用官方键，缺文件只关掉对应特性。
- 本机抽出的棋盘贴图经本地覆盖清单叠进 ResourceStore；有官方漫反射后用官方贴图。安装步骤见 [本机棋盘贴图](../data/04-directory.md#本机棋盘贴图)。
- `model:mesh`、`json:board` 与风门水体相关槽位若上游包缺失，则保持空，不影响半场地面。

### 半场区域

常规备战与普通作战只建本方半场场地（不含敌人预览 pen；pen 镜头才加预览区）；联防阶段拼两侧半场（同样默认不含 pen）；最终攻势与隐秘核心用首领区（`boss`）。地图瓦片经 `clipMissionMapForPhase` 按同一规则裁剪——常规地图不相连，仅联防相连。

## 战斗线索与特效

舞台创建时依次安装：

1. `installOfficialFx`：渲染器自带的官方特效表
2. `installCombatFx`：伤害数字与技能发动瞬间

伤害数字按 master 默认：`damageNumbers` 为开，`officialDamageNumbers`（只显示红色）为关。个人配置暂不提供这两项。

技能发动（`skill-start`）绑定金色脉冲环与 burst，并播 `skill` 音效。

## 备战手势

备战阶段，舞台指针与商店栏共用一套棋盘动作：

- 舞台上拖放：棋盘 ↔ 整备区；点中格子也可起拖
- 商店栏拖到棋盘：捕获指针后落到格子（买入并放置）
- 拖出棋盘外：出售或销毁（`g.sell` / `g.destroy`）
- 点击落子；朝向仍用选中菜单
- 松散或已装备的物品在备战舞台上以投影 HTML 图标绘制（外观通道目前只有 Spine）
- 舞台画布 `pointer-events: none`，命中落在宿主上，以免挡住指针
- `resolveDrop` 对手牌 / 临时区附近的落点会吸附到 `HAND_ROW`，棋盘 → 整备区更稳

## 键盘网格

备战阶段，可部署区域有一张 DOM 表格叠在舞台上：

- 平时不可见；格子得到焦点时才显示。
- 方向键移动焦点；Enter 或 Space 选中或放下棋子。
- 指针在舞台上的点选与移动，与网格走同一套棋盘动作。

## 边界

战场部件有自己的错误边界。渲染出错只替换战场，四周的 HUD 照常工作。
