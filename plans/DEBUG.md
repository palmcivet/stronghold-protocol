# 调试接口与调试模组

本文规划 `alliance/client` 与服务端的调试能力。分工是：宿主内置调试 API，但不带界面；所有调试界面（包括官方的）都是调用这个 API 的模组。规则摘要在 ARCH.md，模组机制见 ARCH.md，界面部件与插槽见文档。

## 调试 API

API 分查询、命令、订阅三类。每一项都有一个 valibot schema，用来校验入参与出参，同一个 schema 也用来生成给 LLM 的工具描述。

### 查询

| 名称 | 返回 |
|---|---|
| `debug.parts` | 部件树：id、来源（`core` 或模组 id）、`replace`/`wrap` 链、所在容器、`when` 是否命中、DOM 包围盒 |
| `debug.text` | 屏幕上某段文本或某个键：i18n 键、命名空间、提供它的语言层（官方 / 模组 / 回退） |
| `debug.resources` | 本局资源快照里的句柄：资源键、引用计数、预加载组、加载状态与错误 |
| `debug.state` | 公开的会话、房间、对局视图，以及最近的消息流（环形缓冲，帧数可配） |

### 命令

| 名称 | 作用 | 归属 |
|---|---|---|
| `debug.field.spawn` | 生成干员或敌人（id、位置、朝向、阵营） | 战场，服务端执行 |
| `debug.field.set` | 修改单位属性（生命、技力、攻击…）或玩家数值（LP、资金、等级） | 战场，服务端执行 |
| `debug.match.skip` | 跳到下一阶段或指定回合 | 对局，服务端执行 |
| `debug.match.pause`、`debug.match.step` | 暂停、按 tick 单步 | 对局，服务端执行 |
| `debug.ui.language` | 切换界面语言 | 客户端 |
| `debug.ui.highlight`、`debug.ui.isolate` | 高亮部件或容器；只渲染某个部件 | 客户端 |
| `debug.ui.fail` | 让某个部件抛错，检验错误边界与安全模式 | 客户端 |

### 订阅

协议消息（收与发）、部件挂载与卸载、资源加载、错误（部件错误边界、连接错误、未捕获异常）。

### 能力分级

| 环境 | 查询 | 客户端命令 | 改状态的命令 |
|---|---|---|---|
| 本地服务端，或单人房间 | 有 | 有 | 有：作为协议消息发出，由服务端校验并执行 |
| 多人房间 | 有 | 有 | 无 |
| 兼容模式（master 后端） | 有 | 无 | 无 |

客户端从不自行修改对局状态；战场命令经过服务端，与普通意图走同一条校验路径。

### 注入与外部桥接

- 只在开发构建或玩家显式开启时注入；生产构建不打包调试模组，默认也不暴露 API。
- 外部代理（编码助手、端到端测试）经 MCP 或 WebSocket 桥接访问同一个 API，工具描述由 schema 生成，权限检查与能力分级与页面内调用相同。

## 对其他部分的要求

- 部件注册表记录每个部件的来源，以及 `replace`/`wrap` 链。
- `t()` 在开发模式下保留键与来源层，供文本查询与键名浮层使用。
- 资源句柄登记在一个可枚举的注册表里，带引用计数与预加载组。
- `mission-core` 接受外部命令（生成单位、设置属性），并作为确定性命令进入演算；回放与模组也需要同一套命令接口。这是跨团队接口项，要与 ECS 负责人（wayshodaire，REMAIN-ECS.md）对齐。

## 示例调试模组

放在 `examples/extensions/`，只通过调试 API 工作：

| 模组 | 内容 |
|---|---|
| `devtools` | 部件树浏览器（来源、链、容器；悬停高亮布局与容器）、文本键浮层、资源面板、协议日志（筛选、暂停、导出） |
| `sandbox` | 战场沙盒：生成干员与敌人、修改数值、跳阶段、暂停与单步 |

## master 对照

master 没有统一的调试接口，也没有作弊命令；调试能力分散在开发页、环境变量与全局对象里。master 仓库与文档里没有提到社区调试扩展。

