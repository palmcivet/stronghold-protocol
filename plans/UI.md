# 界面框架与组件

本文提出 `alliance/client` 的页面框架、部件清单与插槽，供实施前讨论；定稿后按“实施顺序”落地。只管界面：战场渲染不在范围内，这里只把战场当作一个部件边界（`core:match.field`）。整备区、选中棋子菜单（撤退 / 出售 / 销毁）、朝向轮盘、棋子标签属于战场一侧，不是界面部件。路由表、页面定义与目录结构见 APP.md。部件注册表、`replace`/`wrap`/`insert`、令牌与多语言命名空间的机制见 ARCH.md；路由、连接状态机与第一步已有的页面见 APP.md。

原则：不追求像 master；master 有的信息与操作都要有落点；模组能替换任一部件，也能在插槽里加新部件（例：master 没有聊天窗，模组把 `chat:panel` 加进房间与对局 HUD 的侧区）。

## 页面框架

外壳（所有页面共用）分五层，自下而上：

| 层 | 内容 | 部件 / 插槽 |
|---|---|---|
| 背景 | 赛季背景图、对局页为战场 | `core:shell.backdrop` |
| 主区 | 当前路由的页面 | `core:screen.*` |
| 外壳条 | 导航（大厅 / 个人配置 / 离开房间）、连接横幅 | `core:shell.nav`、`core:shell.banner` |
| 浮层 | 对话框与对局内设置 | `core:shell.overlay` |
| 提示 | 提示条、工具提示 | `core:shell.toast`、`core:shell.tooltip` |

对局页隐藏外壳导航，离开由退出键负责；横幅移到顶栏下；浮层与提示层在所有页面都在。

页面内的区域（每页一个布局部件，区域即插槽）：

- 入口：标题区、表单区（昵称、模式、难度、加入码）、角落区（语言、设置、玩法说明、服务器信息）。
- 个人配置：分页（昵称与头像、语言、按键、画质与文字大小、音量、问题反馈）。对局内的设置浮层渲染同一组 `core:profile.*` 部件。
- 干员调配、玩法说明：独立页面，不改变连接状态，从任何页面进入并返回来处。
- 房间：头部（房间码、邀请、模式难度）、主区（席位）、侧区（房主控制、观众）、底栏（准备 / 开始 / 离开 / 干员调配）。
- 对局按阶段换布局：
  - 简报 `INFO_CHECK` 与选策略 `BAND_DRAFT`：步骤头（离开、延迟、难度 | 步骤标题 | 倒计时）+ 三栏。
  - 对局（`PREP`、`COMBAT`、`UNITE`、`BOSS`、`SETTLE`、`CONTINGENCY`）：战场铺满，HUD 分 上 / 左 / 右 / 下 / 中央浮层 五区。详情卡放在哪一区由布局部件决定，详情部件不关心位置。
  - 结算 `RESULT`：标题区 + 玩家卡列 + 操作。

窄屏（手机横屏）由各页的布局部件按断点切换区域排布（如队伍栏收为头像列、效果列进抽屉），部件本身不分端。

## 组件清单

“可替换”指用 `defineExtensible` 开放 `replace`/`wrap`；“否”的部件仍可 `insert` 前后。master 列为参照的文件或元素（路径相对 master 的 `public/js/`）。

### 外壳

| 部件 id | 职责 | 数据 | 交互 | master | 可替换 |
|---|---|---|---|---|---|
| `core:shell.nav` | 导航，在房间或对局时换成离开 | 状态机 | 跳转、离开确认 | — | 是 |
| `core:shell.banner` | 连接状态：重连、断开、被拒、同步中、服务器已更新 | 连接状态、构建戳 | 重试 | `ui/connBanner.js`、`ui/buildGuard.js` | 是 |
| `core:shell.toast` | 提示栈，相同合并计数 | 提示队列 | 自动消失 | `ui/toasts.js` | 是 |
| `core:shell.confirm` | 通用确认 / 告知对话框 | 文案 | 确认、取消 | `components.js` confirmDialog | 否 |
| `core:shell.settings` | 对局内设置浮层（容器，内容是 `core:profile.*`） | 本地设置 | 打开、关闭 | `ui/settings.js` | 是 |
| `core:shell.error` | 页面与部件的错误面板 | 错误 | 重试、回大厅 | — | 否 |

### 干员调配、玩法说明

两者是页面，以下部件都可替换。

