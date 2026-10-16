---
title: 资源映射
description: 从 master 后端的 assets.json 读出资源，哪些地址能映射成键，哪些不能。
---

# 资源映射

客户端连接 master 后端时，资源不从基础包与赛季包读取，而是由 `buildUpstreamManifest` 从后端的资源表生成一份 `upstream` 包清单。地址到键的映射由本包负责。

## 读取的文件

| 地址 | 必需 | 说明 |
| --- | --- | --- |
| `<backend>/data/assets.json` | 是 | master 的资源表：干员、敌人、召唤物、音频、字体等 |
| `<backend>/data/local-assets.json` | 否 | master 本机提取的资源表。不存在时按空处理 |

同一份 `assets.json` 也可以在构建之外用 `buildUpstreamManifest` 生成清单。它返回清单与问题列表，不读取文件系统。

## 地址映射

每条映射规则写在 `alliance/compat/upstream/data/asset/rules.ts`。下面按资源类别列出概要，每条写作「master 地址 → 资源键」，下一行是领域引用（`refs` 里的路径）；没有领域引用的规则注明「无」。

占位符：`<id>` 是条目 id，`<file>` 是文件名，`<name>` 是名字，`<path>` 是路径，`<pose>` 是 `front` 或 `back`，`<variant>` 是变体名，`<prof>` 是职业，`<char>` 是角色，`<slot>` 是槽位，`<unit>` 是单位，`<dir>` 是目录，`<family>`、`<weight>` 是字体族与字重。

### 干员 `chars`

- `chars.<id>.avatar`、`avatarE2` → `image:char/avatar/<file>`
  - 领域引用：`chars.<id>.avatar`、`avatarElite`
- `chars.<id>.portrait`、`portraitE2` → `image:char/portrait/<file>`
  - 领域引用：`chars.<id>.portrait`、`portraitElite`
- `chars.<id>.spine.front`、`back` → `spine:char/<id>/front` 或 `back`
  - 领域引用：`chars.<id>.spine.<pose>`

### 敌人与召唤物 `enemies`、`tokens`

- `enemies.<id>.icon`、`spine` → `image:enemy/icon/<id>`、`spine:enemy/<id>`
  - 领域引用：`enemies.<id>.icon`、`spine`
- `tokens.<id>.avatar` → `image:token/icon/<id>`
  - 领域引用：`tokens.<id>.icon`
- `tokens.<id>.spine` → `spine:token/<id>/front`
  - 领域引用：`tokens.<id>.spine`
- `tokens.<id>.spine`（有 `spineVariant`）→ `spine:token/<id>/<variant>`
  - 领域引用：`tokens.<id>.spineVariants.<variant>`

### 图标与界面

- `bonds`、`bands` → `image:bond/<name>`、`image:band/<name>`
  - 领域引用：`bonds.<name>`、`bands.<name>`
- `items.<id>` → `image:season/act2autochess/trap/<id>`
  - 领域引用：`items.<id>`
- `modules.<name>` → `image:module/<file>`（文件名小写）
  - 领域引用：无
- `skills.<id>`、`skillsById.<id>` → `image:skill/<file>`
  - 领域引用：`skills.<id>`
- `prof.icon`、`large`、`battlecard`、`sub` → 依次为 `image:prof/...`、`image:prof/large/...`、`image:prof/card/...`、`image:prof/sub/...`
  - 领域引用：`prof.icon.<prof>` 等
- `ui.<path>` → `image:ui/<path>`
  - 领域引用：无
- `ui.entry/bkg_01` → `image:ui/entry/bkg_01`
  - 领域引用：`backdrop`（页面背景图）

### 音频 `audio`

- `audio.bgm`、`audio.bossBgm`（含 `combatAlts`）→ `audio:bgm/<file>`
  - 领域引用：`bgm.<file>`
- `audio.voice.<char>.<slot>` → `audio:voice/cn/<char>/<file>`
  - 领域引用：`voice.<char>.<slot>`；列表槽位是键的数组
- `audio.sfx.ui.<name>`（目录 `general/g_ui/`）→ `audio:sfx/ui/<file>`
  - 领域引用：`sfx.ui.<file>`
- `audio.sfx.battle.<name>`（目录 `battle/<dir>/`）→ `audio:sfx/battle/<file>`
  - 领域引用：`sfx.battle.<file>`
- `audio.sfx.units.<unit>.<slot>`（目录 `player`、`enemy`、`battle`）→ `audio:sfx/battle/<file>`
  - 领域引用：无

### 字体 `fonts`

- `fonts.faces.<id>.woff2` → `font:<family>/<weight>`
  - 领域引用：`fonts.<family>.<weight>`

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

不作为资源读取的字段：`fonts.css`、字体的 `original` 原始文件、`enemies.<id>.spineAliasOf`、`tokens.<id>.owner`、`audio.sfx.units.<unit>.mix`（音量与音调数值），以及 `version`、`hash`、`generator`、`stats`。
