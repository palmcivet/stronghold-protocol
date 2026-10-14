---
title: 部件清单
description: 客户端注册的全部部件与插槽，按页面与对话框分组。
---

# 部件清单

本页列出宿主注册的部件与插槽。「可替换」为「是」的部件开放 `replace` 与 `wrap`；为「否」的部件只能在容器中被插入或排在旁边。机制见 [部件与插槽](./05-part.md)。

## 外壳

| 部件 id | 职责 | 可替换 |
| --- | --- | --- |
| `core:shell.backdrop` | 页面背景 | 是 |
| `core:shell.banner` | 连接横幅：连接中、重连倒计时、已关闭、被接管 | 是 |
| `core:shell.toast` | 提示栈 | 是 |
| `core:shell.tooltip` | 工具提示的层叠位置 | 否 |
| `core:shell.confirm` | 确认框与告知框 | 否 |
| `core:shell.dialog` | 对话框层：显示打开的对话框 | 是 |
| `core:shell.error` | 页面与部件的错误面板 | 否 |
| `core:menu.entry` | 菜单入口 | 是 |

## 对话框

| 部件 id | 职责 | 可替换 |
| --- | --- | --- |
| `core:dialog.profile` | 个人配置布局：分页容器 `core:profile.tabs` | 是 |
| `core:dialog.loadout` | 干员调配布局：分页容器 `core:loadout.tabs` | 是 |
| `core:dialog.guide` | 玩法说明布局 | 是 |

个人配置的分页，每页一个部件，都可替换：

| 部件 id | 分页 |
| --- | --- |
| `core:profile.identity` | 昵称与头像 |
| `core:profile.language` | 语言 |
| `core:profile.keys` | 按键 |
| `core:profile.display` | 画质与文字大小 |
| `core:profile.audio` | 音量 |
| `core:profile.feedback` | 问题反馈 |

干员调配与玩法说明的部件都可替换：

| 部件 id | 职责 |
| --- | --- |
| `core:loadout.roster` | 调配页：干员列表与筛选 |
| `core:loadout.detail` | 选中干员的技能、模组、潜能与练度 |
| `core:loadout.ownership` | 持有与替补页 |
| `core:loadout.diy` | 自选编队页 |
| `core:guide.pager` | 玩法说明翻页器 |

## 入口页

| 部件 id | 职责 | 可替换 |
| --- | --- | --- |
| `core:screen.entry` | 入口页布局：标题区、表单区、提示区、角落区 | 是 |
| `core:entry.hero` | 标题与副标题 | 是 |
| `core:entry.name` | 代号输入 | 否 |
| `core:entry.create` | 模式与难度，创建房间 | 是 |
| `core:entry.join` | 输入房间码、最近房间，加入或观战 | 否 |
| `core:entry.tips` | 作战提示，可前后翻 | 是 |
| `core:entry.settings` | 打开个人配置 | 否 |
| `core:entry.guide` | 打开玩法说明 | 否 |
| `core:entry.resume` | 恢复本机已关闭标签的对局 | 否 |
| `core:entry.server` | 连接状态、后端模式与延迟 | 否 |

## 房间页

| 部件 id | 职责 | 可替换 |
| --- | --- | --- |
| `core:screen.room` | 房间页布局：头部、主区、侧区、操作栏、下方区 | 是 |
| `core:room.header` | 模式与难度、房间码与邀请链接 | 是 |
| `core:room.roster` | 席位列表 | 是 |
| `core:room.seat` | 单个席位，房主可添加或移除 AI、移出玩家 | 是 |
| `core:room.brief` | 独立模拟的难度说明 | 是 |
| `core:room.host` | 房主控制；非房主只读 | 是 |
| `core:room.status` | 就绪人数与状态句 | 是 |
| `core:room.spectators` | 观战席 | 否 |
| `core:room.ready` | 准备按钮 | 否 |
| `core:room.spectating` | 观战中标记 | 否 |
| `core:room.start` | 开始按钮 | 否 |
| `core:room.leave` | 离开房间 | 否 |
| `core:loadout.toggle` | 展开或收起干员调配面板 | 否 |
| `core:loadout.panel` | 房间下方的干员调配面板 | 否 |

## 对局页

| 部件 id | 职责 | 可替换 |
| --- | --- | --- |
| `core:screen.match` | 对局页：按阶段选布局，对局中接管按键 | 是 |
| `core:match.stephead` | 简报与选策略的步骤头 | 是 |
| `core:match.info` | 本局信息：盟约、禁用干员与自选下架 | 是 |
| `core:match.field` | 战场 | 是 |

### 简报

| 部件 id | 职责 | 可替换 |
| --- | --- | --- |
| `core:briefing.layout` | 简报布局 | 是 |
| `core:briefing.boss` | 敌方领袖 | 是 |
| `core:briefing.stage` | 战场与关卡池 | 是 |
| `core:briefing.factions` | 特训敌人 | 是 |
| `core:briefing.info` | 本局信息栏 | 否 |
| `core:briefing.ready` | 就绪人数与准备按钮 | 否 |
| `core:briefing.reroll` | 房主重刷本局 | 否 |
| `core:loadout.briefing` | 打开干员调配对话框 | 否 |

### 选策略

