---
title: 本地存储
description: 客户端怎样在本地保存设置与数据：存储槽与适配器、键格式、版本迁移，以及模组 id 与模组存储。
---

# 本地存储

客户端的本地数据都经存储层读写，代码在 `infra/storage`。上层只依赖适配器接口，不直接使用 localStorage 或 IndexedDB。

## 示例

设置存在本设备，所有者是宿主：

```text
wsde:device:core:settings
```

最近房间按服务端划分，连接 `localhost:3000` 时：

```text
wsde:server=localhost%3A3000:core:recentRooms
```

值的形状是 `{ v, data }`：`v` 是版本，`data` 是数据。

## 键格式

键是 `wsde:<scope>:<owner>:<key>`：

| 段 | 取值 |
| --- | --- |
| `scope` | `device`，或按服务端来源划分的 `server=<origin>` |
| `owner` | `core`，或模组 id |
| `key` | 项的名称 |

- 服务端来源取连接地址的 host，经 URL 编码。
- `key` 中的 `:` 与 `%` 会被编码，其余字符保持原样。

## 存储槽

| 槽 | 用途 | 浏览器适配器 | 跨标签同步 |
| --- | --- | --- | --- |
| `small` | 小配置 | localStorage | `storage` 事件 |
| `large` | 大数据 | IndexedDB（idb-keyval） | BroadcastChannel |
| `secureTab` | 只属于本实例的秘密 | sessionStorage | 无 |
| `secureDevice` | 本设备各实例共享的秘密 | localStorage | 无 |

- 新标签不继承 `secureTab`。
- 浏览器无法使用 IndexedDB 时，`large` 退回内存。
- Web Storage 被禁用或写满时，值只留在本页内存。
- Cache Storage 不归存储层使用。

## 适配器

适配器接口 `StorageBackend` 的方法都是异步的：

| 方法 | 作用 |
| --- | --- |
| `get(key)` | 读值 |
| `set(key, value)` | 写值，值须可序列化为 JSON |
| `delete(key)` | 删除 |
| `keys(prefix)` | 列出以 `prefix` 开头的键 |
| `watch(listener)` | 可选；报告其他实例改过的键 |

宿主在启动时注入自己的适配器：`infra/boot` 的 `startStorage(url, adapters)` 接受四个槽中的任意几个，其余用浏览器适配器。桌面或移动宿主可以用 Tauri store 插件、Capacitor Preferences、SQLite 或系统钥匙串实现。单实例的宿主不需要 `watch`。

适配器契约测试在 `infra/storage/backend-contract.ts`，内存适配器与浏览器适配器都运行这套测试。

## 存储项

每一项声明：

| 字段 | 含义 |
| --- | --- |
| `scope` | `device` 或 `server` |
| `owner` | 所有者 |
| `key` | 名称 |
| `schema` | valibot schema |
| `version` | 当前版本，从 1 开始 |
| `migrations` | 迁移链：`migrations[n]` 把版本 n 的数据升到 n + 1 |
| `fallback` | 默认值 |
| `tier` | 存储槽，默认 `small` |

读取时依次执行迁移链，再按 schema 校验。解析、迁移或校验失败时：

1. 原值备份到同一位置的 `<key>.damaged`
2. 改用默认值

## 启动顺序

所有接口都是异步的，界面却需要同步读取。启动时依次：

1. 注入宿主适配器
2. 记下服务端来源
3. 迁入旧键
4. 把声明过的项读进内存快照
5. 用 `persistStore` 把状态仓库与项接在一起

之后同步读取都读快照。仓库的写入直达适配器；其他实例的写入经 `watch` 回到仓库。

## 宿主的存储项

| 项 | 范围 | 槽 | 版本 |
| --- | --- | --- | --- |
| `settings`：个人配置 | `device` | `small` | 2 |
| `recentRooms`：最近 5 个房间码 | `server` | `small` | 1 |
| `loadout`：干员调配工作副本 | `server` | `small` | 2 |
| `token`：本标签的重连令牌 | `server` | `secureTab` | 1 |
| `tokenWelcome`：本标签令牌首次 `welcome` 的时间 | `server` | `secureTab` | 1 |
| `tokens`：本设备最近的令牌，最多 4 个 | `server` | `secureDevice` | 1 |
| `matches`：各令牌所在对局的显示信息 | `server` | `small` | 1 |

个人配置只存在本地，不发给服务端。它包含语言、代号、头像、画质、文字大小、改过的按键与三个音量通道。

## 迁移

| 迁移 | 内容 |
| --- | --- |
| 旧键迁入 | `alliance.settings`、`alliance.recentRooms`、`alliance.token` 在第一次启动时作为对应项的版本 1 迁入，旧键删除 |
| 令牌位置 | 曾写进 localStorage 的本标签令牌被删除，令牌只留在 `secureTab` |
| `settings` 1 → 2 | 旧的整张 `keys` 表中玩家改过的键变成 `keymap` 覆盖，旧默认值丢弃 |
| `loadout` 1 → 2 | 自选编队每格由单个干员 id 改为带技能与模组的选择 |

## 模组 id

模组 id 的格式是 `<author>/<mod>`，如 `example/chat`。

- 两段都是小写 kebab-case，只用 `[a-z0-9-]`，各 2 到 32 个字符。
- 保留作者 `core`、`wsde`、`official`、`examples`。只有应用自带的模组（含示例）可以使用，第三方模组被拒。
- 应用自己的键保持 `core:*`，`core` 是保留的所有者。
- 带命名空间的键以模组 id 为前缀，如 `example/chat:room.panel`。
- 同一页面里两个模组 id 相同时，后加载的被拒绝并报错。

校验用 `ModIdSchema`（第三方模组）与 `BundledModIdSchema`（应用自带的模组），都是 valibot schema。

## 模组存储

`createModStorage` 为一个模组创建存储：

- 只能读写本模组 id 下、事先声明过的键。每个键声明范围、schema、版本与迁移。
- 每个模组有配额，默认 256 KiB 的 JSON。
- `clear()` 清空本模组的全部数据，用于卸载。
- `export()` 与 `import(data)` 导出与导入。导入时未声明或不合 schema 的项被跳过并列出。
- `inspect()` 给出只读视图，`usage()` 给出已用字节数。

模组的键与宿主的键格式相同，如 `wsde:device:examples/stats:<key>`。
