- [范围与原则](#范围与原则)
- [第一步：可见的基础界面](#第一步可见的基础界面)
- [第二步：扩展系统与模组示例](#第二步扩展系统与模组示例)
- [master 源码对照](#master-源码对照)
- [不迁移](#不迁移)
- [依赖其他域](#依赖其他域)
- [测试迁移](#测试迁移)
- [验收](#验收)

本文是 `app/client` 的落地计划，分两步：先做出能看见、能对 master 后端打完一局的基础界面，再落地扩展系统并用模组示例验证架构。设计依据是 ARCH.md。

## 范围与原则

- 行为参照是 master 参考副本（0.2.4）的浏览器客户端：`public/js/`、`public/css/`、`public/i18n/`、`public/index.html`、`public/dev/`，以及客户端用到的 `shared/`。只参照行为，按 ARCH.md 重写。
- 开发期一直对 master 后端联调；next 服务端就绪后再接 next 后端。
- 官方代码用 TSX；`htm` 只由 SDK 导出给模组，宿主代码不用。
- `app/client` 不依赖 Pixi；Spine 拆分后主包都不依赖（SPINE.md）。
- 客户端只使用 `app/contract` 的形状；master 格式只出现在 `app/compat/upstream`。
- 资源只经资源键与 `resource/` 申请，不解析地址。
- 所有 `g.*`、`room.*` 与扩展消息经意图总线发出，界面不直接调用连接。
- 目录与文件用名词、kebab-case（`preparation`、`panel`、`observation`）。
- `shell/` 露出全局 API（加入房间、提交意图、读取当前视图），供 `deployment` 的页面脚本、社区外壳与端到端测试调用。

目标目录：

```text
app/client/
  shell/          启动、路由、全局 API、设置页、连接横幅、提示
  connection/     WebSocket、重连、请求 id、握手、后端判定、扩展信道
  store/          会话、房间、对局视图、播放、设置、模组分片（zustand）
  intent/         意图总线：动作与按键、本地合法性预览、模组拦截
  part/           部件注册表、<Part id>、错误边界、布局数据
  theme/          设计令牌、层叠顺序、基础样式
  primitive/      宿主基础组件（React Aria），导出给模组
  text/           多语言目录、t()、语言包、master msgid 对照表
  mod/            客户端 ModContext、本地模组加载、存储命名空间
  screen/ preparation/ panel/ field/ playback/ observation/ audio/
  resource/       已有：资源叠加、缓存与兼容模式
  test/
```

## 第一步：可见的基础界面

交付：

- 依赖：React 19、React Aria、zustand、valibot；`index.html` 只留挂载点，入口在 `shell/`。
- 样式：设计令牌（初始值取 master `public/css/theme.css`）编译为 CSS 变量，`@layer reset, tokens, base, components, mods, overrides`，CSS Modules。
- 多语言最小版：`core:`、`data:`、`server:` 命名空间与 `t()`，中文完整；master 服务端消息按 msgid 对照表翻译，查不到显示 `text`。
- 连接层：对 master 的 `/ws` 握手、重连、请求 id；`welcome` 不带 `ext` 时进入兼容模式，数据与战斗经兼容层；能力集按 master 0.2.4 处理，不支持的入口隐藏。
- 屏幕：标题、大厅、房间、简报、策略、配装、对局、结算的基础版，部件先直接渲染，第二步再改成按 id 注册。
- 战场：`field/` 持有 `mission-renderer` 舞台，`playback/` 按 `b.start` 用 `mission-core` 演算并回报 `b.progress`、`b.result`；不装骨骼后端，演员显示替身。
- Vite 开发代理：`/ws`、`/data`、`/assets`、`/media` 转发到 master 后端（master 没有 CORS 头，同源最省事）；后端地址取自环境变量。
- master 参考副本准备：安装依赖、执行其资源抓取脚本补齐 `public/assets/`、`npm start`（默认端口 3000）；步骤写进 `app/client` 的开发说明。

验收：本机起 master 与 Vite，浏览器里能建房、开局、看到战斗播放并打完一局到结算；`tsc --noEmit` 与已有用例通过。

## 第二步：扩展系统与模组示例

交付：

- `mod/`：客户端 `ModContext`（形状与作用域按 ARCH.md），本地模组从 `examples/extensions/<id>/` 加载，存储按模组划分命名空间。模组清单的具体格式（ARCH.md 的字段落成文件与校验 schema）与本地加载一起设计。
- `part/`：所有界面部件按 id 注册，支持 `replace`、`wrap`、`insert`，每个部件带错误边界，出错恢复默认并标记模组。
- `text/`：按命名空间加载语言包，模组键 `<modId>:`，回退链按 ARCH.md。
- `theme/`：令牌包作为模组加载，覆盖进 `mods` 层。
- 握手 `ext`：兼容模式稳定后再做；`ext` 中赛季包与资源地址的字段尚未设计，客户端暂不依赖。

模组示例，放在 `examples/extensions/`（是否提交由用户按模组决定），各验证一条架构主张：

| 示例 | 验证 |
|---|---|
| `skeleton-spine`（SPINE.md） | 第三方许可的运行时只作客户端本地模组；渲染后端按格式 id 注册，缺席时退回替身 |
| 替换一个界面部件（如商店卡片） | 部件 `replace`/`wrap` 与错误边界安全模式；替换后的组件做不到用户做不到的事 |
| 主题令牌包 | 主题就是令牌覆盖，宿主基础组件只用令牌 |
| 文案包 | 无代码的 `lang` 包能为某命名空间提供翻译，回退链生效 |

验收：四个示例都能在 master 后端的对局中加载与卸载；部件替换出错时自动恢复默认；不装任何模组时与第一步行为一致。

## master 源码对照

路径相对 master 根目录，只列指导工作的部分。

| master | 去向 |
|---|---|
| `public/js/main.js`、`ui/device.js`、`ui/settings.js`、`ui/toasts.js`、`ui/connBanner.js` | `shell/`；路由由房间与对局阶段推导，特性检测不做 UA 嗅探 |
| `ui/components.js`、`ui/gameComponents.js`、`ui/richText.js`、`ui/clipboard.js`、`public/css/components.css`、`devices.css` | `primitive/`，React Aria 重做，只用令牌 |
| `public/css/theme.css`、`render/style.js` 的界面配色 | `theme/` |
| `public/js/net.js` | `connection/` |
| `public/js/store.js` | `store/`，按领域拆分 |
| `screens/*.js`、`screens/game.js`、`screens/game/overlays.js` | `screen/`；`game.js` 按阶段拆开，对局屏幕只装休整、常驻界面、战场与播放 |
| `ui/gameActions.js`、`ui/gameLogic*.js`、`ui/shopBar.js`、`ui/equipReplace.js`、`ui/choiceOverlay.js`、`ui/rewardOverlay.js`、`ui/buildGuard.js`、`ui/facing*.js`、`ui/underframe.js`、`screens/game/standInTags.js`、`render/drag.js`、`render/prepfield.js`、`render/pen.js`、`render/promote.js` | `preparation/`；动作改为意图，合法性判断作本地预览 |
| `ui/hud.js`、`combatHud.js`、`matchChrome.js`、`matchStatus.js`、`matchInfo.js`、`ticker.js`、`teamPanel.js`、`detailPanel.js`、`abilityLines.js`、`bondStrip.js`、`effectsList.js`、`enemyDrawer.js`、`emotes.js`、`guide.js` | `panel/`；只读视图，`gameLogic/shortcuts.js` 进 `intent/` |
| `ui/fieldHost.js`、`render/app.js`、`render/app/*.js`、`ui/gameLogic/camera.js`、`screens/game/marks.js` | `field/`；机位与高亮由 `field/` 算好传给舞台 |
| `ui/fallbackField.js` | `field/`，重做为可用键盘与屏幕阅读器操作的 DOM 战场 |
| `public/js/battle/runner.js`、`screens/game/early.js` | `playback/` |
| `public/js/battle/observe.js`、`ui/gameLogic/watch.js`、`ui/watchBonds.js` | `observation/` |
| `public/js/audio.js` | `audio/`，只接收资源句柄与音效线索 |
| `public/js/data.js` | 按 `seasonId` 读赛季包，游戏文本由 `text/` 的 `data:` 键提供 |
| `shared/i18n*.js`、`ui/lang.js`、`public/i18n/*.json` | `text/`；`en.json` 按 msgid 映射到新键，`ja`、`ko`、`zh-TW` 重新生成 |
| `shared/standIn.js`、`diy.js`、`loadoutRecord.js`、`bandBonds.js` | `app/contract`，与服务端实现收拢 |
| `public/dev/game-mock.*`、`recordings/*.json`、`uikit.html` | 开发页、帧流夹具、`primitive/` 展示页 |

0.2.x 新增、要覆盖的界面：干员调配、干员持有、自选编队；补位替身标记；观众席位与观战（`g.watch.playerId`）；英日韩繁中与各语言字体；自定义快捷键与设置页；服务器播报按玩家语言显示。

## 不迁移

- Preact、`htm` 写的宿主代码与全局 store 结构。
- 所有 Pixi 依赖：`render/app/pixi.js`、二维棋盘 `render/tiles.js`。
- `ui/compat.js` 旧浏览器补丁（由 browserslist 处理）。
- `ui/assetUrls.js`、`render/boardArt.js`、`shared/media.js`。
- master 的 `theme` / `fx` 材质表。

## 依赖其他域

- 服务端的补位、自选编队、`g.watch.playerId`、握手 `ext`，兼容层与资源发布：REMAIN.md。
- renderer 的替身、头顶条、特效与舞台接线：REMAIN-ECS.md。
- Spine 后端拆分：SPINE.md。

## 测试迁移

- 单文件界面逻辑用 `.test.ts` 放在代码边上，多文件的进 `app/client/test` 用 `.spec.ts`，来源 `test/ui/*.test.js`。
- 整页用例进 `app/scenario`，用 `.e2e.ts`，来源 `test/ui/*.e2e.test.js` 与 `test/e2e/`。
- `test/render/` 中依赖商店、手牌与拖放的用例（`drag`、`pen`、`playtest6-promote`）进 `app/client/test`；只喂快照与事件的属于 renderer。
- 音频用例随 `audio/` 的新混音接口改写；表情用例 `test/ui/emotes*.js` 随 `panel/`。
- 依赖全局 `PIXI` 或 `@pixi-spine/*` 的加载用例不迁移。
- 组件用 Testing Library 按语义查询；状态仓库用录制的帧流测试。

## 验收

- 能连接 master 0.2.4 服务端完成标题到结算的完整流程；next 服务端就绪后同样通过。
- 所有屏幕与面板可用键盘与屏幕阅读器操作。
- 不引用 master 参考副本路径、不依赖 Pixi、不解析资源地址。
- 界面文本全部经命名空间键，中文与英文完整。
- 每个界面组件按 id 注册，替换、包装、插入可用，出错恢复默认。
- 用例与 `tsc --noEmit` 通过。