| 部件 id | 职责 | 数据 | 交互 | master |
|---|---|---|---|---|
| `core:screen.loadout` | 页面布局：调配 / 持有 / 自选三页 | — | 分页 | `screens/loadout.js` |
| `core:loadout.roster` | 干员列表与筛选（阶、职业、盟约、搜索、仅看已调整） | 干员、配置 | 筛选、选择 | `screens/loadout.js` |
| `core:loadout.detail` | 技能、模组、潜能与练度、属性预览、语音试听 | 选中干员 | 选技能 / 模组 / 潜能 | `screens/loadout.js`、`screens/cultivation.js` |
| `core:loadout.ownership` | 持有与替补（按阶分组，全部持有） | 普通干员、替补 | 切换持有 | `screens/ownership.js` |
| `core:loadout.diy` | 自选编队四格与候选 | 自选池 | 选格、挑干员 | `screens/diy.js` |
| `core:screen.guide` | 玩法说明翻页器（章节、页点、缩略图） | 教程图、tips | 翻页、键盘 | `ui/guide.js` |

### 入口与个人配置

| 部件 id | 职责 | 数据 | 交互 | master | 可替换 |
|---|---|---|---|---|---|
| `core:entry.hero` | 标题、背景 | 赛季 | — | `screens/title.js` | 是 |
| `core:entry.name` | 昵称输入与校验 | 本地昵称 | 输入、进入 | `screens/title.js` | 否 |
| `core:entry.create` | 模式（独立 / 同盟）与难度卡（描述、效果、回合数） | 模式数据 | 选择、创建 | `screens/lobby.js` mode-card / diff-card | 是 |
| `core:entry.join` | 同盟密钥、最近记录、加入或观战 | 本地记录 | 输入、加入、观战 | `screens/lobby.js` | 否 |
| `core:entry.server` | 服务器、延迟、版本 | 连接 | — | lobby 连接状态 | 否 |
| `core:profile.*` | 每个设置分页一个部件（`identity`、`language`、`keys`、`display`、`audio`、`feedback`），个人配置页与对局内设置浮层共用 | 本地设置 | 编辑 | `ui/settings.js` | 是 |

### 房间

| 部件 id | 职责 | 数据 | 交互 | master | 可替换 |
|---|---|---|---|---|---|
| `core:room.header` | 房间码、复制码 / 链接、模式难度 | 房间 | 复制 | `screens/room.js` invite | 是 |
| `core:room.roster` | 席位列表 | 房间席位 | — | seat | 是 |
| `core:room.seat` | 单个席位：头像框、名字、准备、AI、房主、离线 | 一个席位 | 房主移除 AI | seat | 是 |
| `core:room.host` | 房主控制：难度、加减 AI、“AI 最后选择” | 房间、是否房主 | 设置 | room-bar | 是 |
| `core:room.spectators` | 观众席 | 观众 | — | — | 否 |
| `core:room.actions` | 准备 / 开始（满足条件才可用）/ 离开 / 干员调配入口 | 房间 | 按钮 | readybtn | 是 |

### 简报与选策略

| 部件 id | 职责 | 数据 | 交互 | master | 可替换 |
|---|---|---|---|---|---|
| `core:match.stephead` | 步骤头：离开、延迟、难度、步骤、倒计时 | 阶段、截止 | 离开流程 | `ui/matchChrome.js` | 是 |
| `core:briefing.boss` | 敌方领袖剪影、名字、能力 | 本局首领 | 查看 | `screens/briefing.js` | 是 |
| `core:briefing.stage` | 关卡与关卡池 | 关卡 | — | 同上 | 是 |
| `core:briefing.factions` | 特训敌人阵营 | 阵营 | — | 同上 | 是 |
| `core:match.info` | 本局信息：核心 / 附加盟约、禁用盟约与干员、自选下架（简报右栏、选策略对话框、对局信息页共用） | 公共视图、数据 | 点盟约看详情 | `ui/matchInfo.js` | 是 |
| `core:briefing.ready` | 就绪人数、准备按钮 | 就绪 | 准备 | 同上 | 否 |
| `core:strategy.order` | 选择顺序与各人状态 | 轮选 | — | `screens/bandDraft.js` | 是 |
| `core:strategy.grid` | 可选策略网格（队友已选标记） | 策略 | 选中 | 同上 | 是 |
| `core:strategy.detail` | 策略详情、跳过、确认 | 选中策略 | 跳过、确认 | 同上 | 是 |

### 对局 HUD

