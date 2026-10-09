---
title: 来源与传输
description: 来源表、七个 git 来源适配器的规则与路径表，以及浅克隆加稀疏检出的传输。
---

# 来源与传输

## 适配器接口

`source/asset-source.ts` 定义 `AssetSource`：

| 成员 | 作用 |
| --- | --- |
| `id` | 来源 id，写进原始目录条目的 `source.id` |
| `covers` | 能覆盖的种类与命名空间前缀（整段匹配），来源表只把这些键交给它 |
| `prepare(context)` | 打开浅克隆、读入索引；本次运行无法使用时抛错，该来源下的键记为未命中 |
| `locate(key, context)` | 返回 `SourceHit`（上游路径、提交、文件列表、所在工作区），没有时返回 null，不抛错 |

适配器只负责「键 → 上游位置」。克隆、检出、校验、转换、写缓存、写原始目录都在 `catalog/extract.ts`。

按文件名反查时，同一名字对应多个上游文件即视为未命中：`locate` 返回 null，`context.ambiguous` 把键与全部候选写进 `report.json` 的 `ambiguous`，不按排序挑选其中一个。

## 来源表

`source/table.ts` 的 `SOURCE_TABLE` 按种类与命名空间列出来源顺序，最长的命名空间前缀优先；前一个来源未命中、不可用或文件校验失败时试下一个。

| 种类 | 命名空间 | 来源 |
| --- | --- | --- |
| `image` | `char`、`skin`、`enemy`、`token`、`skill`、`item`（含 `item/rarity`） | `yuanyan` |
| `image` | `skill/empty`、`skill/empty_large`、`prof`、`camp`、`battle`、`rank`、`ui`、`band`、`bond`、`season` | `arknights-assets` |
| `spine` | `char`、`skin` | `fexli` |
| `spine` | `token` | `fexli`，未命中时 `ark-models` |
| `spine` | `enemy` | `ark-models` |
| `audio` | `voice`、`sfx`、`bgm` | `voice` |
| `font` | 全部 | `fonts` |
| `json` | `gamedata` | `gamedata` |
| `image` `module`、`fx`；`texture`；`model`；`json` `material`、`prefab`、`anim-roles`、`board` | — | 无（本机客户端或 `app/data` 提供） |

`json:spine-meta/<spine path>` 不查来源：提取对应的 `spine:` 键时生成。未登记的命名空间与没有来源的命名空间都记为缺失，`tried` 中的来源为 `source-table`。

## 各来源的规则

| 来源 | 仓库 | 规则 |
| --- | --- | --- |
| `yuanyan` | `yuanyan3060/ArknightsGameResource@main` | `char/avatar/<id>` → `avatar/<id>.png`；`char/portrait/<id>` → `portrait/`；`skin/portrait/<id>` → `skin/`；`enemy/icon/<id>` → `enemy/`；`token/icon/<id>` → `avatar/`，`<id>` 以 `enemy_` 开头时 → `enemy/`；`item/<id>` → `item/`；`item/rarity/<r>` → `item_rarity_img/sprite_item_<r>.png`；`skill/<iconId>` 在 `skill/` 下按安全名反查 `skill_icon_<iconId>.png` |
| `fexli` | `fexli/ArknightsResource@main` | `char/<id>/front` → `spine/<id>/<id>/` 下依次试 `Front`、`Spine`，`char/<id>/back` → `Back/`（`char_107_liskam` 的模型目录是 `char_107_liskarm`）；`skin/<skinId>/<pose>` 按模型目录的安全名找 `spine/<owner>/<model>/`，正面依次试 `Front`、`Spine`；`token/<id>/front` 先试自身目录的 `Spine`、`Front`，没有时取唯一的变体目录，多个变体按同名多候选处理；`token/<id>/<变体名>` → `spine/<id>/<变体名>/` 下依次试 `Spine`、`Front`。目录内必须恰有一个 `.skel` 与同名 `.atlas`，页图为目录内全部 `.png`；pma 为 false |
| `ark-models` | `isHarryh/Ark-Models@main` | `enemy/<spineId>` 与 `token/enemy_<…>/front`（由敌人充当的召唤物）去掉 `enemy_` 前缀后查根目录 `models_data.json` 的 `assetList`，文件在 `storageDirectory.Enemy`（默认 `models_enemies`）下；列表取第一个不含 `$` 的项，否则取第一项；pma 为 true |
| `arknights-assets` | `ArknightsAssets/ArknightsAssets2@cn` | 先查路径表；`prof/<p>` → `assets/dyn/arts/profession_hub/icon_<p>.png`；`prof/sub/<s>` → `assets/dyn/arts/ui/subprofessionicon/sub_<s>_icon.png`；`band/<id>`、`bond/<id>` → 自走棋 `bandicon/`、`bondicon/` |
| `voice` | `ArknightsAssets/ArknightsAssets2@voice` | 先查路径表；`voice/<lang>/<charId>/<slot>` → `sound_beta_2/<voice_cn|voice|voice_en|voice_kr>/<charId>/<slot 小写>.mp3`；`bgm/<name>` 在 `music/` 下按名反查；`sfx/<group>/<name>` 在 `music/` 与 `voice*` 以外按名反查 |
| `fonts` | `TimWangZi/The-font-of-Arknights@master` | `bender/regular`、`bender/light`、`novecento-wide/normal` 三个固定文件；主文件转 WOFF2，原文件作为 `fallback` |
| `gamedata` | `Kengxxiao/ArknightsGameData@master` | `gamedata/<path>` → `zh_CN/gamedata/<path>.json` |