| master | 作用 | next |
|---|---|---|
| `public/dev/game-mock.*` | 伪造四人对局，内置模拟服务端回应 `g.*` | 帧流夹具 + `sandbox` |
| `public/dev/render-demo.*`、`recordings/` | 战场渲染演示，回放录制的战斗 | 渲染器开发页（不在本文） |
| `public/dev/battle-perf.*`、`frame-stats.js` | 浏览器战斗性能测量与报告 | 渲染器开发页（不在本文） |
| `public/dev/sim-check.*` | 浏览器与 Node 演算逐 tick 对照 | 引擎测试（不在本文） |
| `public/dev/uikit.html` | 组件展示页 | `ui/` 展示页（APP.md） |
| `public/js/diag.js` | 错误日志与脱敏诊断报告（设置 → 问题反馈） | 订阅“错误”+ 设置页的问题反馈 |
| `globalThis.__SP__`（store、net、data） | 控制台直接读写 | `debug.state` 只读；写入一律走命令 |
| `__SP_RENDER__`、`?render=fallback\|engine`、`__SP_RUNNER__`、`__SP_VIEW__` | 强制战场后端、注入替身 | 开发构建开关（战场一侧） |
| 服务端 `SP_COMBAT`、`SP_VERIFY`、`SP_BOT_EMOTES`、`DEBUG` | 演算位置、复核、机器人表情、日志 | 服务端配置（REMAIN.md） |
| `tools/*.mjs`（matchrun、simrun、botbench、record-battle 等） | 命令行对局与演算 | 外部桥接可驱动同类脚本 |

## devframe 评估

调研结论（2026-10）：

- 是什么：Anthony Fu 等人的“框架中立 DevTools 基座”。一份 `defineDevframe` 定义（RPC 函数、共享状态、SPA、CLI）可以经适配器部署为独立 CLI、开发服务器、Vite DevTools 插件、静态报告、嵌入式宿主或 MCP 服务器。Vite DevTools 建在它之上；`@devframes/hub` 把多个 devframe 合进一个面板集合（停靠栏、命令、消息）。
- 许可与成熟度：MIT；npm `devframe` 1.2.4，2026-04 首发，GitHub 约百星，主要由 antfu 维护，很年轻。
- 承载方式：工具的界面是独立 SPA，挂在自己的基础路径下（嵌入时为 `/__<id>/`），由宿主页面或停靠栏打开；数据走基于 birpc 的 WebSocket RPC（`query`、`static`、`action`、`event`），另有可同步的共享状态。RPC 校验接受任何 Standard Schema 校验器，valibot 在内；MCP 适配器把选定的函数暴露给代理；有 VS Code 风格的 when 子句。
- React：不限界面框架，SPA 用 React 写没有问题。
- 契合点：schema 驱动的 RPC 与 MCP 暴露正对应“一套 schema、两类消费者”；hub 可以容纳 `devtools`、`sandbox` 等多个面板；适配器可以接进 Vite 开发服务器。
- 不契合点：它的 RPC 服务端在 Node 一侧，而我们的大部分调试状态在浏览器页面里（部件树、文本、资源），得有一层“页面 → 开发服务器 → devframe”的转发；生产构建要排除它；版本很新，接口可能还会变。

建议：调试 API 本身不依赖 devframe（宿主只定义 schema 与页面内调用）。`devtools` 模组先用页面内的停靠面板（宿主 `ui/` 基础部件，经 `core:shell.overlay` 插入），保证无外部依赖也能用；外部桥接（MCP / 独立面板）作为一个可选适配层用 devframe 实现：开发服务器起 devframe，页面经 WebSocket 把 API 转发给它。等它稳定后再决定是否把面板也迁过去。

## 分期

- APP.md 第二步：部件注册表的来源与链、`t()` 的来源层、资源注册表、调试 API 的查询与订阅、客户端命令、开发构建注入；示例模组 `devtools`（页面内面板）。
- next 服务端就绪后：改状态的命令（协议消息、服务端校验、能力分级），示例模组 `sandbox`；依赖 `mission-core` 的外部命令接口。
- 之后：MCP / WebSocket 外部桥接（devframe 适配层）。

## 待讨论问题

1. 调试命令的协议形状：作为扩展信道消息（`x`，模组 id `debug`）还是独立的 `dbg.*` 消息族。建议扩展信道，权限检查复用角色检查。
2. “显式开启”的方式：URL 参数、设置开关还是本地模组安装。建议本地安装调试模组即开启，生产包里没有模组就没有 API。
3. 消息流缓冲的大小与是否记录发出的意图。建议默认 500 帧、收发都记，导出时脱敏（同 master 诊断报告）。
4. 多人房间里房主能否在双方同意下用改状态的命令（如私人练习房）。建议先不支持。
5. 外部桥接用 devframe 还是自写一个小 WebSocket 桥。建议先自写最小桥接，devframe 稳定后再评估（见上节）。
6. `debug.field.set` 允许改哪些属性：开放全部组件字段还是白名单。取决于 ECS 的组件模型，与 ECS 负责人一起定。
