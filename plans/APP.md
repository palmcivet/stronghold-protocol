- [范围与原则](#范围与原则)
- [基础界面规格](#基础界面规格)
- [界面待办](#界面待办)
- [第二步：扩展系统与模组示例](#第二步扩展系统与模组示例)
- [战场接线](#战场接线)
- [master 源码对照](#master-源码对照)
- [不迁移](#不迁移)
- [依赖其他域](#依赖其他域)
- [测试迁移](#测试迁移)
- [验收](#验收)

本文是 `alliance/client` 的规格与落地计划。基础界面已能对 master 后端打完一局，其规格留在“基础界面规格”；剩下的是第二步：落地扩展系统并用模组示例验证架构。设计依据是 ARCH.md。
客户端的技术规格、部件与插槽以文档为准。调试 API 与调试模组见 DEBUG.md。

## 范围与原则

- 行为参照是 master 参考副本（0.2.4）的浏览器客户端：`public/js/`、`public/css/`、`public/i18n/`、`public/index.html`、`public/dev/`，以及客户端用到的 `shared/`。只参照行为，按 ARCH.md 重写。
- 开发期一直对 master 后端联调；next 服务端就绪后再接 next 后端。
- 官方代码用 TSX；`htm` 只由 SDK 导出给模组，宿主代码不用。
- `alliance/client` 不依赖 Pixi；Spine 拆分后主包都不依赖（SPINE.md）。
- 客户端只使用 `alliance/contract` 的形状；master 格式只出现在 `alliance/compat/upstream`。
- 资源只经资源键与 `infra/resource/` 申请，不解析地址。
- 所有 `g.*`、`room.*` 与扩展消息经意图总线发出，界面不直接调用连接。
- 目录与文件用名词、kebab-case（`preparation`、`panel`、`observation`）。
- `infra/boot/` 露出全局 API `window.wsde`（加入房间、提交意图、读取当前视图），供 `deployment` 的页面脚本、社区外壳与端到端测试调用；DEV 下同一对象混入 `infra/debug` 叠层方法。

客户端的技术规格（目录与分层、连接、路由、外壳、部件、存储、样式、文案、音频等）以文档为准，本文只留计划与文档未收的内容。

目录（按领域嵌套）：

```text
alliance/client/
  infra/       connection/ router/ store/ storage/ settings/ platform/ intent/ resource/ audio/ text/ theme/ boot/
  ui/          宿主基础组件（React Aria）与游戏专用小件，导出给模组
  part/        部件注册表、<Part id>、错误边界、布局树
  shell/       外壳：菜单入口部件、连接横幅、提示、浮层、对话框层
  entry/ profile/ loadout/ guide/ room/
  match/       briefing/ strategy/ hud/ settlement/ field/ playback/ observation/
  extension/   尚未创建，第二步新建：客户端 ModContext、本地模组加载、存储命名空间
  test/
```

- 页面定义：没有集中的屏幕目录，领域目录下也没有 `screen.tsx`。路由在 `infra/router/router.tsx`，页面经 `infra/boot/parts.ts` 注册为部件（如 `core:screen.room`）。模组新增页面的开放路由表是第二步。

## 基础界面规格

- 依赖：React 19、React Aria、TanStack Router、zustand、valibot；valibot 只由 app 内的包各自声明，不进 pnpm catalog。`index.html` 只留挂载点，入口在 `infra/boot/`。
- 音频（线索角色、接线、音量与兼容映射见文档；以下是文档未收的部分）：
  - 官方数据的线索表在赛季包源中手写（线索角色是本项目的表现概念，官方数据没有）；编译器按 `alliance/data` 的 schema 校验：角色名有效、键都是 `audio:` 键、每个键由本包或其依赖的包发布、`combat` 的回合从 1 起且不倒置不重叠，不满足时不写包。线索用到的基础包音效列在资源抽取的语音路径表中，由此进入基础包需求。
  - 待接线（客户端尚无对应事件）：`ui.killBossAll`、`ui.killBossNormal`、`ui.load`、`ui.yourTurnCircle`、`ui.target`、`ui.goodEvaluation`、`ui.settlementBossSign`、`ui.defenceStart`、`ui.battleStartBoss`、`ui.merge`、`ui.itemMerge`、`ui.income`、`battle.win`、`battle.lose`、`battle.killCoin`。
- 预加载组按屏幕划分：`room` 是房间界面图与可选干员的头像；`match` 是地图、本局干员（未被禁用的可见干员）与关卡敌人（赛季波次中的敌人与本局首领）的图；`results` 是结算界面图与自己干员的立绘。清单的 `preloadGroup` 只标出各组固定的界面图，其余键由客户端按目录算出；`match` 与 `results` 按本局的资源快照计算。进入下一组时释放上一组。
- 开局绑定：收到服务端宣布开局的消息时，把当时的清单与目录冻结为本局的资源快照，本局内不变；此时清单或目录还在加载的，加载完成时绑定。离开对局时释放快照，下一局重新绑定。对局内的界面读快照中的目录。
- 表情：轮盘只发官方表情 id；服务端只接受官方表情 id，没有其他白名单。
- 第二步部件注册表的安全模式复用错误边界的隔离。
- 战场（舞台接线、地面半场、特效、键盘网格、备战手势见文档）。调试推流画面可用 `SP_COMBAT=server` 重启 master，或打多人局。
- master 参考副本准备：安装依赖、执行其资源抓取脚本补齐 `public/assets/`、`npm start`（默认端口 3000）；步骤写进 `alliance/client` 的开发说明。

后续：新协议加入战斗结果事件，携带本场结算的 LP 扣减，供 `ui.battleOver*` 等表现直接使用；与 `BattleResult` 结算的归属一起设计。

后续：自定义 skill kit（hooks / 未知 trigger）仍由 ECS / 内容一线补；`battleSpecOf` 与本地战斗桥已接线，见文档。

## 界面待办

从界面规划收进、尚未落地的项（已写入文档的交付不再列）：

- 玩法说明：内容保持占位观感，待用户审阅后再定。
- 连接横幅的「服务器已更新」提示（master `ui/buildGuard.js`）未实现。
- 干员调配：列表的职业、盟约筛选；详情的属性预览、语音试听、导入导出未做。
- 个人配置：官方段为 `core:identity` / `core:display` / `core:audio` / `core:keys`（`infra/settings`）；原单体 `wsde:device:core:settings` v2 启动时拆进四段（含 `safeAreaUi`）。master 的语音语言、伤害数字、特效数量等不再扩充。模组自有设置段随扩展系统用 `defineSettingSection` 挂上。平台能力在 `infra/platform`（`probe` / `getPlatform`），与 welcome `Capabilities` 分开。
- 视觉布局：用户逐页重新设计；结算主布局已按 master 移植骨架，细节皮与资源图标仍待审阅。仍不如 master 的全视觉皮、844×390 商店高度与密度、联防 ×N / pending 红塔动效、官方立绘/评语图标等，随布局审阅一并定。
- 视觉布局：844×390（手机横屏）下对局 HUD 的商店栏占去大半高度，战场偏小；等用户审阅布局后再定。
- 对局层叠：match HUD 已改为绝对叠在全屏 `mission-renderer` 舞台上（对齐 master `.gm__field` / `.gm__hud`）；机位内边距按真实 HUD 占位量。目录风味标签（如 `infection`）已注册；`battleSpecOf` 按 master 数组路线 + `routeIndex` / `start:[row,col]` 映射刷怪，本机演算快照进舞台、appearances 绑定，作战单位可见。装饰性边缘模型完整度与全视觉皮仍待审阅。
- 对照 master：同一流程状态下用无头浏览器分别截图 master 与 next，并排交给用户人工审阅（不做像素比对），记录缺失的信息与操作。
- 插槽验证：用聊天示例模组 `insert into` `core:room.side` 与 `core:match.hud.side`，确认不装模组时布局不变。
- 持久 skill 光环（跟单位到 skill-end，弹药技不加光环）需渲染器 follow-unit 效果种类，未做。
- 手柄导航待设计后再做（键盘网格见战场文档）。
- 自定义 skill kit（hooks / 未知 trigger）内容模块仍待 ECS/内容一线。

## 第二步：扩展系统与模组示例

交付：

- `extension/`：客户端 `ModContext`（形状与作用域按 ARCH.md），本地模组从 `examples/extensions/<id>/` 加载，把 `#infra/storage` 已有的模组存储接进模组上下文。模组清单的具体格式（ARCH.md 的字段落成文件与校验 schema）与本地加载一起设计。
- `part/`：部件注册表已有，第二步接到模组上：模组的 `replace`、`wrap`、`insert` 经 `ModContext` 注册，部件出错时恢复默认并标记模组。
- `infra/text/`：按命名空间加载语言包，模组键 `<modId>:`（模组 id 格式见 ARCH.md“模组 id 与本地存储”），回退链按 ARCH.md。
- `infra/theme/`：令牌包作为模组加载，覆盖进 `mods` 层。
- 模组新增的线索角色用命名空间键 `<modId>:<角色>`；宿主的角色名单是封闭的。模组加载时随模组清单正式校验其 `app` 段与线索键。
- `/replay/:id` 回放页。
- 开放路由表扩展（ARCH.md），模组用同样的页面定义新增页面。
- 握手 `ext`：兼容模式稳定后再做；`ext` 中赛季包与资源地址的字段尚未设计，客户端暂不依赖。

模组示例，放在 `examples/extensions/`（是否提交由用户按模组决定），各验证一条架构主张：

| 示例 | 验证 |
|---|---|
| `examples/skeleton-spine`（SPINE.md） | 第三方许可的运行时只作客户端本地模组；渲染后端按格式 id 注册，缺席时退回替身 |
| 替换一个界面部件（如商店卡片） | 部件 `replace`/`wrap` 与错误边界安全模式；替换后的组件做不到用户做不到的事 |
| `examples/double-tap-buy` | 官方“点两次购买 / 升级”：`wrap` 商店卡与升级卡，宿主默认单击即买 |
| `examples/stats` | 本机统计（master `screens/stats.js`、`ui/stats.js`）作为模组：注册页面 `examples/stats:screen.main`，在页面路由上带 `menu` 元数据进菜单入口，`insert into` `core:result.extra`，存储用模组命名空间（`wsde:device:examples/stats:<key>`） |
| 主题令牌包 | 主题就是令牌覆盖，宿主基础组件只用令牌 |
| 文案包 | 无代码的 `lang` 包能为某命名空间提供翻译，回退链生效 |

验收：所有示例都能在 master 后端的对局中加载与卸载；部件替换出错时自动恢复默认；不装任何模组时与现有基础界面行为一致。

## 战场接线

已落地部分（舞台接线、数据规范化、`BattleSpec` 地形与风机、`skillBankOf` 选取辅助、地面半场与备战手势）见 `docs/alliance/maintain/client/14-field.md`、`docs/alliance/maintain/client/13-audio.md`、`docs/alliance/maintain/data/02-compiler.md`、`docs/alliance/maintain/compat/04-battle.md`。下列仍推迟：

- 真实 `MissionAppearance`、`json:anim-roles/<seasonId>`、法线/粗糙度等 `colorSpace: "linear"` 贴图、以及 `modelScaleY` / `mirrorX` / 敌人缩放偏移编成的 `json:prefab/*`（不计入 `contentHash`）。当前用占位管线与 catalog 缩放。
- WebGL + 地面阴影的截图验收（renderer 单测只覆盖无渲染器时不投影）；用真实赛季数据跑通演员/头顶条/特效/音效/地形后随报告提交截图。
- 单位逐条 attack / hit 的完整播放链：舞台已能发出带 `skillSlot` 的 `MissionAudioCue`，`skillBankOf` 也能按槽选库，但宿主尚未把 cue 接到单位音库播放（目录侧音库数据也未进客户端 catalog）。本轮未接线。
- 完整 extract → 赛季包，以及 `model:mesh` / `json:board` / 风门水体 AB（上游包缺部分 bundle 时保持空）。
- 引擎包测试与黄金摘要保持不变；契约有变时按有意变更处理。

## master 源码对照

路径相对 master 根目录，只列指导工作的部分。

| master | 去向 |
|---|---|
| `public/js/main.js`、`ui/device.js`、`ui/settings.js`、`ui/toasts.js`、`ui/connBanner.js` | `shell/`、`infra/boot/`；特性检测不做 UA 嗅探 |
| `ui/components.js`、`ui/gameComponents.js`、`ui/richText.js`、`ui/clipboard.js`、`public/css/components.css`、`devices.css` | `ui/`，React Aria 重做，只用令牌 |
| `public/css/theme.css`、`render/style.js` 的界面配色 | `infra/theme/` |
| `public/js/net.js` | `infra/connection/` |
| `public/js/store.js` | `infra/store/` 与各领域 |
| `screens/*.js`、`screens/game.js`、`screens/game/overlays.js` | 各领域目录，路由在 `infra/router/router.tsx`、页面经 `infra/boot/parts.ts` 注册；`game.js` 按阶段拆进 `match/` 子目录；`screens/stats.js` 进示例模组 `examples/stats` |
| `ui/gameActions.js`、`ui/gameLogic*.js`、`ui/shopBar.js`、`ui/equipReplace.js`、`ui/choiceOverlay.js`、`ui/rewardOverlay.js`、`ui/buildGuard.js`、`ui/facing*.js`、`ui/underframe.js`、`screens/game/standInTags.js`、`render/drag.js`、`render/prepfield.js`、`render/pen.js`、`render/promote.js` | `match/hud/`（商店、选择、奖励、装备替换）与 `match/field/`（拖放、朝向、选中菜单、替补标签）；动作改为意图，合法性判断作本地预览 |
| `ui/hud.js`、`combatHud.js`、`matchChrome.js`、`matchStatus.js`、`matchInfo.js`、`ticker.js`、`teamPanel.js`、`detailPanel.js`、`abilityLines.js`、`bondStrip.js`、`effectsList.js`、`enemyDrawer.js`、`emotes.js` | `match/hud/`；只读视图，`gameLogic/shortcuts.js` 进 `infra/intent/`；`guide.js` 进 `guide/` |
| `ui/fieldHost.js`、`render/app.js`、`render/app/*.js`、`ui/gameLogic/camera.js`、`screens/game/marks.js` | `match/field/`；机位与高亮由它算好传给舞台 |
| `ui/fallbackField.js` | `match/field/`，重做为可用键盘与屏幕阅读器操作的 DOM 战场 |
| `public/js/battle/runner.js`、`screens/game/early.js` | `match/playback/` |
| `public/js/battle/observe.js`、`ui/gameLogic/watch.js`、`ui/watchBonds.js` | `match/observation/` |
| `public/js/audio.js` | `infra/audio/`，只接收资源句柄与音效线索 |
| `public/js/data.js` | next 后端按 `seasonId` 读赛季包；兼容模式读 master 的 `/data`；游戏文本由 `infra/text/` 的 `data:` 键提供 |
| `shared/i18n*.js`、`ui/lang.js`、`public/i18n/*.json` | `infra/text/`；`en.json` 按 msgid 映射到新键，`ja`、`ko`、`zh-TW` 重新生成 |
| `shared/standIn.js`、`diy.js`、`loadoutRecord.js`、`bandBonds.js` | `alliance/contract`，与服务端实现收拢 |
| `public/dev/game-mock.*`、`recordings/*.json`、`uikit.html` | 开发页、帧流夹具、`ui/` 展示页 |

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

- 单文件界面逻辑用 `.test.ts` 放在代码边上，多文件的进 `alliance/client/test` 用 `.spec.ts`，来源 `test/ui/*.test.js`。
- 整页用例（来源 `test/ui/*.e2e.test.js` 与 `test/e2e/`）的目录尚未单列。
- `test/render/` 中依赖商店、手牌与拖放的用例（`drag`、`pen`、`playtest6-promote`）进 `alliance/client/test`；只喂快照与事件的属于 renderer。
- 音频用例随 `infra/audio/` 的新混音接口改写；表情用例 `test/ui/emotes*.js` 随 `match/hud/`。
- 依赖全局 `PIXI` 或 `@pixi-spine/*` 的加载用例不迁移。
- 组件用 Testing Library 按语义查询；状态仓库用录制的帧流测试。

## 验收

- 能连接 master 0.2.4 服务端完成标题到结算的完整流程；next 服务端就绪后同样通过。
- 所有屏幕与面板可用键盘与屏幕阅读器操作。
- 不引用 master 参考副本路径、不依赖 Pixi、不解析资源地址。
- 界面文本全部经命名空间键；语言只有 `zh-Hans` 与 `en`，已完成页面的英文键组由覆盖测试检查齐全。
- 每个界面组件按 id 注册，替换、包装、插入可用，出错恢复默认。
- 用例与 `tsc --noEmit` 通过。