| 部件 id | 职责 | 数据 | 交互 | master | 可替换 |
|---|---|---|---|---|---|
| `core:match.topbar` | 顶栏容器 | — | — | `ui/hud.js` | 是 |
| `core:match.exit` | 离开与延迟；暂离（AI 托管）/ 放弃 | 连接 | 确认流程 | `ui/matchChrome.js` | 否 |
| `core:match.round` | 回合、阶段胶囊（备战 / 击杀 n/m / 首领血条） | 公共视图 | — | roundbox、capsule、bossbar | 是 |
| `core:match.lp` | LP 塔（联防为合并 LP） | 公共视图 | — | LP tower | 是 |
| `core:match.clock` | 七段倒计时、超时警告、准备就绪、单人暂停 | 截止、超时 | 准备、暂停 | SevenSeg、otwarn、pausebtn | 是 |
| `core:match.lens` | 两个查看键：本局信息、敌人预览机位 | 阶段 | 开对话框、移机位 | hud 🔍 | 否 |
| `core:match.intel` | 本局信息对话框：本局信息 / 敌方情报两页 | 公共、私有视图 | 分页、点敌人 | `ui/enemyDrawer.js` | 是 |
| `core:match.ticker` | 播报条（优先级队列） | `m.ticker` | — | `ui/ticker.js` | 是 |
| `core:match.bonds` | 盟约条（随观看对象切换） | 盟约 | 点开详情 | `ui/bondStrip.js` | 是 |
| `core:match.bond-detail` | 盟约详情弹层：人数、层数、档位、成员 | 一个盟约 | 点成员看卡 | 同上 | 是 |
| `core:match.team` | 队伍栏 | 玩家列表 | — | `ui/teamPanel.js` | 是 |
| `core:match.team-row` | 一行：头像 / 策略图标、名字、LP、状态、AI、观看中、表情气泡 | 一个玩家 | 前往查看 / 返回战场 | 同上 | 是 |
| `core:match.effects` | 生效效果列（计数、提示） | 私有效果 | 悬停 | `ui/effectsList.js` | 是 |
| `core:match.detail` | 详情卡：干员 / 装备 / 敌人（属性、特质、技能、天赋、盟约、范围） | 选中对象 | 点盟约、关闭 | `ui/detailPanel.js` | 是 |
| `core:match.shop` | 商店栏容器：升级卡、干员卡、道具卡、资金卡、收起 | 商店 | 单击购买 / 升级 | `ui/shopBar.js` | 是 |
| `core:match.shop-card` | 单张商店卡（阶、价格、立绘、盟约、冻结、合成进度） | 一张卡 | 单击购买，悬停或长按看详情 | 同上 | 是 |
| `core:match.shop-tools` | 剩余可放置、冻结 / 解冻、刷新（单飞） | 商店 | 按钮、快捷键 | 同上 | 否 |
| `core:match.reward` | 待选奖励提示（稍后选择后召回） | 奖励队列 | 召回 | `ui/rewardOverlay.js` | 是 |
| `core:match.choice` | 机变选择浮层：轮次、倒计时、卡片网格 | 选择 | 选卡 | `ui/choiceOverlay.js` | 是 |
| `core:match.equip-replace` | 装备替换对话框 | 干员与装备 | 选替换、确认 | `ui/equipReplace.js` | 是 |
| `core:match.combat` | 作战 HUD：DP、等待队友进度、观看胶囊、联防半场切换 | 播放、观看 | 切机位、返回 | `ui/combatHud.js` | 是 |
| `core:match.emote` | 表情轮盘（36 个官方表情） | 表情表 | 打开、发送 | `ui/emotes.js` | 是 |
| `core:match.vote` | 开局重抽投票 | 公共视图 | 投票 | `ui/setupReroll.js` | 是 |
| `core:match.pause` | 单人暂停罩、对局中止罩 | 公共视图 | 继续、返回 | `screens/game/overlays.js` | 是 |
| `core:match.away` | AI 托管罩 | 本地标志 | 返回模拟 | awayov | 是 |
| `core:match.field` | 战场边界（渲染不在本文） | 视图、高亮 | 指针事件 | `ui/fieldHost.js` | 是（ARCH.md） |

### 结算

| 部件 id | 职责 | 数据 | 交互 | master | 可替换 |
|---|---|---|---|---|---|
| `core:result.hero` | 胜负、通过回合、首领徽章、用时 | 结果 | — | `screens/result.js` | 是 |
| `core:result.player` | 玩家卡：策略、阵容（精英标记）、数据、评语 | 一名玩家 | 点干员看卡 | rcard | 是 |
| `core:result.actions` | 返回同盟 | — | 按钮 | 同上 | 否 |

合计：页面 6（入口、个人配置、干员调配、玩法说明、房间、对局；对局含 3 种阶段布局），浮层 1（对局内设置），部件约 70 个。

商店默认单击即买；官方的“点两次购买 / 升级”与本机统计都由示例模组提供（见 APP.md 的模组示例）。

## 插槽

按 ARCH.md 表现层的机制：插槽就是布局树中的容器部件，模组用 `insert into` 把部件加进容器，排序与出现条件 `when` 的规则见 ARCH.md。

