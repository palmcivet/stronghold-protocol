---
title: 设置段
description: 个人配置怎样按段注册与读写：领域入口与启动/集成 API，以及官方四段。
---

# 设置段

个人配置按**段**组织，代码在 `infra/settings`。界面与领域经领域入口读写，不直接拼存储键。每段自带一个 `defineItem` 存储项（键为 `settings.<名>`，见 [本地存储](./08-storage.md)），不发给服务端。与 welcome 协议的后端能力集（`Capabilities`）无关。

## 领域入口

日常读写与订阅用下列 API（与启动/集成 API 分开）：

| 名称 | 作用 |
| --- | --- |
| `defineSettingSection(def)` | 注册一段；返回撤销函数。同一 `id` 定义两次会抛错 |
| `getSetting(sectionId)` | 从聚合状态同步读出该段 |
| `setSetting(sectionId, patch)` | 把 `patch` 合并进该段并写入聚合状态 |
| `useSetting(sectionId)` / `useSetting(sectionId, select)` | React 订阅整段，或经 `select` 取切片 |
| `startSettings()` | 各段已注册且存储已预读之后调用：载入各段 `item`、接上 `persistStore`、跑 `apply`；返回停止函数 |

`defineSettingSection` 的 `def`：

| 字段 | 含义 |
| --- | --- |
| `id` | 段 id，如 `core:identity` |
| `titleKey` | 分页标题文案键，`命名空间:名称` |
| `order` | 插入 `core:profile.tabs` 的顺序 |
| `when?` | 可选的插槽条件（`InsertWhen`） |
| `item` | 已用 `defineItem` 建好的存储项（以便进入预读） |
| `Panel` | 分页面板组件 |
| `pick` | 从聚合 `SettingsState` 取出本段 |
| `merge` | 把本段值写回聚合的 `Partial<SettingsState>` |
| `apply?` | 段值变化时（以及 `startSettings` 时各一次）的副作用 |

注册时还会 `definePart` 该 `id`，并 `insertPart` 进 `core:profile.tabs`。

## 启动 / 集成 API

同属 `#infra/settings` 的公开导出，供 boot、音量面板与地面接线调用，不是领域日常的 get / set / use：

| 名称 | 谁用 | 作用 |
| --- | --- | --- |
| `migrateSettingsSections()` | boot（存储预读前） | 把旧单体 `alliance.settings` / `wsde:device:core:settings` 拆进四段项后删除旧键；已有段值则跳过 |
| `registerOfficialSettings(panels)` | boot / profile | 注册官方四段（接线存储项、分页面板与 `apply`）；返回各段的撤销函数列表 |
| `setChannel(channel, change)` | 音量面板 | 改 `core:audio` 某一通道的 `volume` / `muted`，其余通道不动 |
| `onGroundQuality(sink)` | 战场 / 地面 | 订阅 `core:display` 画质映射后的地面档（`groundQualityOf`）；返回取消订阅 |

启动顺序：`migrateSettingsSections` → 预读 → `registerOfficialSettings` → `startSettings`。`startSettings` 之前聚合可能已有预读种子，供 boot 只读。

`infra/store/settings` 仍再导出聚合仓库与部分助手，供旧调用点使用；新代码优先走本页入口。

## 官方段

| 段 id | 存储键 | 段值形状 |
| --- | --- | --- |
| `core:identity` | `settings.identity` | `{ language, name, avatar }` |
| `core:display` | `settings.display` | `{ quality, textSize, safeAreaUi }` |
| `core:audio` | `settings.audio` | `{ audio }`：`audio` 为通道表 |
| `core:keys` | `settings.keys` | `{ keymap }` |

- `quality`：`low` / `standard` / `high`。映射到地面时，`standard` 与 `high` 都当高画质（`groundQualityOf`）。
- `textSize`：`sm` / `md` / `lg` / `xl`。
- `safeAreaUi`：异形屏 UI 适配；为真时 HUD 避让安全区。
- `audio` 通道：`master` / `music` / `sfx`，各含 `volume`（0–100）与 `muted`。
- `keymap`：动作 id → 玩家改过的 `KeyboardEvent.code` 列表（每项最多 4 个）。

`apply` 已接上的副作用：`core:identity` 在语言变化时调用文案层的 `setLanguage`；`core:display` 更新文字大小、安全区，并把画质推给 `onGroundQuality` 的订阅方。

- `core:profile.feedback` 是反馈分页，不是设置段。
- 画质、文字大小、安全区如何落到根元素与令牌，见 [样式与令牌](./11-style.md)。
- 音量怎样变成增益，见 [音效线索](./13-audio.md)。
- 按键覆盖怎样进意图表，见 [按键](./07-keymap.md)。

## 聚合状态

四段共享一份聚合 `settingsStore`（`SettingsState` 含上述全部字段）。领域入口都经各段的 `pick` / `merge` 读写这份聚合。

## 边界

- 设置只存在本设备，不进 `hello` / 房间状态，也不与 welcome 的 `Capabilities` 合并。
- 未注册的 `sectionId` 在 `getSetting` / `setSetting` / `useSetting` 时抛错。
- 字段合法性由各段 `item` 的 schema 在存储编解码时约束。
