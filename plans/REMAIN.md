# 未完成事项

本文合并 plans/REMAIN.md 与 plans/DOCS.md 中仍未完成的事项，对照 2026-10-15 的代码核对后整理。已完成的条目已移除。对照对象为 master 0.2.6（提交 `488db49`）。

按依赖顺序分为七组，组内按步骤执行。

## 前置条件

- master 参考副本 `alliance/compat/upstream/repo/` 不在仓库中，需由用户放入。数据对拍、golden 样例、case-map 的 `render/**` 迁移、一致性对拍依赖它；未放入前只能做 next 内部检查。
- 服务端已重置：`alliance/server` 目前只含 `connection/` 与 0 字节的 `entry/main.ts`。服务端的协议实现、内容与对局层需要重建，见第一组。

## 一、服务端重建与协议闭环（P0）

服务端只剩连接层，协议的服务端部分与服务端内容一起重建。

1. 入口与构建：恢复 `alliance/server/entry/main.ts`（当前为空），`vite.config.ts:41` 的 ssr 入口依赖它。在此之前服务端无法启动。
2. 房间与对局：
   - 实现 `room.ownership` / `room.diy` 的分发与开局取值。数据来源仍是赛季 `backups.json`（见第二组）。
   - `docs/alliance/maintain/protocol/02-session.md:10` 称二者属重限流，但服务端的限流集合（`session.ts:47-53`）未包含它们，一并对齐。
3. 握手 `ext`：
   - welcome 下发 `seasonId`、`contentHash`、`protocol`（契约已有，`server-message.ts:28-34`）。
   - 客户端 hello 上报同样字段（`client/infra/boot/boot.ts:169-173` 尚未发送）。
4. 线路字段对齐（新发现）：
   - 客户端发送的 `b.progress.dp` 不在契约中，被静默忽略（`client/match/playback/bridge.ts:8-16`、`runner.ts:97-99`）。补进契约或删除发送。
   - `m.private.ops.cultivate` 契约为 string，C2S 与客户端为 number（`server-message.ts:342-346`、`message.ts:199-210`）。统一类型。
   - `docs/alliance/maintain/protocol/04-match.md:195-210` 的 `m.result` 字段（`playerId`、`eliminatedRound`、lineup 行列与装备）未进契约。
5. 原生战斗输入：客户端的 `b.start` 运行器已直接使用契约，但只有 upstream spec 转换器（`client/match/playback/upstream-bridge.ts`）。next 自己的 `BattleSpec` 构造待实现，联调新 server 时需要。
6. 设备单位：服务端尚未用 mission-core 的 `spawnUnit(kind: "device")` 生成箱子、炮台、风机。地图静态箱子与此一并定。
7. 赛季与内容包：
   - 先区分「资源包」（data 已读取，`alliance/data/runtime/packet/packet-store.ts:45-69`）与「服务端脚本赛季」。
   - 按设计建 `alliance/season/<id>/`（manifest、content、text、media）与加载器，同一 id 只允许一个提供者，加载失败时服务端不启动。
   - 加载器校验 `seasonId`、`contentHash`、`protocolVersion`。当前 `readSeasonPackets` 只解析、不校验版本。

## 二、数据包与联防（P0）

数据包用新编译输入重新生成，再与 master 的 `data/` 逐项核对，不直接复制。以下差异会让演算结果与 master 分歧，属于迁移（修引擎或重编译数据），不进兼容层。

1. 补位与自选编队：编译产出 `backups.json`（`units`、`tokens`、`diy.slots`），`chess.json` 增加 `backup` 字段。当前 DIY 有 8 个棋子，但包级 `diy.slots` 缺失。
2. 联防：
   - 联防关卡在 `waves.json`（`kind: "escaped"`），`config.unite.templates` 能解析，无悬空引用。
   - 待确认：联防在本回合战场进行、两名支援者分站左右半场的规则，在引擎与服务端中的实现位置（原 `_uniteOpts` 已不存在，只剩客户端 `field/stage.tsx:160-176` 使用 `GEO.UNITE_RECT`）。
   - 校验补漏：`alliance/data/compiler/validate.ts:272-293` 的 `validateAll` 未校验 `config.unite.templates`，`alliance/data/test/load.spec.ts:14-33` 只测缺文件。补校验与用例，防止联防悬空。