| 容器（插槽） | 默认子部件 | 适合插入 |
|---|---|---|
| `core:shell.overlay` | 设置浮层、确认框 | 模组对话框 |
| `core:shell.nav` | 大厅、个人配置、干员调配、玩法说明 | 新入口（如统计模组的入口） |
| `core:entry.corner` | 语言、设置、玩法说明 | 公告、链接 |
| `core:profile.tabs` | 六个分页 | 模组设置页 |
| `core:room.main` | 席位列表 | 房间规则展示 |
| `core:room.side` | 房主控制、观众 | **聊天** `chat:panel`、模组房间设置 |
| `core:room.actions` | 准备、开始、离开… | 新按钮 |
| `core:room.below` | 干员调配面板 | 房间下方的扩展面板 |
| `core:briefing.columns` | 首领、关卡、阵营、本局信息 | 模组规则说明 |
| `core:match.hud.top` | 退出、回合、LP、倒计时、查看键 | 新指示器 |
| `core:match.hud.under` | 播报、盟约条 | 新条带 |
| `core:match.hud.left` | 队伍栏 | — |
| `core:match.hud.side` | 效果列 | **聊天**（`when: coop`，可折叠） |
| `core:match.hud.bottom` | 商店栏 / 作战 HUD（按阶段） | 新工具栏 |
| `core:match.hud.float` | 详情卡、表情、奖励提示 | 浮动面板 |
| `core:match.modal` | 机变、装备替换、暂停、托管、投票 | 模组弹窗 |
| `core:result.extra` | 空 | 统计模组的本局摘要 |

聊天示例：模组用 `insert into` 把 `chat:panel` 加进 `core:room.side` 与 `core:match.hud.side`；消息走扩展信道，快捷键经意图总线注册；兼容模式下没有扩展信道，`when` 不满足，不出现。


## 基础部件

在 `ui/` 用 React Aria 实现，只读令牌，导出给模组。已有：Button、ToggleButton、Panel、Meter、Slider、TextField、ChoiceGroup、ActionMenu。

需补：Dialog / Modal、Overlay（全屏覆盖页）、Popover、Tooltip、Toast、Tabs、ListBox / GridList（可选列表、卡片网格）、Card、Select、Switch、SearchField、Disclosure（折叠）、ProgressBar、Spinner、Countdown、Avatar（头像框）、Badge / Chip（阶、盟约、标签）、Icon、RichText（官方描述标记）、Hotkey 提示、空状态与错误面板。

游戏专用（`ui/` 之上、仍可替换）：TierChip、PriceHex、BondDisc、LpTower、SevenSeg、PhaseCapsule、DifficultyTag、UnitThumb、EmoteArt。

令牌类别：颜色（底、面、线、文字、强调、状态、阶色、难度色、盟约色、富文本色）、字体（家族、字号阶梯、数字字体）、间距、圆角、阴影 / 发光、描边、层叠（背景、HUD、浮层、对话框、提示、横幅）、动效（时长、缓动、减弱动效）、尺寸（HUD 条高、卡片宽、头像、触控最小尺寸）、断点（手机横屏、平板、桌面）。

## 粒度原则

- 一个部件对应一块玩家能叫出名字的界面（“商店卡”“队伍行”），列表的容器与单项各是一个部件，单项可单独替换。
- 部件只读 store 的选择器、只经意图总线发动作；容器负责布局，不读游戏数据。
- 列表的单项（商店卡、席位、队伍行、结算卡）各自可替换；盟约圆片、表格行不注册 id。
- 多处出现的同一信息只有一个部件（如 `core:match.info`），容器各自决定外框。
- 纯展示的小件（阶标、价格、盟约圆片）是基础部件，不注册 id；需要模组改外观时走令牌。
- 战场内的操作（整备区、选中菜单、朝向轮盘、拖放）由战场一侧负责，界面只接收战场给出的事件与坐标。master 这套操作以指针拖放为主，对手柄不友好；将来支持手柄时要在战场一侧补焦点与方向键导航，界面部件经 React Aria 已有键盘焦点。
- 阶段切换只换布局部件，HUD 部件按阶段自行显隐，不各写一份。

## 待讨论问题

暂无；新的问题随实施补充。

## 实施顺序

1. 框架：按 APP.md 的目标目录迁移文件；外壳五层、布局部件与容器、`ui/` 补齐、令牌类别；各页先放占位部件，能按 id 列出。
2. 逐页填充：入口与个人配置 → 房间 → 简报与选策略 → 对局 HUD（顶栏、队伍、盟约、商店、详情、作战、浮层）→ 结算 → 干员调配、玩法说明页 → 示例模组 `double-tap-buy`、`stats`。
3. 每页完成时对照 master：同一流程状态下用无头浏览器分别截图 master 与 next，并排交给用户人工审阅（不做像素比对），记录缺失的信息与操作。
4. 插槽验证：用聊天示例模组 `insert into` `core:room.side` 与 `core:match.hud.side`，确认不装模组时布局不变。