| 部件 id | 职责 | 可替换 |
| --- | --- | --- |
| `core:strategy.layout` | 选策略布局 | 是 |
| `core:strategy.order` | 决策顺序 | 是 |
| `core:strategy.grid` | 可选策略网格 | 是 |
| `core:strategy.detail` | 策略详情、跳过与确认 | 是 |

### 对局 HUD

除注明的三项外，HUD 部件都可替换。

| 部件 id | 职责 |
| --- | --- |
| `core:match.hud` | 对局布局：战场铺满，HUD 分区覆盖其上 |
| `core:match.topbar` | 顶栏容器 |
| `core:match.exit` | 离开键与退出对话框（不可替换） |
| `core:match.round` | 回合与阶段胶囊 |
| `core:match.lp` | LP |
| `core:match.clock` | 倒计时、超时警告、准备与暂停 |
| `core:match.lens` | 本局信息与敌人预览两个查看键（不可替换） |
| `core:match.intel` | 本局信息对话框 |
| `core:match.ticker` | 播报条 |
| `core:match.bonds` | 盟约条 |
| `core:match.bond-detail` | 盟约详情 |
| `core:match.team` | 队伍栏 |
| `core:match.team-row` | 队伍栏的一行 |
| `core:match.effects` | 生效效果列 |
| `core:match.detail` | 详情卡 |
| `core:match.shop` | 商店栏 |
| `core:match.shop-card` | 单张商店卡 |
| `core:match.shop-tools` | 剩余可放置、冻结、刷新（不可替换） |
| `core:match.reward` | 待选奖励提示 |
| `core:match.choice` | 机变选择 |
| `core:match.equip-replace` | 装备替换 |
| `core:match.combat` | 作战 HUD |
| `core:match.emote` | 表情轮盘 |
| `core:match.corner` | 角落：表情、设置、全屏 |
| `core:match.phase-banner` | 阶段横幅 |
| `core:match.vote` | 开局重抽投票 |
| `core:match.pause` | 暂停罩与中止罩 |
| `core:match.away` | AI 托管罩 |

### 结算

| 部件 id | 职责 | 可替换 |
| --- | --- | --- |
| `core:result.layout` | 结算布局 | 是 |
| `core:result.hero` | 胜负、回合、领袖徽章、难度与用时 | 是 |
| `core:result.player` | 玩家卡 | 是 |
| `core:result.actions` | 返回 | 否 |

## 插槽

默认子部件按 `order` 列出。

| 插槽 | 默认子部件 |
| --- | --- |
| `core:shell.overlay` | `core:shell.dialog` 10、`core:shell.confirm` 20 |
| `core:entry.corner` | `core:menu.entry` 5、`core:profile.language` 10、`core:entry.settings` 20、`core:entry.guide` 30、`core:entry.resume` 35、`core:entry.server` 40 |
| `core:profile.tabs` | 六个个人配置分页，10 到 60 |
| `core:loadout.tabs` | `core:loadout.roster` 10、`core:loadout.ownership` 20、`core:loadout.diy` 30 |
| `core:room.main` | `core:room.roster` 10、`core:room.brief` 20 |
| `core:room.side` | `core:room.spectators` 10 |
| `core:room.actions` | `core:room.ready` 20、`core:room.spectating` 30、`core:room.start` 40、`core:loadout.toggle` 50、`core:room.leave` 60 |
| `core:room.below` | `core:loadout.panel` 0 |
| `core:briefing.columns` | `core:briefing.boss` 10、`core:briefing.stage` 20、`core:briefing.factions` 30、`core:briefing.info` 40 |
| `core:briefing.actions` | `core:loadout.briefing` 10、`core:briefing.reroll` 20、`core:briefing.ready` 40 |
| `core:match.hud.top` | `core:match.exit` 10、`core:match.round` 20、`core:match.lp` 30、`core:match.clock` 40、`core:match.lens` 50 |
| `core:match.hud.under` | `core:match.ticker` 10、`core:match.bonds` 20 |
| `core:match.hud.left` | `core:match.team` 10 |
| `core:match.hud.side` | `core:match.effects` 10 |
| `core:match.hud.bottom` | 作战阶段为 `core:match.combat`，备战阶段为 `core:match.shop` |
| `core:match.hud.float` | `core:match.detail` 10、`core:match.reward` 30 |
| `core:match.hud.corner` | `core:match.corner` 10 |
| `core:match.modal` | `core:match.choice` 10、`core:match.equip-replace` 20、`core:match.pause` 30、`core:match.away` 40、`core:match.vote` 50、`core:match.intel` 60、`core:match.bond-detail` 70 |
| `core:result.extra` | 空 |

## 带条件的默认子部件

| 部件 | 插槽 | 条件 |
| --- | --- | --- |
| `core:room.brief` | `core:room.main` | `coop: false` |
| `core:room.ready` | `core:room.actions` | `seat: "player"`、`coop: true` |
| `core:room.spectating` | `core:room.actions` | `seat: "spectator"` |
| `core:room.start` | `core:room.actions` | `seat: "host"` |
| `core:loadout.toggle` | `core:room.actions` | `capability: "loadout"`、`seat: "player"` |
| `core:loadout.panel` | `core:room.below` | `capability: "loadout"`、`seat: "player"` |
| `core:loadout.briefing` | `core:briefing.actions` | `capability: "loadout"`、`seat: "player"` |
