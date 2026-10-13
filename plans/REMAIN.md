- [协议与契约缺口（P0）](#协议与契约缺口p0)
- [数据包对齐（P0）](#数据包对齐p0)
- [兼容层 app/compat/upstream（P0）](#兼容层-appcompatupstreamp0)
  - [目录](#目录)
  - [转换链](#转换链)
  - [原则](#原则)
  - [测试](#测试)
- [app/server 遗留（P1）](#appserver-遗留p1)
  - [app 目录](#app-目录)
  - [赛季 app/season](#赛季-appseason)
  - [运行时数据与事件契约](#运行时数据与事件契约)
  - [战斗设备单位的生成](#战斗设备单位的生成)
  - [choice 战斗 fixture 的敌人等级](#choice-战斗-fixture-的敌人等级)
  - [注释中的旧路径](#注释中的旧路径)
- [资源（P2）](#资源p2)
  - [遗留](#遗留)
  - [本机客户端来源](#本机客户端来源)
  - [探索](#探索)
- [部署（P2）](#部署p2)
- [待决事项](#待决事项)

本文记录 app 侧还没完成的工作：服务端接口、数据包、兼容层、app/server、资源与部署，对照对象是 master 0.2.1。master 参考副本放在 `app/compat/upstream/repo/`，不入库，由用户放入。

## 协议与契约缺口（P0）

- `room.ownership { notOwned }`（0.2.0 的干员持有）与 `room.diy { picks }`（0.2.0 的自选编队）：next 的契约与分发都没有，客户端发送会被以 `BAD_MSG` 拒绝，补位与自选编队无法生效。在 next 实现：补契约与分发，并在开局时取值；数据来源是 `backups.json`。
- `g.watch.playerId`：master 可选，联防与首领双人场地用它指定观看的玩家；next 的契约没有此字段，分发只读 `fieldId`，双人场地无法指定观看对象。
- 握手 `ext`：`hello` 与 `welcome` 的 `ext`（字段见 ARCH.md）尚未实现，next 服务端还不下发 `seasonId`、`contentHash`。
- 未逐项比对的消息：`m.private`、`m.field`、`m.unitStats`、`b.start`、`b.pool`、`b.end` 的完整字段。`b.start` 的消费方（客户端战斗运行器）尚未迁移，无法联调。

## 数据包对齐（P0）

next 的数据包在 `app/data/product/season/act2autochess`。数据包用新的编译输入重新生成，再与 master 的 `data/` 逐项核对，不直接复制。下列差异不影响连接，但会让演算结果与 master 分歧；它们属于迁移（修引擎或重新编译数据），不进兼容层。

- 补位与自选编队：next 缺 `backups.json`（master 含 `units`、`tokens`、`diy.slots`），`chess.json` 缺 `backup` 字段（补位替身的数据）。
- 联防：master 的 `stages.json` 含 `act1autochess_escaped_single`、`act1autochess_escaped_multi`（`kind: unite`、`helpers`、`rows`），next 没有，而 `mode.unite.templates`、`waves.json`、`config.json` 仍引用这两条；next 的 `_uniteOpts` 使用回合关卡的 `stageId` 与 `GEO.UNITE_RECT`。按 0.2.1 的规则实现：联防在本回合战场上进行，两名支援者分站左右半场。
- `config.json`：master 有 `perPlayer`，next 有 `soloAssumed`，两个字段的含义需要确认。
- `bonds.json`、`choices.json`、`tokens.json`、`chess.json`：内容有差异（文件大小不同），重新生成后逐条核对。
- 0.2.1 的其余规则（未逐项核对）：突袭跳到队友半场的条件、满潜能数值、凋亡扣费、频次器物的击打次数、召唤物天赋，以及 0.2.0 有意不同于官方的调整。用 master 的黄金结果或用例逐条对照，在引擎或内容中修复。

## 兼容层 app/compat/upstream（P0）

兼容层是 app 与引擎之间的隔离层。app（client、server）只使用 app 的契约；引擎只使用引擎契约；master 的格式只出现在兼容层里。连接 upstream 后端时，next 客户端经过兼容层；连接 next 后端时直接使用 `app/contract` 的形状，不经兼容层，没有额外开销。数据视图、`battle/`、`result/`、`wire/` 未实现。

### 目录

```text
app/compat/upstream/
  data/             读取 master 的 /data/<file>.json，输出本仓库的数据视图
  battle/           master 的 b.start spec → mission-core 的 BattleSpec
  result/           mission-core 的 BattleResult → master 的 b.result（perPlayer 形状）
  wire/             仅在线路字段不一致时存在（当前：g.watch.playerId）
  test/             golden 样例与往返测试
```

master 出新版或出现其他第三方 fork 时，在 `app/compat/` 下增加与 `upstream/` 同级的目录来适配。

### 转换链

1. 数据链：master 的 `<base>/data/<file>.json`（地址由后端基址拼出）→ 数据视图（packet 视图）。
2. 战斗输入链：`b.start` 中的 master spec → mission-core `BattleSpec`。`tiles`、`cost`、`modules` 不在 master 的 spec 里，由数据视图推导，所以数据链是战斗输入链的前提。
3. 战斗输出链：mission-core `BattleResult` → `b.result`（master 的 `perPlayer` 形状），先通过 `app/contract` 中的语义边界检查再发送。
4. 线路链：只处理字段不一致的情况。当前只有 `g.watch.playerId`：app 的意图是“观看某一玩家”，线路上填入 `playerId`。

### 原则

- 连接 upstream 后端时，战斗由 next 引擎演算，输入与输出经兼容层转换。master 服务端默认只做语义边界检查（`SP_VERIFY=off`），不复算，因此 next 引擎与 master 的局部不一致会被接受。一致性作为质量指标，不作为连接的前提。
- 能用映射解决的进兼容层：形状、字段名、地址、线路字段。会改变演算结果的进迁移（上节的数据包对齐与引擎修复）。兼容层不掩盖规则差异，也不保证演算结果一致。
- 语义边界检查（对应 master 的 `validateClientResult`，`server/match/fields.js:748`）放在 `app/contract`，不放在兼容层：next 客户端发送前的预检与 next 服务端的校验使用同一套规则，兼容层只负责形状转换。
- 兼容层只引用引擎的公开契约与 `app/contract`，不引用 `app/client` 的界面代码，也不引用 `app/server` 的房间与对局代码。
- 第一阶段兼容层写成代码，由 app 的 client 直接调用。

### 测试

- golden 样例：在 master 侧按固定种子生成 `buildBattleSpec` 的输出，作为 `test/fixtures/` 的输入，断言映射后的 `BattleSpec` 字段完整。
- 往返测试：`BattleResult` 样例转成 `perPlayer` 形状后，必须通过 `app/contract` 的边界检查。
- 用例对照表的 `render/**`：现在是一条 `pending` 规则，覆盖 705 条 master 用例，改为逐条条目。只喂快照与事件的在 `mission-renderer/test` 改写，标 `rewritten` 或 `covered` 并写 `next` 引用；依赖 Pixi 显示对象的标 `not-migrated` 并写原因；属于休整棋盘等 app 范围的标 `moved`。完成时 `pnpm case-map` 通过且没有 `pending`。
- 一致性对拍（质量指标，不作为连接条件）：在开发机上，用 master 的 sim 与 next 引擎对同一 spec 各跑一次，比较结果摘要，输出分歧清单。

## app/server 遗留（P1）

### app 目录

主应用是卫戍协议这一款模式：房间、经济、商店、波次、联防、首领战、结算、干员与敌人的内容，以及浏览器里的界面。集成战略、保全派驻若要做，是以后并列的另一个应用，复用作战核心、作战画面和资源目录，自己再写一份资源构建器，不带走这份内容。

```text
app/
  contract/         两端共用的契约，相当于原来的 shared
    message/        线路消息
    match/          阶段、难度、赛季、座位、棋盘几何、站位
  server/
    entry/
    connection/
    room/
    match/
    content/
    test/
  client/
  compat/
    upstream/       连接 upstream 后端时的边界兼容
  season/
  scenario/
```

- `contract` 是原来的 `shared`：两端都要遵守的消息和纯事实，没有连接，也没有画面依赖。当前实现在 `app/contract/src/{match,message}.ts`，`message/`、`match/` 子目录尚未拆分。
- `app/season` 尚未创建。

### 赛季 app/season

卫戍协议按赛季更换干员、地图，以及装备、盟约、敌人这些其余内容。一个赛季是一份封闭内容。上半是 `act1autochess`，下半是 `act2autochess`。难度留在该赛季的模式配置里：绝境、终极是下半的模式。

赛季目录与 `server/`、`client/` 同级，浏览器按赛季取数据包、文案和媒体。作战核心只接收 `BattleSpec`，不读取赛季 id。

```text
season/
  act1autochess/
  act2autochess/
```

每个赛季：

```text
act2autochess/
  manifest.ts       赛季 id、内容版本、本季启用的共用脚本
  content/          本季独有的脚本。没有则不建
  text/             本季文案。没有则不建
  media/            赛季标志与入口图。没有则不建
```

`content/` 里面的一个条目和 `server/content` 相同：

```text
(id)/
  manifest.ts
  battle/           没有战斗效果则不建
  match/            没有休整期效果则不建
```

- 两个赛季机制相同的干员套件留在 `server/content`，两边的数据包各写各的属性。只有这一季出现的盟约、装备、首领，脚本放在该赛季的 `content/`。同一个 id 在新赛季换了机制，新赛季在自己的 `content/` 里声明由它提供这个 id。一个赛季里同一个 id 只有一个提供者，加载器发现两个就拒绝这个赛季。
- `manifest.ts` 列出本季启用的 `server/content` 条目。加载器为一局安装这些共用脚本，加上 `season/<id>/content`。数据包里没有的 id 不装进这一局。赛季加载失败时服务端不启动。
- `text/` 按语言一个文件。官方表里的名字和描述由编译器写入数据包，这里放数据包没有覆盖、这一季才用的句子。`media/` 只放赛季标志和入口图；干员骨骼和地图模型按资源键领取。

### 运行时数据与事件契约

- 内容包身份（`seasonId`、`contentHash`、`protocolVersion`）尚未实现。`entry/packet.ts` 只按文件名加载，不校验版本。
- `field`、`wave`、`reinforcement`、`flow` 读取事件结果中尚未声明的 `leaked`、`killed`、`total`。
- `agent` 的目标可以为空，需要结合 AI 选择策略确认行为。
- 这些不是局部类型修复，不能通过补几个字段绕过事件和内容端口的设计。

### 战斗设备单位的生成

`content/device/battle/index.ts` 的箱子、炮台、风机调用 `battle.spawnDevice(key, x, y, stats)`。mission-core 不提供这个方法，设备用 `spawnUnit` 生成 `kind: "device"` 的单位，服务端还没有改用它，因此今天的战斗不会产生设备单位。开战时由战斗快照的设备单位接管地图的静态箱子，这一项和地图箱子的处理一起定。

### choice 战斗 fixture 的敌人等级

`content/choice/battle.test.ts` 的敌人等级写在 `UnitSpec.script.rank`，但 `battleFacade` 的单位代理从 roster 与 `getChess()` 读取 `def.rank`。需要明确等级事实来源：

- `UnitSpec.script.rank` 是否是测试与内容端的唯一来源；
- 代理是否必须把它映射到 `def.rank`；
- 或者等级进入新的内容端口或单位注册契约。

在等级字段契约明确前，不修改内容逻辑或引擎代理。

### 注释中的旧路径

`content/token/test/summons.spec.ts`、`match/flow/index.ts`、`match/board/index.ts`、`match/test/sim-client.ts` 仍有 `public/js/` 的路径引用。按 AGENTS.md，注释只写当前代码在做什么，这些引用需要改写。

## 资源（P2）

### 遗留

- 赛季媒体接线：非官方的赛季标志与入口图放在 `app/season/<seasonId>/media/`，键为 `image:season/<seasonId>/<name>`，`<seasonId>` 后只有一段；带 `loading/`、`entry/`、`trap/` 分组的键来自提取器的路径表，不受影响。`app/data` 打包时把这些文件登记进赛季清单，原始目录条目的 `source.id` 为 `app-season`（派生文件现在用 `app-data`）。目录与代码都未建。
- 冒烟：开发服务器按键加载头像、Spine、音频、字体与棋盘的人工冒烟未逐项做。
- 未解释的缺失（`report.json` 的 `needs.unexplained`，共 4 个）：
  - `texture:map/autochess/TX_autochessi_D`、`TX_autochessi_common_D`、`TX_autochessi_BG`：只有本机客户端能提供。给赛季需求的这三个键写上 `absent` 原因（本机客户端独有），使它们归入 `absentUpstream`；`compiler/input/base/absent.json` 目前只覆盖基础需求。
  - `audio:sfx/battle/p_atk_arrow_n`：`voice` 分支中同名多候选，按名反查视为未命中。在 `assets-extractor/source/voice/paths.json` 登记确定的路径。

### 本机客户端来源

`assets-extractor/source/local-client/python/extract.py`（UnityPy，由 master 的 `tools/local-extract/` 改写）只能由 `pnpm extract:local` 单独运行，不接入 `pnpm extract`。棋盘贴图（含派生的法线与粗糙度）、`json:material/*`、`model:mesh/*`、`json:prefab/*`、社区缺失的敌人与召唤物 Spine 只有它能提供；没有它时棋盘 tiles 不生成，渲染器隐藏三维地形。接入需要本机游戏客户端验证：

- TS 适配器 `source/local-client/`：只在传入 `--game <dir>` 时启用，排在同命名空间的最前面；`--python <path>` 指定解释器，默认 `python3`；没有 `--game` 时不探测、不报错。`prepare` 运行 `extract.py --print-jobs` 声明 `covers`；有命中时运行 `extract.py --game <dir> --out <cache>/sources/local-client/files --manifest <cache>/sources/local-client/manifest.json`，只跑需要的 `--only` 组。
- 输出路径到键的映射表（TS 数据，带测试）：`spine/enemy/<id>/` → `spine:enemy/<id>`；`spine/token/<id>/` → `spine:token/<id>/front`；`map/<theme>/<name>.png` → `texture:map/<theme>/<name>`（webp 副本是同一条目的另一格式，派生图 `_rgb`、`_rough` 是独立的键）；`map/<theme>/materials.json` → `json:material/<theme>`；`mesh/<bundle>/<mesh>.obj` → `model:mesh/<bundle>/<mesh>`；`mesh/<bundle>/prefab.json` → `json:prefab/<bundle>`；界面、表情、引导 Sprite → 对应的 `image:` 键。之后与其他来源共用哈希、`files/`、`SpineMeta` 与原始目录，`source.id` 为 `local-client`，`source.revision` 为客户端资源版本。
- 从 master 恢复：`TOKEN_SPINES` 与 `export_token_spines`（社区缺失的召唤物 Spine，取 Front 渲染器）；清单写盘（`--manifest`，`--only` 时按组合并）；`enemy_model_offsets.py`。它与 `enemy_scales.py` 作为诊断命令 `extract:local-report scales|offsets`，结果写进 `report.json`，不进原始目录。
- 测试：`assets-extractor/test/extract.spec.ts` 中依赖脚本清单的 5 个用例（清单、网格组、webp 副本、棋盘材质）现在跳过，清单写盘恢复后改读清单；没有 Python 时跳过，断言不放宽。接入后与 master 的输出逐项对照一次。

### 探索

- 攻击时序的官方来源：master 的 `enemies.json` 有 `attackAnim`，next 写显式默认值 `null`。在官方 prefab、动画控制器或 gamedata 中找攻击判定时间，替换 `DEFAULT_ATTACK_ANIM`（`null`，`mission-core` 无动画片段时停顿 0.35 秒）。不从 Spine 的 Attack 时长与 OnAttack 事件推导。写入数据包会改变 `contentHash` 与演算结果，属于迁移，不进兼容层。
- fexli 的 `build` 姿势：`spine:char/<charId>/build` 是登记过的姿势，`fexli` 适配器没有对应规则。
- 快照更新：`app/data/compiler/input/research/07-assets.json`（2026-09-27 由工具从上游 git 树生成，生成脚本不在仓库中，之后只手工编辑）与 `arknights-assets`、`voice` 适配器的 `paths.json` 都是固定快照，官方新增的干员、道具、羁绊、界面与音效不会被自动发现。等 07 的更新方案确定后再处理。

## 部署（P2）

目录结构：`deployment/server/{image,stack,script}`、`deployment/client/{image,config,script,vendor}`、`deployment/tool`。当前已有 `deployment/server/{image,script}` 与 `deployment/client/{image,script,vendor}`。

master 来源：`server/index.js` 的静态文件、gzip、ETag、Range 归入 `deployment/client/config`；`tools/vendor.mjs`、`scripts/`、`Dockerfile` 归入 `deployment`，镜像拆成 `client/image` 与 `server/image`。

`deployment/server` 负责：

- 对局进程镜像，不包含媒体字节；
- 启动配置指定的赛季包，镜像内、挂载卷或独立存储均可。

`deployment/client` 负责：

- 前端构建产物与 vendor；
- 赛季 JSON、资源清单与媒体文件的静态发布。

资源发布：

地址由 `assets-catalog` 的地址模块计算，所有种类同一格式，不保留 master 的 `/media/` 无扩展名音频路由。生产发布未实现。

```text
/                                     前端应用，Vite 构建产物（脚本在 /assets/）
/res/files/<address>?v=<hash 前 12 位>
/res/packs/base/<version>/manifest.json 与 fonts.css
/res/packs/season/<seasonId>/<contentHash>/manifest.json 与数据包 *.json
/res/packs/mod/<modId>/<version>/manifest.json
/res/local/manifest.json              本地覆盖清单
```

- 发布脚本：`app/data/.cache/derived/` 与 `app/data/.cache/assets/files/`（同一地址时派生文件优先）复制到 `/res/files/`，只复制清单引用到的文件；`app/data/product/base/` 复制到 `/res/packs/base/<version>/`，`product/season/<id>/` 复制到 `/res/packs/season/<id>/<contentHash>/`。清单的 `fileRoot` 相对清单地址，所以 `/res/` 可以整体放到另一个域名。
- 生产静态服务：gzip、ETag、Range 与缓存头按 `deployment/client/config/static-policy.ts`（策略函数已有，尚无服务器使用它）：`/res/` 下带 `?v=` 的文件 `immutable`，`/res/files/` 其余文件长缓存，`/res/packs/` 的清单短缓存加 ETag，`/res/local/` 与页面不缓存。`/res/local/manifest.json` 缺失时返回 `emptyLocalManifest()` 的空清单。
- vendor 与前端构建产物的发布。
- 镜像与工具：Docker 镜像（`client/image`、`server/image`），根目录初始化脚本与 `deployment/tool` 的统一命令（初始化、检查、资源总命令）。`client/image` 的 Docker 构建上下文必须包含 `app/data` 与 `assets-catalog`，并先构建它们，因为 `deployment/client/config` 依赖 `@alliance/data/pack-layout`。
- CI：缓存整个提取缓存目录 `app/data/.cache/assets`（含 `repos/` 浅克隆、`files/`、`ledger.json`），再次运行由账本复用。

0.2.x 的发行形态暂不迁移：master 有完整包、精简包（首次启动从公开镜像下载素材）、更新包（只含改动文件，依 `MANIFEST.json` 校验并删除旧文件）、`npm run doctor` 文件校验与 `npm run package`。以后尽量复用 master 的形式，基于原始目录与包清单的哈希实现。

验收：

- 浏览器能从静态站点读取资源，并连接对局进程。

## 待决事项

- 兼容层 `data/` 中，数据视图与 packet 视图是否共用一个类型，还是各自独立。
- 备用模型与别名染色（master `render/units.js` 的 `ALIAS_TINT`：本机客户端独有的敌人模型在网页端用替代模型并朝该敌人的颜色染色）是否保留。
