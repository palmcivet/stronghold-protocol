---
title: 数据编译器与目录
description: alliance/data 的编译器目录、手写输入与构建时对 catalog / extractor 的依赖方向。
---

# 数据编译器与目录

卫戍协议的数据构建器依赖 `arknights-assets-catalog`，`arknights-assets-catalog` 不依赖卫戍协议。

构建器调用 `arknights-assets-extractor` 的 `extract` 命令，并复用它的文件端口与缓存布局；键、清单类型、守卫与地址来自 `arknights-assets-catalog`。运行时（`runtime/`）只读数据包，不引用 `arknights-assets-extractor`。产物与运行时读取面见 [目录](./01-layout.md)。

构建器自行处理这些逻辑：读官方活动表，把干员收成这一季的棋子，把敌人收成这一季的敌人记录，写出羁绊、波次、地图和难度；推导基础与赛季的资源需求，派生动画角色表与棋盘 tiles，写出两份资源清单。它决定要哪些资源键，再交给提取器去取字节。整条资源流水线见 [资源从哪里来](./03-resource.md)；命令与流程见 [编译](./02-compiler.md)。

赛季数据在 `alliance/data`。

```text
alliance/data/
  compiler/
    gamedata.ts           提取缓存中 gamedata 表的路径与读取（@alliance/data/gamedata）
    packet/               官方表收成这一季的 JSON
      compile/            season、context、validate；levels 为关卡来源，数据包与需求共用
      text/               parse、notes
      record/             棋子、羁绊、波次等；stage/ 是 record、ground-path
      character.ts        干员属性、技能、模组。棋子、召唤物和地图共用
    media/                资源需求、派生与打包，以及对局表情
      emote.ts            对局表情
      need/               基础与赛季需求推导、--full 全量基础需求、上游缺失表、音频银行、敌人 id 收集
      derive/             动画角色表；board/ 为棋盘 tiles（atlas、material、surface、png）
      pack/               清单构建、回退、refs、fonts.css
      spine/              anim-role，把 Spine 动画名收成角色表
    input/                base/、season/<id>/ 的版本与配置，research/ 研究表
    scripts/              needs、extract、packet、derive、packs、emotes 命令
  workspace.ts            目录路径，供 Vite 配置导入（@alliance/data/workspace），不依赖构建器
  runtime/
    packet/               读取赛季 JSON
    port/                 运行时的文件端口与读取错误
  schema/                 赛季文件名、refs 类型与守卫、发布布局
  test/                   同时用到多个源文件的用例，文件名用 .spec.ts
  .cache/
    needs/                base.json、season-<id>.json
    assets/               提取缓存（repos/、files/、catalog.json 等，见 [缓存目录](../../../assets-extractor/reference/05-command.md#缓存目录)）
    derived/              派生原始清单与 json 文件
    build-data-report.json
  product/
    base/                 基础资源清单 manifest.json 与 fonts.css
    season/<id>/          这一季的数据包与赛季资源清单 manifest.json
```

## 手写输入

| 路径 | 内容 |
| --- | --- |
| `alliance/data/compiler/input/base/pack.json` | 基础包修订号 |
| `alliance/data/compiler/input/season/<id>/pack.json` | 赛季包版本 |
| `alliance/data/compiler/input/season/<id>/tuning.json` | 这一季手写的结算等配置（目前主要是结算称号规则；敌我数值用官方表，不再套自定义倍率） |
| `alliance/data/compiler/input/research/` | 模式要读的研究表（含 `07-assets.json`） |
| `alliance/data/compiler/input/base/absent.json` | 没有上游来源的键及原因，需求中写成可选 |

## 研究表 `07-assets.json`

`compiler/input/research/07-assets.json` 是 2026-09-27 由工具从上游仓库的 git 树生成的快照，不再重新生成，改动都是手工编辑。`compile:needs` 怎样用它见 [研究表](./03-resource.md#研究表)。

## 基础包与赛季包的划分

赛季命名空间前缀写在 `compiler/media/pack/manifest.ts` 的 `SEASON_PREFIXES`。打包守卫按它检查：基础包不得出现赛季命名空间，赛季包不得出现基础命名空间。对外的划分约定见 [基础包与赛季包](./03-resource.md#基础包与赛季包)。

## 本地开发服务器

`alliance/client/vite-plugins.ts` 的 `devResourcesPlugin` 按发布布局提供文件：

| URL | 文件 |
| --- | --- |
| `/res/files/<address>` | 先 `alliance/data/.cache/derived/`，再 `alliance/data/.cache/assets/files/` |
| `/res/packs/base/<任意>/<file>` | `alliance/data/product/base/<file>` |
| `/res/packs/season/<id>/<任意>/<file>` | `alliance/data/product/season/<id>/<file>` |
| `/res/local/manifest.json` | `alliance/client/local/manifest.json`；缺失时返回空的本地清单 |
| `/data/seasons/<id>/<file>` | `alliance/data/product/season/<id>/<file>`（数据包） |

发布布局契约见 [地址与发布布局](./03-resource.md#地址与发布布局)。

## 本机棋盘贴图

棋盘贴图、网格、材质与 prefab 只能从官方客户端提取（`pnpm extract:local`，见 [命令](../../../assets-extractor/reference/05-command.md#extract-local)）。抽出后，`alliance/client/scripts/install-local-map.mjs` 把文件拷进资产缓存并写 `alliance/client/local/manifest.json`；兼容模式把该清单叠进 ResourceStore。有官方漫反射后使用官方贴图。对画面的影响见 [战场 · 地面](../client/14-field.md#地面)。

