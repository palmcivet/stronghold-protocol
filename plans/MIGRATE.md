- [范围与原则](#范围与原则)
- [目标目录](#目标目录)
- [master 源码对照](#master-源码对照)
  - [shell 与界面基底](#shell-与界面基底)
  - [connection 与 store](#connection-与-store)
  - [screen](#screen)
  - [preparation](#preparation)
  - [panel](#panel)
  - [field](#field)
  - [playback 与 observation](#playback-与-observation)
  - [audio 与 resource](#audio-与-resource)
  - [text](#text)
  - [共享逻辑](#共享逻辑)
  - [开发工具](#开发工具)
- [按架构重做](#按架构重做)
- [不迁移](#不迁移)
- [0.2.x 功能清单](#02x-功能清单)
- [依赖其他域](#依赖其他域)
- [测试迁移](#测试迁移)
- [验收](#验收)

本文是 `app/client` 从 master（0.2.1；参考副本放在 `app/compat/upstream/repo/`，不入库，由用户放入）迁移的指南。架构方向见 [ARCH.md](ARCH.md)，需求见 [FEATURE.md](FEATURE.md)，其他域的剩余工作见 [remaining.md](REMAIN.md)。

## 范围与原则

- 迁移对象是 master 的浏览器客户端：`public/js/`、`public/css/`、`public/i18n/`、`public/index.html`、`public/dev/`，以及客户端用到的 `shared/` 模块。
- master 只作为行为参照，按 [ARCH.md](ARCH.md) 重写，不保留 Preact、htm 与全局 store 的结构。
- 客户端只使用 `app/contract` 的形状。连接 upstream 后端时，数据与战斗经 `app/compat/upstream` 转换（[remaining.md](REMAIN.md) 第 2、3 节），其他目录不出现 master 格式。
- 资源只经资源键（`AssetKey`）与 `resource/` 申请，不解析地址。`app/client/resource` 的叠加、缓存与兼容模式见 [资源从哪里来](../docs/alliance/data/03-resource.md#客户端加载)。
- 目录与文件用名词、kebab-case：`preparation` 不写成 `prepare` 或 `prep`，`panel` 不写成 `hud`，`observation` 不写成 `observe`。
- 浏览器里的卫戍界面从 `shell/` 露出全局 API，供 `deployment` 的页面脚本和社区外壳调用：加入房间、提交意图、读取当前视图。外壳由社区实现。

## 目标目录

```text
app/client/
  shell/          启动、路由、全局 API、设置页、连接横幅、提示
  connection/     WebSocket、重连、请求 id、握手 ext、后端判定、扩展信道
  store/          会话、房间、对局视图、播放、设置、模组分片
  intent/         意图总线：动作与按键、手柄映射、模组拦截、本地合法性预览、调试记录
  part/           部件注册表、<Part id>、错误边界与安全模式、布局数据
  theme/          设计令牌、层叠顺序、基础样式
  primitive/      宿主基础组件（React Aria），导出给模组
  text/           多语言目录、t()、语言包加载、master msgid 对照表
  mod/            ModContext 客户端宿主、模组加载、确认、存储命名空间
  screen/         整页屏幕
  preparation/    休整期操作
  panel/          对局常驻界面
  field/          持有 mission-renderer 舞台
  playback/       战斗播放与战报
  observation/    观看规则的界面投影
  audio/          混音与界面音效
  resource/       资源生命周期
  test/           多文件参与的用例
```

`store/`、`intent/`、`part/`、`theme/`、`primitive/`、`text/`、`mod/` 对应 ARCH 的[客户端数据流](ARCH.md#客户端数据流)、[表现层](ARCH.md#表现层)、[前端](ARCH.md#前端)、[多语言](ARCH.md#多语言)与[服务端下发界面](ARCH.md#服务端下发界面)。样式跟它所服务的屏幕或组件放在一起。

## master 源码对照

路径相对 master 根目录。

### shell 与界面基底

| master | 去向 | 做法 |
|---|---|---|
| `public/js/main.js` | `shell/` | 启动（字体、身份、连接）、路由与全局浮层。路由由房间与对局阶段推导，没有 URL 页面栈 |
| `public/index.html` | `app/client/index.html` | 只保留挂载点与入口 |
| `public/js/ui/device.js` | `shell/` | 特性检测（触屏、悬停、全屏、减少动效），不做 UA 嗅探 |
| `public/js/ui/settings.js`、`ui/gameLogic/settings.js` | `shell/` | 设置页：语言、按键、画质、音量 |
| `public/js/ui/toasts.js`、`ui/connBanner.js` | `shell/` | 提示与连接横幅 |
| `public/js/ui/components.js`、`ui/gameComponents.js` | `primitive/` | 用 React Aria 重做，只使用设计令牌 |
| `public/js/ui/richText.js` | `primitive/` | 富文本组件，文本来自 `text/` |
| `public/js/ui/clipboard.js` | `primitive/` | 复制操作 |
| `public/css/theme.css` | `theme/` | 设计令牌的初始值 |
| `public/css/components.css`、`devices.css` | `primitive/` | 改为 CSS Modules，放进 `@layer components` |
| `public/css/screens/*.css`、`emotes.css` | 对应屏幕与面板目录 | 跟随所服务的组件 |

### connection 与 store

| master | 去向 | 做法 |
|---|---|---|
| `public/js/net.js` | `connection/` | 连接、重连、请求 id、发送意图。握手时按 [remaining.md](REMAIN.md) 第 3 节判定后端类型，决定是否启用兼容层 |
| `public/js/store.js` | `store/` | 拆成按领域的 `zustand` 仓库与选择器。它是界面状态，权威记录在服务端 |
| `public/js/screens/game/early.js` | `playback/` | 中途进入战场时需要重放的事件 |

### screen

| 屏幕 | master |
|---|---|
| 标题 | `screens/title.js` |
| 大厅 | `screens/lobby.js` |
| 房间 | `screens/room.js` |
| 简报 | `screens/briefing.js` |
| 策略选择 | `screens/bandDraft.js`、`ui/gameLogic/draft.js` |
| 干员调配 | `screens/loadout.js`、`ui/loadoutModel.js`、`ui/loadoutSync.js`、`ui/gameLogic/loadout.js` |
| 干员持有 | `screens/ownership.js`、`ui/ownershipModel.js` |
| 自选编队 | `screens/diy.js`、`ui/diyModel.js`、`ui/gameLogic/diy.js` |
| 结算 | `screens/result.js`、`ui/gameLogic/result.js` |
| 对局 | `screens/game.js` 中处于对局阶段的部分，`screens/game/overlays.js`（对局结束板、单人暂停板） |

`screens/game.js` 按阶段兼管简报、策略、对局与结算。拆开后，对局屏幕只把休整、常驻界面、战场与播放装到同一页。每个屏幕由部件 id 组成，布局是数据（[表现层](ARCH.md#表现层)）。

### preparation

休整期操作。规则由服务端判定，这里把指针与按键变成意图。

- `ui/gameActions.js`：全部 `g.*`，改为发往 `intent/` 的意图。
- `ui/gameLogic.js`、`ui/gameLogic/placement.js`、`ui/gameLogic/shop.js`、`ui/gameLogic/terrain.js`、`ui/gameLogic/standIn.js`：放置是否合法、商店、地形与补位的客户端对照，作为意图总线的本地预览。
- `ui/shopBar.js`、`ui/equipReplace.js`、`ui/choiceOverlay.js`、`ui/rewardOverlay.js`、`ui/buildGuard.js`。
- 从渲染器移出的休整棋盘：`render/drag.js`（手牌、临时区、棋盘之间的拖放）、`render/prepfield.js`（首领半场镜像、休整相机用的格子）、`render/pen.js`（待战敌人的笔）、`render/promote.js`（合成后的精英提示）。
- `ui/facing.js`、`ui/facingWheel.js`：部署朝向。
- `ui/underframe.js`：己方棋子的选择菱形与出售、销毁按钮。它发出意图，所以归入休整。
- `screens/game/standInTags.js`：非持有棋子的「替补」标记。

### panel

对局常驻界面，只读视图与快照。点选单位只打开详情，不向作战核心发指令，技能由作战自己释放。

- `ui/hud.js`、`ui/combatHud.js`、`ui/matchChrome.js`、`ui/matchStatus.js`、`ui/matchInfo.js`、`ui/ticker.js`
- `ui/teamPanel.js`、`ui/detailPanel.js`、`ui/abilityLines.js`
- `ui/bondStrip.js`、`ui/gameLogic/bonds.js`、`ui/effectsList.js`、`ui/enemyDrawer.js`、`ui/gameLogic/enemies.js`
- `ui/emotes.js`：表情轮盘。36 条表情已在资源编译中，线路白名单已在 `app/contract`；表情图是资源键 `image:ui/emoticon/<dir>/<picId>`（`emoteArtKey`）。
- `ui/guide.js`、`ui/gameLogic/panel.js`、`ui/gameLogic/phases.js`（改为 `store/` 选择器）、`ui/gameLogic/format.js`（数值格式化，改由 `text/` 提供）、`ui/gameLogic/shared.js`
- `ui/gameLogic/shortcuts.js`：快捷键表，进入 `intent/` 的按键映射。

### field

- `ui/fieldHost.js`：持有 `mission-renderer` 的舞台。休整时喂棋子列表，作战时喂快照与事件，并传入主应用算好的相机。
- `render/app.js`、`render/app/view.js`、`render/app/tune.js`、`ui/gameLogic/camera.js`、`screens/game/marks.js`：卫戍的机位（休整、普通、联防、首领、首领休整、笔）与高亮样式由 `field/` 计算，以矩形与边距传给舞台。
- `render/app/info.js`、`render/app/host.js`：把对局视图与 `mission-core` 快照转成 renderer 输入，资源查询改走 `resource/`。
- `ui/fallbackField.js`：没有 GPU 视图时的战场表示，重做为可被屏幕阅读器与键盘使用的 DOM 战场。
- `render/style.js` 中的界面配色并入 `theme/` 的令牌。

### playback 与 observation

- `playback/` 是 `public/js/battle/runner.js` 中属于卫戍的部分：权威战场与观战副本、暂停、漏怪计数、联防剩余、盟约层，以及向服务器发送 `b.progress`、`b.result`。逐 tick 推进调用 `mission-core/runner`。连接 upstream 后端时，战斗输入与输出经 `app/compat/upstream/battle` 与 `result`。
- `observation/` 是 `public/js/battle/observe.js`、`ui/gameLogic/watch.js`、`ui/watchBonds.js`：何时可以看队友、联防与首领战的左右半场、何时返回自己的战场，以及观看时的盟约栏。

### audio 与 resource

- `audio/` 是 `public/js/audio.js` 的混音与界面音效，只接收资源句柄与音效线索。音效线索按清单 `refs`（`sfx`、`voice`、`bgm`）映射到 `audio:` 键，经 `assets-catalog` 的音频缓存加载（[缓存](../docs/assets-catalog/05-cache.md#音频)）；`public/js/media.js` 的 `/media/` 无扩展名地址策略不保留，音频与其他资源用同一路径格式。
- `resource/` 接收了 `public/js/assets.js` 的资源生命周期：清单叠加与重试、图片缓存、预加载组、句柄释放与本地覆盖清单，见 [资源从哪里来](../docs/alliance/data/03-resource.md#客户端加载)。哪个屏幕何时预加载哪一组由界面迁移决定；清单的 `preloadGroup` 现在都为 `null`。
- `public/js/data.js` 的数据懒加载改为按握手下发的 `seasonId` 与数据地址读取赛季包与文案（房间视图带赛季 id）；本地化的游戏数据由 `text/` 的 `data:` 键提供。

### text

- `shared/i18n.js`、`shared/i18nPacks.js`、`shared/i18nData.js`、`shared/packs.js` 的客户端部分、`public/js/ui/lang.js`、`public/i18n/*.json`，按 [多语言](ARCH.md#多语言) 重做为命名空间键。
- `en.json` 按 msgid 映射到新键；`ja`、`ko`、`zh-TW` 为机器翻译，重新生成。
- 服务器播报按玩家语言显示：连接 master 服务端时，用 msgid 对照表翻译 `{ text, msgid, params }`。

### 共享逻辑

| master | 去向 |
|---|---|
| `shared/protocol.js`、`shared/constants.js` | 已在 `app/contract` |
| `shared/highGround.js` | 已在 `app/contract`（`meleeOnHighGround`） |
| `shared/standIn.js`、`shared/diy.js`、`shared/loadoutRecord.js`、`shared/bandBonds.js` | 两端共用的纯逻辑，放进 `app/contract`；服务端已有的实现一并收拢 |
| `shared/media.js` | 不迁移：next 的资源路径格式统一，不保留 `/media/` 无扩展名音频路由；master 的 `/media/` 只在连接 master 时由兼容层使用，见 [地址](../docs/assets-catalog/03-address.md) |

### 开发工具

- `public/dev/game-mock.*`：带模拟服务端的对局界面夹具，改为 `app/client` 的开发页，同时作为组件测试的夹具来源。
- `public/dev/recordings/*.json`：作为画面回放的帧流夹具（[可复现与可测试](ARCH.md#可复现与可测试)）。
- `public/dev/uikit.html`：改为 `primitive/` 的组件展示页。
- `public/dev/render-demo.*`：战场画面部分属于 renderer 的示例；休整拖放部分并入开发页。

## 按架构重做

- 框架：React 19 与 TSX，无障碍组件用 React Aria；模组经 SDK 的 `htm` 编写（[前端](ARCH.md#前端)）。
- 状态：`zustand` 仓库与选择器；30 Hz 的作战数据留在 React 之外。
- 意图：所有 `g.*`、`room.*` 与扩展消息经意图总线发出，界面不直接调用连接。
- 部件：每个界面组件按 id 注册，通过 `<Part id>` 渲染，带错误边界与安全模式（[表现层](ARCH.md#表现层)、[服务端下发界面](ARCH.md#服务端下发界面)）。
- 样式：设计令牌编译为 CSS 自定义属性，`@layer reset, tokens, base, components, mods, overrides`，普通 CSS 或 CSS Modules。
- 多语言：命名空间键与预编译 ICU（[多语言](ARCH.md#多语言)）。
- 资源：资源键（`AssetKey`）与 `resource/`，见 [资源从哪里来](../docs/alliance/data/03-resource.md)。
- 模组：`mod/` 实现客户端 `ModContext`、Service Worker 完整性校验、进入时确认与按服务端划分的存储。
- 握手：`hello` 发送 `ext`，按 `welcome` 的 `ext` 决定模组集合与兼容模式（[清单与握手](ARCH.md#清单与握手)）。

## 不迁移

- `public/js/ui/compat.js` 的旧浏览器补丁：浏览器基线由 browserslist 处理（[前端](ARCH.md#前端)）。
- `public/js/ui/assetUrls.js`：由 `assets-catalog` 的解析器取代（[解析](../docs/assets-catalog/04-resolver.md)）。
- `public/js/render/app/pixi.js` 与所有 Pixi 依赖。
- `public/js/render/tiles.js` 等二维棋盘。
- `public/js/render/boardArt.js`：棋盘图集由 `app/data` 的 `compile:derive` 派生为 `json:board/<theme>/tiles`（[编译](../docs/alliance/data/02-compiler.md#派生文件)）。
- master 的 `theme` / `fx` 材质表：master 只加载、不使用。
- 备用模型与别名染色（master `ALIAS_TINT`）：是否保留见 [remaining.md](REMAIN.md) 第 10 节。

## 0.2.x 功能清单

以下是 master 0.2.x 新增、迁移时要覆盖的界面能力：

- 干员调配、干员持有、自选编队（0.2.0），依赖服务端的 `room.ownership`、`room.diy` 与 `backups.json`（[remaining.md](REMAIN.md) 第 1 节）。
- 补位替身的标记与模型。
- 观众席位与观战界面，联防与首领双人场地指定观看对象（`g.watch.playerId`）。
- 多语言：英文、日文、韩文、繁中，语言包与后备语言，各语言字体。
- 自定义快捷键与设置页。
- 服务器播报按玩家语言显示。

## 依赖其他域

- 服务端补位、自选编队与 `g.watch.playerId`：[remaining.md](REMAIN.md) 第 1 节。
- 兼容层 `app/compat/upstream`：第 2 节。
- 后端判定、赛季与数据地址、能力标记：第 3 节。
- `welcome` 的 `seasonId`、`contentHash` 与 `ext`、对局事件契约：第 5 节与 [清单与握手](ARCH.md#清单与握手)。
- 事件命名统一：第 6 节。
- renderer 的单位、特效、Spine 画面，以及宿主接口（`calculateBoardTransform` 导出、指针事件流、快照到 renderer 输入的转换）：第 7 节；renderer 资源端口见 [资源端口](../docs/mission-renderer/05-port.md)。
- 资源的静态发布：[REMAIN.md](REMAIN.md) 第 9 节「资源发布」；资源的其余遗留：第 8 节。
- 静态站点与 vendor：第 9 节。

## 测试迁移

- 单文件的界面逻辑用例放在代码边上，用 `.test.ts`；多文件参与的放进 `app/client/test`，用 `.spec.ts`。来源是 `test/ui/*.test.js`。
- 拉起整页的用例进 `app/scenario`，用 `.e2e.ts`。来源是 `test/ui/*.e2e.test.js` 与 `test/e2e/`。
- `test/render/` 中依赖商店、手牌与拖放的用例（如 `drag.test.js`、`pen.test.js`、`playtest6-promote.test.js`）进 `app/client/test`；只喂快照与事件的用例属于 renderer。
- 音频：`test/ui/audio.test.js`、`test/ui/feedback3-audio-mix.test.js` 依赖 `AudioManager` 与 `unitGain`，随 `audio/` 重写。解码缓冲已有 `createAudioBuffer`，这些用例按新的混音接口改写。
- 资源生命周期：`test/render/assets.test.js` 中 `createAssets store` 的一组已改写为 `app/client/resource/store.test.ts`。
- 表情：`test/ui/emotes.test.js`、`test/ui/emotes.e2e.test.js`。
- 依赖全局 `PIXI` 的 `unloadSpineData`、`loadImageElement`、`loadSpineData`，以及 `test/assets.test.js` 中依赖 `@pixi/core`、`@pixi-spine/base` 的「每个 Spine 按客户端加载」用例，不迁移。
- `test/render/board3d-extract.test.js` 引用的 `public/js/render/board3d/load.js` 与 `tools/vendor.mjs` 已不在仓库中；棋盘场景在 `mission-renderer/stage/ground/terrain`，vendor 在 `deployment/client/vendor`。
- 测试方法按 [可复现与可测试](ARCH.md#可复现与可测试)：仓库与选择器用录制的帧流测试，组件用 Testing Library 按语义查询测试，播放用 `mission-core` 帧时钟与 renderer 本地喂数配合假时钟测试。

## 验收

- next 客户端能连接 next 服务端与 master 0.2.1 服务端，并完成标题、大厅、房间、简报、策略、配装、对局、结算的完整流程。
- 所有屏幕与面板可用键盘与屏幕阅读器操作。
- `app/client` 不引用 master 参考副本的路径、不依赖 Pixi、不解析资源地址；资源只经键与 `resource/` 申请。
- 界面文本全部经命名空间键；中文与英文完整。
- 每个界面组件都按 id 注册，替换与包装可用，出错时恢复默认组件。
- 迁移后的用例与 `tsc --noEmit` 通过。
