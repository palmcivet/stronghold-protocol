- [范围与原则](#范围与原则)
- [第一步：可见的基础界面](#第一步可见的基础界面)
- [第二步：扩展系统与模组示例](#第二步扩展系统与模组示例)
- [战场接线](#战场接线)
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

状态：已完成，验收通过。

交付：

- 依赖：React 19、React Aria、TanStack Router、zustand、valibot；valibot 只由 app 内的包各自声明，不进 pnpm catalog。`index.html` 只留挂载点，入口在 `shell/`。
- 样式：设计令牌（初始值取 master `public/css/theme.css`）编译为 CSS 变量，`@layer reset, tokens, base, components, mods, overrides`，CSS Modules。
- 多语言最小版：`core:`、`data:`、`server:` 命名空间与 `t()`，中文完整；master 服务端消息按 msgid 对照表翻译，查不到显示 `text`。
- 服务端推送的载荷类型（含 `m.ticker`、`m.layer`）定义在 `app/contract`；连接层只在收到帧时把它当作这些类型，不做运行期校验。
- 连接层：对 master 的 `/ws` 握手、重连、请求 id；`welcome` 不带 `ext` 时进入兼容模式，数据经兼容层；能力集按 master 0.2.4 处理，不支持的入口隐藏。两边的 `PROTOCOL_VERSION` 都是 1，不能用它区分能力集。
- 兼容模式的数据：规则数据来自 master 后端的 `/data`，赛季包不参与；战斗由 master 演算，客户端只播放它推送的战斗帧。
- 音频：赛季包清单的应用段 `app.cues`（线索表）按线索角色给出 `audio:` 键：`ui.<名>`、`bond.<名>`、`battle.<名>`（如 `ui.click`、`bond.levelUp`、`battle.deploy`），`bgm.<曲目>` 与 `bossBgm.<首领 id>` 各是前奏与循环一对，`combat` 是按回合区间的作战曲目列表，每项 `{ rounds: { from, to? }, intro?, loop? }`（没有 `to` 表示从 `from` 起的所有回合）。线索表不在 `refs` 中：`app` 段由 `app/data` 的 schema 定义与校验，资源目录库不解析它，`refs` 只放资源键。客户端按层序合并各层的线索表，后层按角色或曲目名覆盖，`combat` 整表替换；对局开始绑定快照时检查合并后线索表的键，开发构建用 `console.warn` 列出没有资源的键，生产构建不提示，缺键只是不播放，不阻塞对局。角色名单定在数据 schema 中，客户端只按角色取声音，不认文件名，模组可按角色覆盖。
  - 官方数据的线索表在赛季包源中手写（线索角色是本项目的表现概念，官方数据没有）；编译器按 `app/data` 的 schema 校验：角色名有效、键都是 `audio:` 键、每个键由本包或其依赖的包发布、`combat` 的回合从 1 起且不倒置不重叠，不满足时不写包。线索用到的基础包音效列在资源抽取的语音路径表中，由此进入基础包需求。
  - 曲目角色按屏幕与阶段选：对局外与简报类阶段为 `lobby`，备战 `prep`，作战 `combat`，联防 `unite`（缺省用 `combat`），首领阶段 `boss:<首领 id>`（缺省用 `boss`）。作战时客户端按当前回合在 `combat` 中选取曲目，没有覆盖该回合的项时用 `bgm.combat`。
  - 线索接到事件：按钮按下 `ui.click`、切换 `ui.tab`；意图被接受时按意图类型播放（购买、出售、刷新等，离开房间 `ui.matchCancel`），被拒绝时 `ui.error`，加入或创建房间被拒绝时 `ui.matchFail`；标题页进入 `ui.start`；连接从在线断开 `ui.disconnect`；房间里有其他玩家入座 `ui.joinRoom`；服务端宣布开局 `ui.matchSucceed`；进入阶段（回合开始、备战、作战、联防、首领、特殊征募）；选队时自己先手 `ui.goFirst`、轮到自己 `ui.yourTurn`；战斗结束按结算数据判定：状态带有结算数据中自己的 LP 扣减时按它（兼容层把 master `SETTLE` 视图的 `uniteResult.losses` 映射为中立的结算数据，只在联防后有），没有时在阶段离开 `SETTLE` 进入下一回合或结果的第一个状态按与开战时相比的 LP；扣减为正播放 `ui.battleOverReduce`、联防后未减少 `ui.battleOverNoReduce`、其余 `ui.battleOverNormal`，不依赖 LP 推送与阶段推送的先后；自己 LP 降到 5 及以下 `ui.danger`；首领血量归零 `ui.killBoss`；备战最后 5 秒每秒 `ui.timer`；新的播报 `ui.broadcast`；他人的表情 `ui.emote`；结算失败 `ui.settlementFail`，胜利时单人 `ui.settlementSucceed`、多人 `ui.settlementTeam`；对局中自己的盟约层数增长（`m.layer`）`bond.levelUp`；当前显示的战场上的部署、阵亡、敌人攻击、治疗与漏怪（按 `spawn` 事件得知单位阵营与种类）。
  - 待接线（客户端尚无对应事件）：`ui.killBossAll`、`ui.killBossNormal`、`ui.load`、`ui.yourTurnCircle`、`ui.target`、`ui.goodEvaluation`、`ui.settlementBossSign`、`ui.defenceStart`、`ui.battleStartBoss`、`ui.merge`、`ui.itemMerge`、`ui.income`、`battle.win`、`battle.lose`、`battle.killCoin`。
  - 单位各自的攻击、受击、技能音效与语音不是线索角色，留在单位引用中，随渲染层的单位表现处理。
  - 音量：总音量、音乐、音效三个通道，各有音量与静音，存在本地设置中，在 `/profile` 调整；音乐与音效的增益是各自音量乘以总音量。
  - 兼容模式由兼容规则把 master 清单的 `audio.sfx.ui`、`audio.sfx.battle`、`audio.bgm`、`audio.bossBgm` 按其键名填进 `app.cues`，名单外的名字不填；master 的两首交替作战曲按其排期映射为 `combat` 的两项，回合 1–7 与 8 起。文件仍是 master 无扩展名的 `/media/` 音频。
- 预加载组按屏幕划分：`room` 是房间界面图与可选干员的头像；`match` 是地图、本局干员（未被禁用的可见干员）与关卡敌人（赛季波次中的敌人与本局首领）的图；`results` 是结算界面图与自己干员的立绘。清单的 `preloadGroup` 只标出各组固定的界面图，其余键由客户端按目录算出；`match` 与 `results` 按本局的资源快照计算。进入下一组时释放上一组。
- 开局绑定：收到服务端宣布开局的消息时，把当时的清单与目录冻结为本局的资源快照，本局内不变；此时清单或目录还在加载的，加载完成时绑定。离开对局时释放快照，下一局重新绑定。对局内的界面读快照中的目录。
- 表情：轮盘只发官方表情 id；服务端只接受官方表情 id，没有其他白名单。
- 页面与路由：
  - `/` 入口页：服务器信息、昵称、加入或创建房间。
  - `/profile` 个人配置：昵称、头像、按键、语言、画质、音量，只存本地，不经服务端。
  - `/room/:id` 房间页：等待、赛季规则、准备。
  - `/room/:id/match` 对局页：只在服务端宣布开局后进入。
  - `/replay/:id` 留到第二步。
  - 两层状态：URL 路由表示用户在看哪一页（可分享、刷新不丢）；连接状态机（未连接、已连接、在房间、对局中）表示服务端认为玩家在哪。状态机是普通 reducer，不用 XState。
  - 路由加载器对齐状态机，不一致时重定向。例如在对局页刷新：先经房间重连，服务端确认对局仍在进行时才回到对局页。
  - 服务端仍把玩家留在房间或对局里时，导航栏的大厅入口换成“离开房间”：确认后发离开消息，服务端接受后状态机回到已连接（master 不再给离开者发房间消息），再进大厅；直接打开大厅地址的按状态机重定向回房间或对局页。
  - 每个页面注册为部件 id（如 `core:screen.lobby`）；第二步按 ARCH.md 开放路由表扩展。
- 错误边界按路由分层，以部件 id 为键：页面出错显示可恢复的错误面板（重试、返回大厅，返回大厅走状态机与离开流程）；对局页的战场单独包一层，渲染出错只替换战场。第二步部件注册表的安全模式复用这层隔离。
- 屏幕：房间页与对局页内的简报、策略、配装、对局、结算按阶段切换，先出基础版，部件先直接渲染，第二步再改成按 id 注册。
- 战场：`field/` 持有 `mission-renderer` 舞台，`playback/` 播放服务端的战斗帧，并留有按 `b.start` 用 `mission-core` 演算、回报 `b.progress` 与 `b.result` 的通路，未接桥接；不装骨骼后端，演员显示替身。master 服务端演算模式（`SP_COMBAT=server`）推送的快照与事件（`b.snap`、`b.ev`、`m.field`）由兼容层映射成中立视图，DOM 替身战场直接呈现单位位置、生命、倒下与伤害，只做呈现，不在客户端重算；新战斗开始（`m.field` 或 `b.start`）时清空，结算阶段保留最后一帧供查看。master 默认模式只发 `b.start`、不推快照，客户端不演算，只显示战斗状态与进度，没有战斗画面，第一步接受。
- Vite 开发代理：`/ws`、`/data`、`/assets`、`/media` 转发到 master 后端（master 没有 CORS 头，同源最省事）；后端地址取自环境变量。
- master 参考副本准备：安装依赖、执行其资源抓取脚本补齐 `public/assets/`、`npm start`（默认端口 3000）；步骤写进 `app/client` 的开发说明。

验收：本机起 master 与 Vite，浏览器里能建房、开局，服务端演算模式下能看到战斗过程，并打完一局到结算；`tsc --noEmit` 与已有用例通过。

后续（不在第一步）：新协议加入战斗结果事件，携带本场结算的 LP 扣减，供 `ui.battleOver*` 等表现直接使用；与 `BattleResult` 结算的归属一起设计。

后续（不在第一步）：兼容模式下由客户端把 master 的 `b.start` 映射进 `mission-core` 演算。依赖内容模块，由 ECS 一线规划；在此之前客户端不做数据视图，也不做只有普攻的战斗。

## 第二步：扩展系统与模组示例

交付：

- `mod/`：客户端 `ModContext`（形状与作用域按 ARCH.md），本地模组从 `examples/extensions/<id>/` 加载，存储按模组划分命名空间。模组清单的具体格式（ARCH.md 的字段落成文件与校验 schema）与本地加载一起设计。
- `part/`：所有界面部件按 id 注册，支持 `replace`、`wrap`、`insert`，每个部件带错误边界，出错恢复默认并标记模组。
- `text/`：按命名空间加载语言包，模组键 `<modId>:`，回退链按 ARCH.md。
- `theme/`：令牌包作为模组加载，覆盖进 `mods` 层。
- 模组新增的线索角色用命名空间键 `<modId>:<角色>`；第一步的角色名单是封闭的。模组加载时随模组清单正式校验其 `app` 段与线索键。
- 握手 `ext`：兼容模式稳定后再做；`ext` 中赛季包与资源地址的字段尚未设计，客户端暂不依赖。

模组示例，放在 `examples/extensions/`（是否提交由用户按模组决定），各验证一条架构主张：

| 示例 | 验证 |
|---|---|
| `skeleton-spine`（SPINE.md） | 第三方许可的运行时只作客户端本地模组；渲染后端按格式 id 注册，缺席时退回替身 |
| 替换一个界面部件（如商店卡片） | 部件 `replace`/`wrap` 与错误边界安全模式；替换后的组件做不到用户做不到的事 |
| 主题令牌包 | 主题就是令牌覆盖，宿主基础组件只用令牌 |
| 文案包 | 无代码的 `lang` 包能为某命名空间提供翻译，回退链生效 |

验收：四个示例都能在 master 后端的对局中加载与卸载；部件替换出错时自动恢复默认；不装任何模组时与第一步行为一致。

## 战场接线

- 目标：`app/client` 用真实数据驱动 `mission-renderer` 舞台，与 `field/` 的落地一起进行。
- 范围：`app/client`（`field/`、`audio/`、资源接入）、`app/data`、`assets-extractor`、拼装 `BattleSpec` 的适配层；引擎只在契约不够时改动。

交付：

- 舞台：`app/client` 接上 `createMissionStage`、`createMissionResourcePort`、`set-appearances` 与指针事件流；快照与事件到 renderer 输入的转换在 `field/`。
- 表现数据：
  - `app/data` 提供真实的 `MissionAppearance` 与动画角色表（`json:anim-roles/<seasonId>`）。
  - 法线、粗糙度、遮罩贴图在 `app/data` 或 `assets-extractor` 标 `colorSpace: "linear"`。
  - `modelScaleY`、`mirrorX`、敌人缩放与偏移（`enemy_scales.py`、`enemy_model_offsets.py` 的结果）编成 `json:prefab/*` 表现数据，不计入 `contentHash`。
- 数据规范化：
  - `app/data` 把未知的 `skillTriggerType` 映射为 `DEFAULT` 并警告。
  - `rangeRadius`、`attackAnim`/`attackMoves` 在 `app/data` 编译期规范化为 `attackRange`、`attackClip` 与 `attack-moves` 标签；拼装 `BattleSpec` 时只选用已规范化的数据。
- 地形与装置：拼装 `BattleSpec` 的适配层写上地块的 `terrain`，`special` 放进 `notes`；风机编成带风机标签的装置单位，作用格换成按朝向的攻击范围，技能黑板放进它的 `script`。
- 技能音库：技能期间的攻击、命中音按技能槽选音库（master 0.2.3 设计记录「主动技能的攻击与命中音」）。核心事件与音效线索已带 `skillSlot`，先到的技能音已由渲染器暂存；选音库的规则放在 `audio/`。

验收：

- 涉及的 app 子包内测试与 `tsc --noEmit` 通过。
- 用一场真实赛季数据的战斗跑通快照、事件到舞台的链路（演员、头顶条、特效、音效线索、地形），截图随报告提交。
- 截图用真实的 WebGL 渲染器，覆盖地面阴影：renderer 的单元测试只断言了无渲染器时不投影。
- 引擎包的测试与黄金摘要不变；契约有变时按有意变更处理。

## master 源码对照

路径相对 master 根目录，只列指导工作的部分。

| master | 去向 |
|---|---|
| `public/js/main.js`、`ui/device.js`、`ui/settings.js`、`ui/toasts.js`、`ui/connBanner.js` | `shell/`；特性检测不做 UA 嗅探 |
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
| `public/js/data.js` | next 后端按 `seasonId` 读赛季包；兼容模式读 master 的 `/data`；游戏文本由 `text/` 的 `data:` 键提供 |
| `shared/i18n*.js`、`ui/lang.js`、`public/i18n/*.json` | `text/`；`en.json` 按 msgid 映射到新键，`ja`、`ko`、`zh-TW` 重新生成 |
| `shared/standIn.js`、`diy.js`、`loadoutRecord.js`、`bandBonds.js` | `app/contract`，与服务端实现收拢 |
| `public/dev/game-mock.*`、`recordings/*.json`、`uikit.html` | 开发页、帧流夹具、`primitive/` 展示页 |

0.2.x 新增、要覆盖的界面：干员调配、干员持有、自选编队；补位替身标记；观众席位与观战（`g.watch.playerId`）；英日韩繁中与各语言字体；自定义快捷键与设置页；服务器播报按玩家语言显示。

## 不迁移

- Preact、`htm` 写的宿主代码与全局 store 结构。
- 所有 Pixi 依赖：`render/app/pixi.js`、二维棋盘 `render/tiles.js`。
- `ui/compat.js` 旧浏览器补丁（由 browserslist 处理）。
- `ui/assetUrls.js`、`render/boardArt.js`。
- `shared/media.js`：next 自有的资源布局不用 `/media/`；兼容模式读 master `/media/` 的部分在兼容层。
- master 的 `theme` / `fx` 材质表。

## 依赖其他域

- 服务端的补位、自选编队、`g.watch.playerId`、握手 `ext`，兼容层与资源发布：REMAIN.md。
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
