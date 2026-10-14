---
title: 来源
description: 来源表怎样为每个键排出候选来源，七个 git 来源各自的查找规则，以及路径表。
---

# 来源

一个**来源**是一个上游仓库分支加一个适配器。适配器只做「键 → 上游文件」的映射；克隆、检出、校验、转换和写文件都由提取流程统一完成。

## 来源表

`SOURCE_TABLE` 按种类与命名空间列出要试的来源，命名空间按整段前缀匹配，最长的前缀优先。前一个来源未命中、不可用或文件校验失败时，试下一个。

| 种类 | 命名空间 | 来源 |
| --- | --- | --- |
| `image` | `char` `skin` `enemy` `token` `skill` `item` | `yuanyan` |
| `image` | `skill/empty` `skill/empty_large` | `arknights-assets` |
| `image` | `prof` `camp` `battle` `rank` `ui` | `arknights-assets` |
| `image` | `band` `bond` `season` | `arknights-assets` |
| `spine` | `char` `skin` | `fexli` |
| `spine` | `token` | `fexli`，再 `ark-models` |
| `spine` | `enemy` | `ark-models` |
| `audio` | `voice` `sfx` `bgm` | `voice` |
| `font` | 全部 | `fonts` |
| `json` | `gamedata` | `gamedata` |

以下命名空间登记在表里，但没有来源，键直接记为缺失：

- `image`：`module`、`fx`
- `texture`：`map`、`mesh`
- `model`：`mesh`
- `json`：`material`、`prefab`、`anim-roles`、`board`

规则：

- 没登记的命名空间与没有来源的命名空间都记为缺失，`tried` 里的来源写作 `source-table`
- `json:spine-meta/<spine path>` 不查来源，提取对应的 `spine:` 键时生成
- 一个来源只接收它 `covers` 声明的种类与命名空间

## 各来源的规则

### `yuanyan`

仓库 `yuanyan3060/ArknightsGameResource@main`。

- `char/avatar/<id>` → `avatar/<id>.png`
- `char/portrait/<id>` → `portrait/`
- `skin/portrait/<id>` → `skin/`
- `enemy/icon/<id>` → `enemy/`
- `token/icon/<id>` → `avatar/`；`<id>` 以 `enemy_` 开头时 → `enemy/`
- `item/<id>` → `item/`
- `item/rarity/<r>` → `item_rarity_img/sprite_item_<r>.png`
- `skill/<iconId>` → 在 `skill/` 下按 `safeName` 反查 `skill_icon_<iconId>.png`

### `fexli`

仓库 `fexli/ArknightsResource@main`。Spine 页图不带预乘 alpha（`pma` 为 `false`）。

- `char/<id>/front` → `spine/<id>/<id>/` 下依次试 `Front`、`Spine`
- `char/<id>/back` → `Back/`
  - `char_107_liskam` 的模型目录是 `char_107_liskarm`
- `skin/<skinId>/<pose>` → 按模型目录的 `safeName` 找 `spine/<owner>/<model>/`
  - 正面依次试 `Front`、`Spine`
- `token/<id>/front` → 先试自身目录的 `Spine`、`Front`
  - 没有时取唯一的变体目录；有多个变体时按同名多候选处理
- `token/<id>/<variant>` → `spine/<id>/<variant>/` 下依次试 `Spine`、`Front`

目录内必须恰有一个 `.skel` 与同名的 `.atlas`；页图是目录内全部 `.png`。

### `ark-models`

仓库 `isHarryh/Ark-Models@main`。Spine 页图带预乘 alpha（`pma` 为 `true`）。

- 处理 `enemy/<spineId>`，以及由敌人充当的召唤物 `token/enemy_<…>/front`
- 去掉 `enemy_` 前缀后，查根目录 `models_data.json` 的 `assetList`
- 文件在 `storageDirectory.Enemy` 下，默认 `models_enemies`
- 列表取第一个不含 `$` 的项，没有时取第一项

### `arknights-assets`

仓库 `ArknightsAssets/ArknightsAssets2@cn`。先查路径表，再按规则：

- `prof/<p>` → `assets/dyn/arts/profession_hub/icon_<p>.png`
- `prof/sub/<s>` → `assets/dyn/arts/ui/subprofessionicon/sub_<s>_icon.png`
- `band/<id>`、`bond/<id>` → 自走棋的 `bandicon/`、`bondicon/`

### `voice`

仓库 `ArknightsAssets/ArknightsAssets2@voice`。先查路径表，再按规则：

- `voice/<lang>/<charId>/<slot>` → `sound_beta_2/<dir>/<charId>/<slot>.mp3`
  - `<dir>` 是 `voice_cn`、`voice`、`voice_en` 或 `voice_kr`
  - `<slot>` 转为小写
- `bgm/<name>` → 在 `music/` 下按名反查
- `sfx/<group>/<name>` → 在 `music/` 与 `voice*` 以外按名反查

### `fonts`

仓库 `TimWangZi/The-font-of-Arknights@master`。

- 三个固定文件：`bender/regular`、`bender/light`、`novecento-wide/normal`
- 主文件转为 WOFF2，原文件作为 `fallback` 角色一起写出

### `gamedata`

仓库 `Kengxxiao/ArknightsGameData@master`。

- `gamedata/<path>` → `zh_CN/gamedata/<path>.json`

## 同名多候选

按文件名反查时，一个名字对应多个上游文件就算该来源未命中：

- `locate` 返回 `null`，不按排序挑一个
- 键与全部候选写进 `report.json` 的 `ambiguous`

## 路径表

有些上游路径不能从键按规则推出。这些键登记在适配器目录下的 `paths.json` 里，内容是「键 → 仓库内相对路径」：

- `source/arknights-assets/paths.json`：界面图
  - `battle/common`、`camp`、`prof/large`、`prof/card`
  - `rank/rarity`（含 `yellow/`）、`rank/elite`（含 `large/`）
  - `skill/empty`、`skill/empty_large`
  - `ui/autochess/*`、`ui/guide`、`ui/emoticon/*`
  - `season/act2autochess/{loading,entry,trap}`
- `source/voice/paths.json`：`bgm/*`、`sfx/autochess/*`、`sfx/battle/*`、`sfx/ui/*`

规则：

- `parsePathTable` 校验每个键的语法与路径：必须是相对路径，不含 `..`
- 测试确认路径表里的每个键都由来源表路由到这个适配器
- 需求清单只有键，不带上游路径

## 适配器接口

`AssetSource` 有四个成员：

- `id`：来源 id，写进原始清单条目的 `source.id`
- `covers`：能处理的种类与命名空间前缀
- `prepare(context)`：打开克隆、读入索引；本次运行用不了时抛错，这个来源下的键记为未命中
- `locate(key, context)`：返回 `SourceHit`，没有时返回 `null`，未命中不抛错

`SourceHit` 给出上游路径、提交号、文件列表与所在的克隆工作区。签名见 [核心接口](./06-api.md#来源)。
