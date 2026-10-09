---
title: 编译
description: 卫戍协议的构建器从官方数据与提取出的资源，写出赛季数据包、基础资源包与赛季资源包。
---

# 编译

所有命令在 `app/data/` 里执行，先 `pnpm build`，再跑读取 `dist/` 的脚本。缓存默认在 `app/data/.cache/`。

## 命令

| 脚本 | 作用 |
| --- | --- |
| `pnpm compile:needs --season <id> [--full]` | 按研究表与已提取的 gamedata，写出 `.cache/needs/base.json` 与 `season-<id>.json`；`--full` 见[全量基础需求](#全量基础需求) |
| `pnpm extract:media` | 把 `.cache/needs/` 下全部需求交给资源提取器，结果写进 `.cache/assets/`，参数原样传给 `extract` |
| `pnpm compile:packet --season <id>` | 从 gamedata 编译赛季数据包，写到 `product/season/<id>/` |
| `pnpm compile:derive --season <id>` | 从 Spine 侧车派生动画角色表，从棋盘贴图派生棋盘 tiles，写进 `.cache/derived/` |
| `pnpm compile:packs --season <id>` | 写出基础包与赛季包清单，并生成 `product/base/fonts.css` |
| `pnpm compile:emotes --season <id>` | 写出赛季的 `emotes.json`；每个表情的 `art` 是图片的键 `image:ui/emoticon/<dir>/<picId>`，与 `@alliance/contract` 的 `emoteArtKey` 相同 |

## 流程

```text
compile:needs ─▶ extract:media ─▶ compile:needs ─▶ extract:media ─▶ compile:packet ─▶ compile:needs ─▶ extract:media ─▶ compile:derive ─▶ compile:packs
   第一遍：gamedata 常量        第二遍：音频、语音、关卡        第三遍：数据包里的敌人与召唤物 id
```

- 关卡表依赖 `activity_table.json`，音频依赖 `audio_data.json` 与 `charword_table.json`。这三张表只有提取过才能读取，所以第一遍只写 gamedata 常量。提取后再运行 `compile:needs`，就能补齐音频与关卡需求。
- 数据包里的敌人、召唤物与 boss 图鉴 id 只能在编译数据包之后知道，所以第三遍再推导一次。这两遍之间的提取只补新增的键，账本会复用已有文件。
- 只有在上一遍的 `compile:needs` 写出需求之后，`extract:media` 才会取回新增的键。

`extract:media` 有必需键缺失时退出码为 1，并且不会写出清单。

## 需求

`compile:needs` 只读研究表（`compiler/input/research/`）与提取缓存，不读取媒体文件。

| 清单 | 内容 |
| --- | --- |
| `base.json` | 干员头像、立绘、战斗 Spine，敌人与召唤物的图标和 Spine，通用战斗与界面图标，字体，通用音效，语音，单位音效，gamedata 常量 |
| `season-<id>.json` | 赛季界面（`ui/*`）、表情、引导、盟约与羁绊图、陷阱道具图、BGM、模式音效、棋盘贴图，以及赛季关卡的 gamedata |

键的命名空间决定它属于哪一包，见 [资源键](../../development/assets-catalog/key.md)。

- 敌人的 Spine 按敌人记录的 `spine`（官方 `prefabKey`）请求。`enemy_2001_duckmi_2` 与 `enemy_2001_duckmi` 共用一个模型，只请求 `spine:enemy/enemy_2001_duckmi`。
- 研究表中没有名字的召唤物条目不是官方召唤物，不进入需求。
- 由敌人充当的召唤物（如 `enemy_9012_acloon`）照常请求 `image:token/icon/<id>` 与 `spine:token/<id>/front`，提取器从敌人目录与 Ark-Models 取文件。

### 上游缺失的键

`compiler/input/base/absent.json` 列出已确认没有任何上游来源发布的键，值为原因：

```json
{
  "spine:token/token_10039_ulpia_block/front": "In no upstream source; only the local client has it"
}
```

列在这里的需求一律写成可选，并带上 `absent` 字段。提取报告 `report.json` 的 `needs.absentUpstream` 列出这些缺失键与原因，`needs.unexplained` 列出其余可选缺失键，后者是待排查的规则或来源缺口。

### 全量基础需求

默认的基础需求是已启用赛季所需基础键的并集。加 `--full` 时，另按官方 gamedata 表列出：

| 表 | 需求 |
| --- | --- |
| `character_table` | 全部干员的头像、立绘、正反面 Spine、精英二头像与立绘（有第三阶段时）、子职业图标、技能图标；全部召唤物的图标与正面 Spine |
| `skin_table` | 替换战斗模型的皮肤：干员皮肤 `spine:skin/<皮肤>/front`、`back`，召唤物皮肤 `spine:token/<id>/<皮肤>` |
| `enemy_handbook_table`、`enemy_database` | 全部图鉴敌人的图标，全部敌人模型（`prefabKey`）的 Spine |
| `charword_table` | 全部干员的语音，槽位与语言仍由 `--voice-lang`、`--voice-all` 决定 |

- 只由 `--full` 加入的需求都是可选（`required: false`）；默认需求里的必需键保持必需。
- `--full` 把 `json:gamedata/excel/skin_table` 列为必需需求。表还没提取时，对应部分留空并给出提示；运行 `extract:media` 后再运行一次 `compile:needs --full`。

```bash
pnpm compile:needs --season act2autochess --full
pnpm extract:media
pnpm compile:needs --season act2autochess --full
pnpm extract:media
```

## 数据包

数据包只写领域 id 与显式默认值，不写资源地址或键。

- 敌人的 `attackAnim` 是必填字段。当前所有敌人的值为 `null`：`mission-core` 在没有动画片段时停顿 0.35 秒，与此一致。
- `chess.json`、`tokens.json` 不带 `assets` 字段。资源引用由资源包的 `refs` 提供，数据包只写领域 id。
- gamedata 从提取缓存读取。

## 资源包

`compile:packs` 写出两份清单，字段与「包清单」一节一致。

| 文件 | 版本 | 内容 |
| --- | --- | --- |
| `product/base/manifest.json` | `<官方资源版本>+r<修订号>`，如 `78.0.0+r1` | 基础需求的全部键 |
| `product/season/<id>/manifest.json` | `compiler/input/season/<id>/pack.json` 中的 `version` | 赛季需求的键、动画角色表与棋盘 tiles |

- 官方资源版本取自 gamedata 仓库的 `zh_CN/gamedata/excel/data_version.txt` 中的 `VersionControl`。修订号写在 `compiler/input/base/pack.json`，由人手动改动。
- `contentHash` 覆盖清单内容，不含 `pack.contentHash` 与 `fileRoot`。`fileRoot` 只描述部署位置，不属于内容。
- `refs` 从本包命名空间的键的路径推导：`char/avatar/<id>` 进入 `chars[id].avatar`，`spine:char/<id>/front` 进入 `chars[id].spine.front`，`spine:skin/<皮肤>/front` 进入 `skins[皮肤].spine.front`，`font:<family>/<weight>` 进入 `fonts[family][weight]`，`audio:voice/<lang>/<charId>/<voiceId>` 按 `charword_table.json` 的语音槽位归入 `voice[charId][slot]`，`json:board/<theme>/tiles` 进入 `board.theme`。叶子一律是键。
- `refs` 的形状是 `schema/pack-refs.ts` 的 `BaseRefs` 与 `SeasonRefs`，从 `@alliance/data/refs` 导出，打包与客户端共用。打包后用 `isBaseRefs`、`isSeasonRefs` 校验：基础包只含 `chars`、`skins`、`enemies`、`tokens`、`skills`、`prof`、`camp`、`voice`、`sfx`、`fonts`，赛季包只含 `bgm`、`sfx`、`bands`、`bonds`、`items`、`animRoles`、`board`。
- `fallbackId` 只在目标键同在一个包时写入：`char/avatar/<id>_2` 回退到 `char/avatar/<id>`，`spine:enemy/enemy_1305_mhslim` 回退到别名模型。

守卫在写出前检查，任一项失败都不写出清单，并以退出码 1 结束：

- 必需键缺失。
- 基础包含赛季命名空间的键，或赛季包含基础命名空间的键。
- 键集合比上一版缩水。确有意删除时加 `--allow-shrink`。

## 派生文件

`compile:derive` 生成两类派生文件，写在 `.cache/derived/`，由 `catalog.json` 列出，打包时与提取结果合并。

- `json:anim-roles/<seasonId>`：每个 Spine 模型的动画名按角色（待机、部署、攻击、技能、死亡、移动、眩晕）归类，并记下技能下标与时长。
- `json:board/autochess/tiles`：从 `texture:map/autochess/TX_autochessi_D`、`TX_autochessi_common_D`、`TX_autochessi_BG` 三张贴图裁出每个材质与三维表面的矩形，校验覆盖与对比度。主贴图缺失时不写出 tiles，并移除上一次派生的同名条目。

## 其他

- 精英模组可以带 `meleeOnHighGround`。为真时，这名近战棋可以站在远程位。淡金坠饰 `uniequip_003_glady` 写上这个字段。分支特性「可以放置于远程位」不决定站位。
- `compile:packet` 的输出只依赖 gamedata 表，不依赖媒体文件。删除提取缓存中的媒体后，数据包字节不变。