3. `config.json` 字段：`perPlayer` 不存在；`soloAssumed` 由编译器写入但无消费方。确定语义后接入或删除。
4. 0.2.1 规则（引擎与内容，逐条对照 master 黄金结果或用例）：
   - 满潜能数值：当前只有默认值 6（`contract/src/message.ts:185-193`）。
   - 突袭跳到队友半场、频次器物击打次数、召唤物天赋：未见实现。
   - 凋亡扣技力已实现（`mission-core/combat/element/index.ts:308-333`），不再列入。
5. 内容对拍：`bonds.json`、`choices.json`、`tokens.json`、`chess.json` 已由编译器生成且非空，与 master 的逐条差异待前置条件满足后核对。

## 三、兼容层与用例对照（P0）

兼容层的数据、战斗输入、战斗输出链已实现，剩余是语义检查、测试与用例迁移。

1. 语义边界检查：把 `validateClientResult` 的语义校验放进 `alliance/contract`。当前只有结构检查 `isBattleResult`（`contract/src/message.ts:155-176`）。客户端发送前（`client/match/playback/runner.ts:110-121`）与服务端收到时都调用。
2. 战斗转换补全（`compat/upstream/battle/`）：
   - 多玩家 `unitsEnd` 固定为空（`battle/result.ts:43-54`）。
   - 战斗 cost 固定为 10/1/99（`battle/spec.ts:461-466`），改为从数据视图推导。
3. 测试：
   - `alliance/compat/upstream/test/fixtures/` 只有资源 `assets.json`，需补 `buildBattleSpec` 的 master golden 样例，并断言映射后的 `BattleSpec` 字段完整。
   - `battle/result.test.ts:56-77` 只有单向转换，补往返测试。
4. 用例对照（case-map）：
   - `case-map/mapping.json` 的 `render/**` 仍是 pending，覆盖 705 条（inventory 共 6582 条）。按规则逐条改为 `rewritten` / `covered` / `not-migrated` / `moved`，完成时 `case-map` 无 pending。
   - 根目录补 `case-map` 脚本，或文档改为包内命令。
5. 用例枚举（DOCS 第 2 节）：`case-map/enumerate.ts:198-203` 写死根 vitest 入口，且只识别包根配置。根目录加 `vitest.config.ts` 的 `test.projects` 一次枚举全部包，使 `deployment/client/config/vitest.config.ts` 的用例可被枚举。
6. case-map 工具（DOCS 第 4 节）：
   - 文件 glob 改用 `picomatch`（当前手写在 `case-map/check.ts:120-139`，包未声明依赖）；`enumerate.ts:30` 的 `MASTER_TEST_FILE` 同步改用它。
   - 多条规则同时命中时在报告中列出，`docs/alliance/maintain/compat/02-case-map.md:34` 补说明（现只写先匹配优先）。
   - `mapping.test.ts:17-20`、`trace/rules.test.ts:58-61`、`case-map/root.test.ts:11-14` 的 JSON 改为 `import … with { type: 'json' }`。
   - `case-map/cli.ts:189-192` 的提交号只接受短号是长号的前缀。
7. `alliance/contract/package.json:13-19` 的 `"./*.js"` 通配导出改为显式导出 `match.js`、`message.js`、`server-message.js`、`catalog.js`。
8. 一致性对拍（质量指标，不作为连接条件）：在开发机用 master 的 sim 与 next 引擎对同一 spec 各跑一次，比较结果摘要，输出分歧清单。依赖前置条件。

## 四、文档工具链（DOCS 第 3、6 节与约定）

1. 文档示例类型检查（`docs/.vitepress/plugins/typecheck.ts`）：
   - 临时目录改到 `docs/.cache/`（当前在系统 tmp，`:390`），用正常的模块解析代替手工 symlink（`:286-321`）。
   - `tsc` 改用 `pnpm exec`（当前写死 `docs/node_modules/.bin/tsc`，`:348-355`）。
   - 根目录用 `findWorkspaceRoot`（当前按 `../..` 推算，`:36-37`）。
   - 修复异步定时回调的未处理 rejection（`:468-475`）。
2. `docs/.vitepress/config.ts:72-79` 的 `sectionTitle` 静默吞掉所有异常，改为报错或记录，避免掩盖 frontmatter 错误。
3. `docs/package.json` 增加 `check` 脚本（当前只有 `build`），把第 1 步的类型检查接入。
4. 示例检查：`docs/alliance/maintain/data/03-resource.md:226-229` 的 `loadResourceStore` 示例去掉 `check:skip`，需先给 `@alliance/client` 增加 `exports`（`alliance/client/package.json` 目前无）。
5. 逐页核对 `docs/mission-core/reference/` 与 `docs/mission-renderer/` 的架构页（systems 表在 `maintain/01-architecture.md:44-60`），确认后勾销 DOCS 第 6 节第二条。