## 路径表

上游路径不能由键按规则推出的键登记在适配器目录内的数据文件里，内容是键到仓库内相对路径的映射：

- `source/arknights-assets/paths.json`：界面图，命名空间 `battle/common`、`camp`、`prof/large`、`prof/card`、`rank/rarity`（含 `yellow/`）、`rank/elite`（含 `large/`）、`skill/empty`、`skill/empty_large`、`ui/autochess/*`、`ui/guide`、`ui/emoticon/*`、`season/act2autochess/{loading,entry,trap}`。
- `source/voice/paths.json`：`bgm/*`、`sfx/autochess/*`、`sfx/battle/*`、`sfx/ui/*`。

`parsePathTable` 校验每个键的语法与路径（相对、不含 `..`）；测试确认每个键都由来源表路由到该适配器。需求清单只有键，不带上游路径。

## 传输

`download/repo-cache.ts` 的 `GitRepoCache`：

- 启动时检查 `git --version`，低于 2.25（cone 模式 `sparse-checkout` 的最低版本）时报错退出。
- 每个「仓库@分支」首次使用时执行 `git clone --depth 1 --filter=blob:none --sparse --single-branch --branch <branch>`，先克隆到临时目录再改名为 `<cache>/repos/<owner>/<repo>@<branch>/`。`arknights-assets` 与 `voice` 是同一仓库的两个分支，各有一份。
- 文件列表来自 `git ls-tree -r -z --name-only HEAD`，不下载文件内容；`git rev-parse HEAD` 记为 `source.revision`。
- 一轮查找结束后，按仓库汇总命中文件，`download/sparse.ts` 算出最小的父目录集合（覆盖关系去重，根目录文件不计），第一次用 `git sparse-checkout set --cone`，之后用 `add`；已检出的目录保留，集合只增不减。目录名含 `*?[]\`（如 `[uc]battlecommon`）且 git 为 2.36 及以上时加 `--skip-checks`，git 在模式文件里自行转义。
- 克隆、`fetch`、检出失败时最多试 3 次，指数退避（400 ms 起，加抖动）；单个 git 进程默认 600 秒超时（`--timeout`）。`--proxy` 作为 `HTTPS_PROXY`、`HTTP_PROXY`、`ALL_PROXY`（及小写形式）传给 git；`GIT_TERMINAL_PROMPT=0`。
- `--refresh-index`：对已有克隆执行 `fetch --depth 1 --filter=blob:none origin <branch>` 与 `reset --hard FETCH_HEAD`。
- `--offline`：不克隆、不 fetch、不检出；没有克隆的来源不可用，未检出的文件按缺失报告。

测试用本地夹具目录模拟克隆工作区（`test/fixture.ts` 的 `DirectoryRepoCache`），不连网、不调用 git；`GitRepoCache` 用假的 `GitProcess` 测试参数、重试与版本检查。
