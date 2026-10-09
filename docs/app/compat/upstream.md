---
title: 连接 master 后端
description: 客户端连接 master 后端时，如何从它的 assets.json 读出资源，哪些地址能映射，哪些不能。
---

# 连接 master 后端

客户端连接 master 后端时，资源不从基础包与赛季包读取，而是从后端的 `data/assets.json` 生成一份 `upstream` 包清单。`assets-catalog` 仍只看资源键，不认识 master 的地址格式。地址到键的映射由 `app/compat/upstream` 负责。

## 读取的文件

| 地址 | 必需 | 说明 |
| --- | --- | --- |
| `<backend>/data/assets.json` | 是 | master 的资源表：干员、敌人、召唤物、音频、字体等 |
| `<backend>/data/local-assets.json` | 否 | master 本机提取的资源表。不存在时按空处理 |

同一份 `assets.json` 也可以在构建之外用 `buildUpstreamManifest` 生成清单。它返回清单与问题列表，不读取文件系统。

## 图层顺序

客户端在兼容模式下按以下顺序叠加图层，后者替换前者的同名键：

1. 下一版基础包（可选，配置 `nextBase` 时加载）
2. master 后端生成的 upstream 清单
3. 本地覆盖清单（`local` 选项，缺失时为空）

下一版基础包只补 master 缺的键。赛季包不参与兼容模式，因为它的内容可能与 master 后端的赛季不一致。

## 地址映射

每条映射规则写在 `app/compat/upstream/data/asset/rules.ts`。下表是概要：

| master 地址 | 资源键 | 领域引用 |
| --- | --- | --- |
| `chars.<id>.avatar`、`avatarE2` | `image:char/avatar/<文件名>` | `chars.<id>.avatar`、`avatarElite` |
| `chars.<id>.portrait`、`portraitE2` | `image:char/portrait/<文件名>` | `chars.<id>.portrait`、`portraitElite` |
| `chars.<id>.spine.front`、`back` | `spine:char/<id>/front` 或 `back` | `chars.<id>.spine.<姿势>` |
| `enemies.<id>.icon`、`spine` | `image:enemy/icon/<id>`、`spine:enemy/<id>` | `enemies.<id>.icon`、`spine` |
| `tokens.<id>.avatar` | `image:token/icon/<id>` | `tokens.<id>.icon` |
| `tokens.<id>.spine` | `spine:token/<id>/front` | `tokens.<id>.spine` |
| `tokens.<id>.spine`（有 `spineVariant`） | `spine:token/<id>/<变体名>` | `tokens.<id>.spineVariants.<变体名>` |
| `bonds`、`bands` | `image:bond/<名>`、`image:band/<名>` | `bonds.<名>`、`bands.<名>` |
| `items.<id>` | `image:season/act2autochess/trap/<id>` | `items.<id>` |
| `modules.<名>` | `image:module/<小写文件名>` | 无 |
| `skills.<id>`、`skillsById.<id>` | `image:skill/<文件名>` | `skills.<id>` |
| `prof.icon`、`large`、`battlecard`、`sub` | `image:prof/...`、`image:prof/large/...`、`image:prof/card/...`、`image:prof/sub/...` | `prof.icon.<职业>` 等 |
| `ui.<路径>` | `image:ui/<路径>` | 无 |
| `audio.bgm`、`audio.bossBgm`（含 `combatAlts`） | `audio:bgm/<文件名>` | `bgm.<文件名>` |
| `audio.voice.<角色>.<槽位>` | `audio:voice/cn/<角色>/<文件名>` | `voice.<角色>.<槽位>`（列表槽位为键的数组） |
| `audio.sfx.ui.<名>`（`general/g_ui/`） | `audio:sfx/ui/<文件名>` | `sfx.ui.<文件名>` |
| `audio.sfx.battle.<名>`（`battle/<目录>/`） | `audio:sfx/battle/<文件名>` | `sfx.battle.<文件名>` |
| `audio.sfx.units.<单位>.<槽位>`（`player`、`enemy`、`battle` 目录） | `audio:sfx/battle/<文件名>` | 无 |
| `fonts.faces.<id>.woff2` | `font:<字体族>/<字重>` | `fonts.<字体族>.<字重>` |

文件路径规则：

- 图片、Spine、字体的文件地址是后端的 `/assets/...` 与 `/fonts/...`。
- 音频走后端的 `/media/...` 路由，去掉目录前缀 `/assets/audio/` 和扩展名。
- 清单的文件没有字节数与哈希，`hash` 为空串，客户端不校验。

## 不映射的地址

映射失败的地址不猜测，记入问题列表（`store.compatIssues`），并且不生成键。以下情况会进入问题列表：

- `enemies.<id>.spineLocal`、`tokens.<id>.spineLocal`：本机客户端提取的 Spine，只能由 `local-assets.json` 提供，当前未读取。
- 音效不在映射目录下：`audio.sfx.ui` 中不在 `general/g_ui/` 的地址（如 `customse/`、`battle/`）、`audio.sfx.battle` 中的 `player/`、`enemy/` 目录、`audio.sfx.units` 中的 `ambience/` 目录。
- 键不合法的地址，例如 `ui` 路径中含 `.` 或空格。
- 同一键来自两个不同地址时，保留先出现的一个，后者记入问题。

不作为资源读取的字段：`fonts.css`、字体的 `original` 原始文件、`enemies.<id>.spineAliasOf`、`tokens.<id>.owner`、`audio.sfx.units.<单位>.mix`（音量与音调数值），以及 `version`、`hash`、`generator`、`stats`。