## 五、引擎行为与文档（DOCS 第 7、8 节与延后项）

1. 黄金回放与源码扫描页（`docs/mission-core/maintain/03-testing.md`）：按主题分节（是什么、怎么跑、失败怎么看、怎么有意更新），概念、命令与维护规则分开；修正「`pnpm test` 含边界类型检查」的错误描述（实际只执行 `vitest run`，见 `mission-core/package.json:61-68`）。
2. 治疗攻击与孤立（结论冲突，需先裁定）：
   - 代码与测试（`mission-core/combat/target/aim.ts:87-100`、`mission-core/test/combat/damage/heal-through.spec.ts:237`）：治疗主目标忽略孤立，治疗链跳过孤立。
   - case-map（`alliance/compat/upstream/case-map/mapping.json` 中「#18 炎佑 holds 孤立」，状态 not-migrated）记载官方用例为「治疗者从不治疗孤立单位」。
   - 裁定后同步引擎、测试、`docs/mission-core/reference/05-world.md:157`（未提治疗主目标例外）与 case-map。
3. 倒下与离场（DOCS 第 8 节第一条）：代码已区分 `downed`（倒下，可再部署）与 `removed`（永久离场，播放死亡动画后淡出）。剩余：从提取器与官方数据（gamedata、prefab、动画控制器）找依据，确认命名；修正 `docs/mission-core/reference/06-damage.md:126`，它把普通倒下写成「离场」，易与 `removed` 混淆。
4. 推定规则找官方依据（DOCS 第 8 节第二条）：沼泽进入即触发（已实现并标为假定，`mission-core/field/terrain/official.ts:97-112`）；首领头顶条 0.16 格（`docs/mission-renderer/reference/06-actor.md:197-204`，标为假定）。
5. 第一批之后的官方地形（DOCS 第 8 节第四条）：特制水上平台、沙暴与土丘、草丛，以及 mound、turret、bush、waterPlatform、sealedFloor 的绘制。本赛季权重为 0，暂不做；启用前从 gamedata 与 PRTS 查清规则，放入官方地形模块。
6. 延后项（条件满足时再做）：
   - case-map 枚举改用真 `node:test`：替身与 hooks 仍在（`case-map/enumerate.ts:80-125`，`preload/node-test.ts`）。需要 master 副本验证，且要先确认 Node 22 的报告事件带完整名字。
   - 条件效果改为事件驱动：仍每拍轮询（`mission-core/ability/effect/condition.ts:36-68`），待剖析证明是热点。
   - 组件表密集数组存储：索引已用数组，实体值仍是 `Map`（`mission-core/kernel/world/component.ts:74-121`），待剖析数据支持。
   - 模组新增标签与阶段槽：标签已开放，阶段槽仍固定（`mission-core/contract/phase.ts:2-18`）。开放阶段槽前先给出设计。

## 六、资源与本机提取（P2）

1. 赛季媒体：创建 `alliance/season/<id>/media/`（非官方的赛季标志与入口图），键为 `image:season/<seasonId>/<name>`。`alliance/data` 打包时登记进赛季清单；当前无 `app-season`，只有派生动画的 `app-data`（`alliance/data/compiler/media/derive/anim-roles.ts:20`）。
2. 缺失登记（`report.json` 仍有 4 个 `needs.unexplained`）：
   - `TX_autochessi_D`、`TX_autochessi_common_D`、`TX_autochessi_BG` 已进入赛季需求（`compiler/media/need/season.ts:72-79`），需在 `compiler/input/base/absent.json` 登记「仅本机客户端可提供」的原因，重跑后归入 `absentUpstream`。
   - `audio:sfx/battle/p_atk_arrow_n` 在 `assets-extractor/source/voice/paths.json` 登记确定路径。
3. 本机客户端接入（`pnpm extract:local`，`assets-extractor/source/local-client/`）：
   - TS 适配器（`adapter.ts`）：只在传入 `--game` 时启用，`--python` 指定解释器，没有 `--game` 时不探测、不报错。当前 `extract.py` 会自动探测，需改。有命中时只跑 `--only` 需要的组，并补 `--manifest` 写盘（当前 `extract.py:657-663` 只在内存中构造）。
   - 映射表补全：mesh、prefab、enemy/token Spine 的路由为空或指向其他源（`source/table.ts:58-71`）。输出→键映射需带测试。
   - 恢复 `TOKEN_SPINES`、`export_token_spines`、`enemy_model_offsets.py`；把 `enemy_scales.py` 接入 `extract:local-report scales|offsets` 并写入 `report.json`（当前只是独立脚本 `report:enemy-scales`）。
   - 测试：`assets-extractor/test/extract.spec.ts` 有 12 个条件跳过（清单、网格组、webp 副本、棋盘材质等），清单写盘后改为读清单、取消缓存型跳过。没有 Python 时跳过，断言不放宽。
   - 接入后与 master 的输出逐项对照一次。
4. 冒烟：开发服务器上人工加载头像、Spine、音频、字体与棋盘。写成可复现步骤并记录结果（当前无脚本、无记录）。
5. 探索项（不急）：
   - 攻击时序：`alliance/data/compiler/packet/record/enemy.ts:531` 的 `DEFAULT_ATTACK_ANIM = null`，从官方 prefab 或动画控制器找攻击判定时间，不从 Spine 推导。改动会改变 `contentHash`，属于迁移。
   - 快照更新：`research/07-assets.json` 的生成脚本不在仓库中，之后只手工编辑；`arknights-assets`、`voice` 适配器的 `paths.json` 仍为固定快照。先确定更新方案。
   - fexli 的 `build` 姿势（`spine:char/<charId>/build`）无规则（`fexli/adapter.ts:19-31`，`test/sources.spec.ts:221`）。

## 七、部署（P2）

1. 目录结构：实际为 `deployment/{client/{config,image,script,vendor},server/{image,script}}` 与 `package.json`，`stack/`、`tool/`、`shells/` 不存在。确定是否需要后再改文档中的树。
2. 生产静态服务：
   - `deployment/client/config/static-policy.ts`（gzip、ETag、Range、缓存策略）尚无服务器使用，只被测试引用。
   - 缓存策略有偏差（新发现）：`static-policy.ts:218-223` 把 `/res/packs/` 下的所有文件都设为清单缓存，应只针对 `manifest.json`，数据包文件另定缓存。
   - master 的 `server/index.js` 与 `tools/vendor.mjs` 对应的迁移尚未实现（next 中不存在）。
3. 资源路由与发布：
   - 开发服务器已覆盖 `files`、`base`、`season`、`local` 路由（`alliance/client/vite-plugins.ts:139-168`），生产与 `mod` 路由未实现。
   - `/res/local/manifest.json` 缺失时返回 `emptyLocalManifest()`，开发服务和客户端已用（`vite-plugins.ts:190-220`，`client/infra/resource/store.ts:186-198`），生产未实现。
   - 发布脚本未实现：`alliance/data/.cache/derived/` 与 `.cache/assets/files/`（派生文件优先）只复制清单引用的文件到 `/res/files/`；`product/base/` 到 `/res/packs/base/<version>/`；`product/season/<id>/` 到 `/res/packs/season/<id>/<contentHash>/`。
4. 镜像与构建上下文：`client/image`、`server/image` 无 Dockerfile，仓库无根级 compose 与 `.dockerignore`。Docker 构建上下文需包含 `alliance/data` 与 `assets-catalog`，并先构建它们（`deployment/client/config` 依赖 `@alliance/data/pack-layout`）。
5. CI：`.github/workflows/test.yml` 目前只缓存 pnpm。增加 `alliance/data/.cache/assets`（含 `repos/`、`files/`、`ledger.json`）的缓存，使再次运行由账本复用。
6. 发行形态（完整包、精简包、更新包、`doctor`、`package`）暂不迁移。以后基于原始目录与包清单哈希实现，尽量复用 master 的形式。
7. 验收：浏览器能从静态站点读取资源并连接对局进程。依赖第一组的服务端重建。

## 待决事项

- 兼容层 `data/` 中数据视图与 packet 视图是否共用一个类型。
- 备用模型与别名染色（master `render/units.js` 的 `ALIAS_TINT`）是否保留。
- 服务端赛季的「资源包」与「脚本赛季」边界（第一组第 7 步）。
- 治疗与孤立的裁定（第五组第 2 步）。
