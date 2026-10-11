- [状态概览](#状态概览)
- [1. 服务端接口兼容性（P0）](#1-服务端接口兼容性p0)
    - [已核对一致](#已核对一致)
    - [不一致](#不一致)
    - [数据包](#数据包)
    - [行为层（未逐项核对）](#行为层未逐项核对)
    - [已决定](#已决定)
- [2. 兼容层 app/compat/upstream（P0，专门章节）](#2-兼容层-appcompatupstreamp0专门章节)
    - [目录与职责](#目录与职责)
    - [边界检查放在哪里](#边界检查放在哪里)
    - [依赖方向](#依赖方向)
    - [转换链](#转换链)
    - [分类原则](#分类原则)
    - [已知不一致清单](#已知不一致清单)
    - [不做什么](#不做什么)
    - [与模组的关系](#与模组的关系)
    - [测试](#测试)
- [3. 版本标记与数据来源（P0）](#3-版本标记与数据来源p0)
    - [next 的版本标记](#next-的版本标记)
    - [赛季与数据地址](#赛季与数据地址)
    - [判定后端类型](#判定后端类型)
    - [回落的两种数据来源](#回落的两种数据来源)
    - [能力标记](#能力标记)
- [4. app/client（P1，未迁移）](#4-appclientp1未迁移)
- [5. app/server（P1）](#5-appserverp1)
    - [app 目录](#app-目录)
    - [赛季 app/season](#赛季-appseason)
    - [当前测试状态](#当前测试状态)
    - [运行时数据边界](#运行时数据边界)
    - [对局字段和事件契约](#对局字段和事件契约)
    - [战斗设备单位的生成](#战斗设备单位的生成)
    - [choice 战斗 fixture 的敌人等级](#choice-战斗-fixture-的敌人等级)
    - [注释中的旧路径](#注释中的旧路径)
- [6. 作战核心 mission-core（P1）](#6-作战核心-mission-corep1)
- [7. 作战画面 mission-renderer（P1）](#7-作战画面-mission-rendererp1)
    - [未迁移：三维地面（board3d）](#未迁移三维地面board3d)
    - [有意与 master 不同（待确认）](#有意与-master-不同待确认)
- [8. 资源 assets-catalog、assets-extractor 与 app/data（P2）](#8-资源-assets-catalogassets-extractor-与-appdatap2)
    - [遗留](#遗留)
    - [本机客户端来源](#本机客户端来源)
    - [探索](#探索)
- [9. 部署 deployment（P2）](#9-部署-deploymentp2)
- [10. 待确认的决定](#10-待确认的决定)

本文合并原来的作战核心、作战画面、app/server、资源四份剩余清单，并记录 2026-10-08 对照 master 0.2.1 的服务端接口核对结果（master 参考副本放在 `app/compat/upstream/repo/`，不入库，由用户放入），以及此后确定的连接 upstream 后端的路线。app/client 的迁移见 [MIGRATE.md](MIGRATE.md)，其他各域的目录设计在本文对应章节；需求见 [FEATURE.md](FEATURE.md)，架构方向见 [ARCH.md](ARCH.md)。本文只记录还没完成的工作。作战核心与作战画面的 ECS 化、master 0.2.2 与 0.2.3 新逻辑的接入见 [ECS.md](ECS.md)。资源的现状见 [资源从哪里来](../docs/alliance/data/03-resource.md)，资源的剩余工作在第 8 节，资源发布在第 9 节。

## 状态概览

| 域 | 状态 | 优先级 |
|---|---|---|
| 服务端接口与 master 0.2.1 | 不兼容，见第 1 节 | P0 |
| 兼容层 `app/compat/upstream` | 资源映射 `data/asset/` 已完成；数据视图、`battle/`、`result/`、`wire/` 未实现，见第 2 节 | P0 |
| 版本标记与数据来源 | 判定与回落规则已定，未实现，见第 3 节 | P0 |
| app/client | 未迁移，见 [MIGRATE.md](MIGRATE.md) | P1 |
| app/server | 已接入新契约；内容端口、事件契约、设备单位未收口 | P1 |
| 作战核心 mission-core | 机制已有测试；ECS 化、事件与结果契约见 [ECS.md](ECS.md) | P1 |
| 作战画面 mission-renderer | 三维地面完成；单位、特效、Spine 见 [ECS.md](ECS.md) | P1 |
| 资源 assets-catalog、assets-extractor 与 app/data | 流水线与客户端加载已完成；赛季媒体接线、本机客户端来源与探索项见第 8 节 | P2 |
| 部署 deployment | 静态站点、镜像、整合包未完成 | P2 |

## 1. 服务端接口兼容性（P0）

结论：next 的服务端目前不能直接服务 master 0.2.1 的客户端。传输层和大部分消息一致，但 0.2.0 新增的补位、自选编队相关消息缺失，数据包也没有跟上 0.2.1。master 客户端连接 next 服务端不作要求；要求的是 next 客户端能连接 master 服务端，见第 2、3 节。

### 已核对一致

- 路径：WebSocket 为 `/ws`；`/healthz` 的 `version`、`app`、`uptimeSec`、`build`、`sockets`、`sessions` 一致，房间与对局计数的字段名未逐项核对；其余路径返回 404，静态文件交给 `deployment/client`。
- 消息：客户端消息键（除下表两项外）、服务端消息类型、`room.state` 与 `m.public` 的顶层字段一致。
- 常量：`PROTOCOL_VERSION`（两边都是 1）、`MAX_SEATS`、`MAX_SPECTATORS`、`DIFFICULTIES`、`ERR` 错误码、36 条表情、`EV` 事件名一致。
- 战斗结果消息 `b.progress`、`b.result` 的结构校验一致。

### 不一致

| 项 | master 0.2.1 | next | 影响 |
|---|---|---|---|
| `room.ownership { notOwned }` | 有，0.2.0 的干员持有 | 契约与分发都没有 | 客户端发送会被以 `BAD_MSG` 拒绝，补位无法生效 |
| `room.diy { picks }` | 有，0.2.0 的自选编队 | 同上 | 自选编队无法保存，也不会在开局生效 |
| `g.watch.playerId` | 可选，联防与首领双人场地指定观看的玩家 | 契约没有此字段，分发只读 `fieldId` | 双人场地无法指定观看对象 |
| 版本号 | `APP_VERSION` 为 0.2.1 | `package.json` 为 0.1.3 | `/healthz` 的 `app` 字段与 master 不同 |

### 数据包

next 的数据包在 `app/data/product/season/act2autochess`，与 master 的 `data/` 逐文件比较：

| 文件 | 差异 | 影响 |
|---|---|---|
| `backups.json` | next 缺失。master 含 `units`、`tokens`、`diy.slots` | 补位与自选编队没有数据来源 |
| `stages.json` | master 含 `act1autochess_escaped_single`、`act1autochess_escaped_multi`（`kind: unite`、`helpers`、`rows`），next 没有 | `mode.unite.templates`、`waves.json`、`config.json` 仍引用这两条 |
| `enemies.json` | master 多 `modelScaleY`、`mirrorX`；`attackAnim` 两边都有，next 写显式默认值 `null` | `attackAnim` 的官方来源见第 8 节「探索」；`modelScaleY`、`mirrorX` 见 [ECS.md](ECS.md) |
| `chess.json` | master 多 `backup` 字段 | 补位替身的数据缺失 |
| `config.json` | master 有 `perPlayer`，next 有 `soloAssumed` | 两个字段的含义需要确认 |
| `assets.json`、`resources.json` | master 有，next 不生成 | next 的资源在基础包与赛季包清单中，见 [资源从哪里来](../docs/alliance/data/03-resource.md)；连接 master 时由兼容层读取 master 的 `assets.json` |
| `bonds.json`、`choices.json`、`tokens.json`、`chess.json` | 内容有差异（文件大小不同） | 未逐条核对 |
| `bands.json`、`bosses.json`、`effects.json`、`emotes.json`、`factions.json`、`garrisons.json`、`items.json`、`tuning.json`、`waves.json` | 与 master 字节一致 | 无 |

### 行为层（未逐项核对）

- 0.2.1 的规则：联防在本回合战场上进行、两名支援者分站左右半场、突袭跳到队友半场的条件、满潜能数值、凋亡扣费、频次器物的击打次数、召唤物天赋。需要用 master 的黄金结果或用例逐条对照。
- 联防场地：next 的 `_uniteOpts` 使用回合关卡的 `stageId` 与 `GEO.UNITE_RECT`，没有读取 `act1autochess_escaped_*`。与 0.2.1 不一致，按下面“已决定”第 3 条修改。
- `m.private`、`m.field`、`m.unitStats`、`b.start`、`b.pool`、`b.end` 的完整字段未逐项比对。`b.start` 的消费方（客户端战斗运行器）尚未迁移，无法联调。
- 已知与 master 不一致的完整清单见第 2 节。

### 已决定

1. 补位与自选编队在 next 实现：补契约、分发、`backups.json` 数据包，并在开局时取值。
2. 数据包用新的编译输入重新生成，再与 master 的 `data/` 逐项核对，不直接复制。
3. 联防按 0.2.1 的规则实现：在本回合战场上进行，两名支援者分站左右半场。
4. `PROTOCOL_VERSION` 保持 1，与 master 一致。
5. 连接 upstream 后端时，战斗由 next 引擎演算，输入与输出经兼容层转换。master 服务端默认只做语义边界检查（`SP_VERIFY=off`），不复算，因此 next 引擎与 master 的局部不一致会被接受。一致性作为质量指标，不作为连接的前提。
6. 连接 upstream 后端时，数据由兼容层从 master 的 `/data/<file>.json` 读取，地址由后端基址拼出。资源（master 的 `assets.json`）见 [连接 master 后端](../docs/alliance/compat/index.md)。
7. `backups.json`、`attackAnim`（next 写显式默认值 `null`）等规则数据是后续迁移项，但属于兼容前置：不影响连接，会让演算结果与 master 分歧。它们按第 2 节的分类归入迁移，不放进兼容层。

## 2. 兼容层 app/compat/upstream（P0，专门章节）

兼容层是 app 与引擎之间的隔离层。app（client、server）只使用 app 的契约；引擎（mission-core、mission-renderer）只使用引擎契约；master 的格式只出现在兼容层里。连接 upstream 后端时，next 客户端经过兼容层；连接 next 后端时不经过兼容层，直接使用 `app/contract` 的形状，兼容层不产生额外开销。

### 目录与职责

```text
app/compat/upstream/
  data/             读取 master 的 /data/<file>.json，输出本仓库的数据视图；资源映射在 data/asset/（已实现）
  battle/           master 的 b.start spec → mission-core 的 BattleSpec
  result/           mission-core 的 BattleResult → master 的 b.result（perPlayer 形状）
  wire/             仅在线路字段不一致时存在（当前：g.watch.playerId）
  test/             golden 样例与往返测试
```

master 出新版或出现其他第三方 fork 时，在 `app/compat/` 下增加与 `upstream/` 同级的目录来适配。

- `data/` 是唯一允许出现 master 地址解析（`/assets/...` 等）的位置。master 地址到资源键的映射与 upstream 清单见 [连接 master 后端](../docs/alliance/compat/index.md)；client、renderer、audio 的其他目录不得依赖地址解析。
- `battle/` 需要的 `tiles`、`cost`、`modules` 不在 master 的 spec 里，要由 `data/` 的数据视图推导。所以 `data/` 是 `battle/` 的前提。
- `result/` 生成的 `b.result` 必须先通过 `app/contract` 中的语义边界检查，才能发送。

### 边界检查放在哪里

语义边界检查（对应 master 的 `validateClientResult`，`server/match/fields.js:748`）不放在兼容层，而是放在 `app/contract`。原因是 next 客户端发送前的预检与 next 服务端的校验都要使用同一套规则，兼容层只负责形状转换。

### 依赖方向

- 引擎（`mission-core`、`mission-renderer`）不引用 `app/compat`，也不引用 `app/client`、`app/server`。
- 兼容层只引用引擎的公开契约与 `app/contract`，不引用 `app/client` 的界面代码，也不引用 `app/server` 的房间与对局代码。
- `app/client` 的 `playback/` 与 `connection/` 通过兼容层收发战斗与数据。
- `app/server` 不需要 master 兼容层，因为 master 客户端连接 next 服务端不作要求。

### 转换链

1. 数据链：master 的 `/data/<file>.json` → 数据视图（packet 视图）。URL 由后端基址拼出，例如 `<base>/data/<file>.json`。资源链（`assets.json` → upstream 清单）已实现，见 [连接 master 后端](../docs/alliance/compat/index.md)。
2. 战斗输入链：`b.start` 中的 master spec → mission-core `BattleSpec`。
3. 战斗输出链：mission-core `BattleResult` → `b.result`（master 的 `perPlayer` 形状），通过边界检查后发送。
4. 线路链：只处理字段不一致的情况。当前只有 `g.watch.playerId`：app 的意图是“观看某一玩家”，线路上填入 `playerId`。

### 分类原则

- 能用映射解决的进兼容层：形状、字段名、地址、线路字段。
- 会改变演算结果的进迁移，即修引擎或重新编译数据，不进兼容层：`attackAnim`、`backups.json`、联防地图、满潜能、0.2.1 的规则调整。兼容层不掩盖规则差异。

### 已知不一致清单

| 项 | 类型 | 处理 | 说明 |
|---|---|---|---|
| master `assets.json` 与资源键 | 数据形式 | 兼容（`data/asset/`，已实现） | 映射不到的地址进入问题列表，见 [连接 master 后端](../docs/alliance/compat/index.md#不映射的地址) |
| `b.start` spec 与 mission-core `BattleSpec` | 形状 | 兼容（`battle/`） | `tiles`、`cost`、`modules` 从数据推导 |
| `b.result` 与 `perPlayer` | 形状 | 兼容（`result/`） | 与 `BattleResult` 的边界仍需定，见第 5 节 |
| `g.watch.playerId` | 线路 | 兼容（`wire/`） | 当前缺失，见第 1 节 |
| `attackAnim`、`backups.json`、`stages.json` 中的联防地图与 `kind`、`helpers`、`chess.backup` | 规则数据 | 迁移（重新编译） | 会导致演算分歧，兼容前置；`attackAnim` 的官方来源见第 8 节「探索」 |
| 满潜能、0.2.0 有意不同于官方的调整、0.2.1 的联防规则 | 规则 | 引擎或内容修复 | 不进兼容层 |
| `room.ownership`、`room.diy` | 线路缺失 | next 服务端实现 | 见第 1 节 |

### 不做什么

- 兼容层不保证演算结果一致。分歧通过一致性指标和本清单管理。
- 兼容层不替代边界检查，边界规则在 `app/contract`。
- 引擎目录不为 master 增加字段。确有通用机制需要时，按引擎自己的契约扩展。

### 与模组的关系

- 第一阶段：兼容层写成 `app/compat/upstream` 下的代码，由 app 的 client 直接调用。
- 长期方向：master 规划的 `data`、`assets` 包类型落地后，`data/` 中与数据、资源相关的映射可以迁成内容包，但只覆盖数据和资源。
- `battle/` 与 `result/` 仍是代码。模组不能替换引擎的演算，也不能改变边界检查的判定。
- 依据：master 的 `packs/README.md` 写明，目前只加载 `lang` 类型，`assets`、`data` 类型只是规划，且 `data` 类型计划在启动时读取一次。

### 测试

- golden 样例：在 master 侧按固定种子生成 `buildBattleSpec` 的输出，作为 `test/fixtures/` 的输入，断言映射后的 `BattleSpec` 字段完整。
- 往返测试：`BattleResult` 样例转成 `perPlayer` 形状后，必须通过 `app/contract` 的边界检查。
- 一致性对拍（质量指标，不作为连接条件）：在开发机上，用 master 的 sim 与 next 引擎对同一 spec 各跑一次，比较结果摘要，输出分歧清单，并把分歧写入上面的已知不一致清单。

## 3. 版本标记与数据来源（P0）

### next 的版本标记

- `APP_VERSION` 来自 `package.json`，当前为 0.1.3。版本号策略需要确定，并与 master 的 0.2.1 区分。
- `PROTOCOL_VERSION` 保持 1，与 master 一致。协议版本不用于判断功能是否可用。
- `/healthz` 的 `app` 字段返回 next 的版本，两边都有这个字段。

### 赛季与数据地址

- next 后端在 `welcome` 中下发 `seasonId`、`contentHash` 与数据基址。这些字段是 next 后端新增的，当前 `welcome` 还没有。
- 下发地址后，客户端从该地址取数据并校验，不自行选择赛季。
- 新内容发布不改变已创建房间的 `contentHash`。

### 判定后端类型

判定依据是字段与版本，不是握手是否失败。master 对 `hello` 会正常回 `welcome`，只是没有赛季字段，因此“握手失败”不能用来判断后端类型。

1. `welcome` 含赛季字段：next 后端。按下发地址取数据，不经兼容层。
2. `welcome` 不含赛季字段：视为旧后端。再看 `/healthz` 的 `app` 版本，低于门槛时确认为 upstream 后端，然后进入回落。

门槛版本号由第 1 节确定 next 版本策略后再定。

### 回落的两种数据来源

由客户端配置选择，默认对 upstream 后端使用 (a)。

- (a) 后端基址下的 `/data/<file>.json`，经兼容层读取。这是 upstream 后端的权威数据。
- (b) 客户端配置的固定赛季包地址，指向 next 发布的 packet，不经兼容层。使用 (b) 时，规则数据可能与 upstream 后端不同，分歧要记入第 2 节的清单。

资源在 (a) 下由兼容层生成 upstream 清单（可选把 next 基础包放在其下作回退），在 (b) 下直接加载 next 的基础包与赛季包，见 [连接 master 后端](../docs/alliance/compat/index.md#图层顺序)。

### 能力标记

- 不用 `PROTOCOL_VERSION` 区分能力，因为两边都是 1，无法识别 `room.diy` 之类的缺口。
- 连接后由 `app` 版本与 `welcome` 字段得出能力集，例如自选编队是否可用。
- 不支持的功能隐藏入口，不报错。

## 4. app/client（P1，未迁移）

迁移指南见 [MIGRATE.md](MIGRATE.md)，包括 master 源码对照、0.2.x 功能清单、测试迁移与验收。客户端依赖的其他域工作见第 1、2、3、5、6、7、8、9 节；资源的加载见 [资源从哪里来](../docs/alliance/data/03-resource.md#客户端加载)。

## 5. app/server（P1）

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
  client/           见 MIGRATE.md
  compat/
    upstream/       连接 upstream 后端时的边界兼容，见第 2 节
  season/
  scenario/
```

- `contract` 是原来的 `shared`：两端都要遵守的消息和纯事实，没有连接，也没有画面依赖。当前实现在 `app/contract/src/{match,message}.ts`，`message/`、`match/` 子目录尚未拆分。
- 某一局能放棋的格子由 `server/match/board` 按地图图例生成。近战能否站上远程位，看棋子模组记录的 `meleeOnHighGround`。
- 对外帧在 [docs/alliance/protocol](../docs/alliance/protocol/index.md)。
- `app/season`、`app/scenario` 尚未创建。

### 赛季 app/season

卫戍协议按赛季更换干员、地图，以及装备、盟约、敌人这些其余内容。一个赛季是一份封闭内容。上半是 `act1autochess`，下半是 `act2autochess`。难度留在该赛季的模式配置里：绝境、终极是下半的模式。

赛季目录与 `server/`、`client/` 同级。服务端进程一次只启用一个赛季，启动时由配置指定，进程内所有房间都用这一季（见 [ARCH.md「目标与前提」](ARCH.md#目标与前提)）；浏览器按它取数据包、文案和媒体。作战核心只接收 `BattleSpec`，不读取赛季 id。

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
- 封闭数据包不放在赛季源目录里。`app/data/compiler/packet` 按赛季各编译一次，产物是 `app/data/product/season/<id>/*.json`。索引是 `(seasonId, 文件, id)`。id 保持官方原名。干员和敌人在包里的是这一季的用法，立绘和骨架按资源键领取，数据包只写领域 id。下半会抽到上半的某张地图时，编译把那张地图写入下半的包。服务端运行期间只读取启动时指定的这一季。
- 敌人覆写、商店池、禁用人、回合表和技能释放方式都在这包里。上半没有重装的受击释放行，下半才有；套件读定义上已经算好的触发方式。`match/mode` 读服务端启用的这一季。
- `text/` 按语言一个文件。官方表里的名字和描述由编译器写入数据包，这里放数据包没有覆盖、这一季才用的句子。`media/` 只放赛季标志和入口图，进入赛季清单的接线见第 8 节「遗留」；干员骨骼和地图模型按资源键领取。

### 当前测试状态

2026-10-08 在 `app/server` 运行 `content/choice`、`content/token/test/summons.spec.ts`、`content/operator/test/tier-5.spec.ts`、`match/test/balance.spec.ts`、`test/lobby.spec.ts`、`match/test/lobby-integration.spec.ts`：

- 通过：`test/lobby.spec.ts`、`match/test/lobby-integration.spec.ts`，其中包括改名后的房主转移用例。
- `content/choice/battle.test.ts`：1 个失败，`enemy attack multipliers apply by rank`，见下文等级字段。
- `content/choice/test/choices.spec.ts`：11 个失败。
- `content/operator/test/tier-5.spec.ts`：50 个失败。
- `content/token/test/summons.spec.ts`：整文件加载失败，引用的 `public/js/audio.js` 与 `public/js/render/app.js` 不存在。
- `match/test/balance.spec.ts`：整文件加载失败，`match/agent/balance.mjs` 引用 `#contract/match.js`，`app/server` 没有配置这个别名。

choice 与 tier-5 的多数失败来自同一处：`content/support/battle-facade.ts` 没有导出 `Battle`，测试里 `import { Battle }` 得到 `undefined`。另有旧路径 `../../server/sim/rng.js`，以及旧 harness 字段（`rangeKeys`、`trait`、`spawn`）。这些是测试与当前接口不一致。

### 运行时数据边界

- 内容包身份（`seasonId`、`contentHash`、`protocolVersion`）尚未实现。`entry/packet.ts` 只按文件名加载，不校验版本。
- 创建房间时固定 `seasonId + contentHash`。进行中的房间不能因为站点发布新内容而切换数据包。

### 对局字段和事件契约

- `match/fight/field` 把 `Registration` 当作旧 battle 对象读取 `unit`、`script`。
- `field`、`wave`、`reinforcement`、`flow` 读取事件结果中尚未声明的 `leaked`、`killed`、`total`。
- `agent` 的目标可以为空，需要结合 AI 选择策略确认行为。
- `battleFacade`（`content/support/battle-facade.ts`）仍被各领域脚本使用，等事件与内容端口契约完成后再收口。
- 泄漏、终局、服务端战斗账本、真实对局结果和 Boss 血池的边界，需要与 mission-core 对齐。
- `match/fight/field/index.ts` 的 `missionSpec` 把所有战斗格子的 `height` 写死为 0，真实战斗中高台丢失。
- 这些不是局部类型修复，不能通过补几个字段绕过事件和内容端口的设计。

### 战斗设备单位的生成

`content/device/battle/index.ts` 的箱子、炮台、风机调用 `battle.spawnDevice(key, x, y, stats)`，mission-core 尚未定义该方法，因此今天的战斗不会产生设备单位。快照已有 `kind: "device"`，但服务端还没有设备单位的生成路径。开战时由战斗快照的设备单位接管地图的静态箱子，这一项和地图箱子的处理一起定。

### choice 战斗 fixture 的敌人等级

`content/choice/battle.test.ts` 的敌人等级写在 `UnitSpec.script.rank`，但 `battleFacade` 的单位代理从 roster 与 `getChess()` 读取 `def.rank`。需要明确等级事实来源：

- `UnitSpec.script.rank` 是否是测试与内容端的唯一来源；
- 代理是否必须把它映射到 `def.rank`；
- 或者等级进入新的内容端口或单位注册契约。

在等级字段契约明确前，不修改内容逻辑或引擎代理。

### 注释中的旧路径

`content/token/test/summons.spec.ts`、`match/flow/index.ts`、`match/board/index.ts`、`match/test/sim-client.ts` 仍有 `public/js/` 的路径引用。按 AGENTS.md，注释只写当前代码在做什么，这些引用需要改写。

## 6. 作战核心 mission-core（P1）

接入服务端的事件与账本、事件命名、设备生成、地图与属性兼容、工具边界已并入 [ECS.md](ECS.md)。

## 7. 作战画面 mission-renderer（P1）

已完成：三维地面（`stage/ground/terrain`）的布局、材质、设备、灯光与图集加载；音效线索映射（`stage/cue.ts`）；本地逐帧喂数（`stage/feed.ts`）。图集或 WebGL 失败时地面隐藏，不退回二维地块，master 的 `render/tiles.js` 等二维棋盘不保留。

目录设计、单位、替身、设备与特效画面、音效线索、指针、契约与宿主接口、目录命名与依赖的剩余工作见 [ECS.md](ECS.md)。本节只留三维地面与待确认的差异。

### 未迁移：三维地面（board3d）

- 战斗中的箱子句柄未迁。
- 设备词表缺 mound、turret、bush、waterPlatform、sealedFloor，三维地面没有对应绘制。
- 雾与清屏色未迁，远景没有渐隐。
- 区域裁剪（normal、unite、boss）未迁，目前总是建整张地图。
- 画质开关（低画质关阴影）与 WebGL2、软件 GL 的门控未迁。
- 平台没有检查 `drawn`。
- 测试：`scene.test.ts`、`layout.test.ts` 多为存在性断言，阴影路径、材质着色器、释放路径没有有效断言。
- 三维资源不释放：`terrain/scene.ts` 的 `dashTexture()`、`environmentTexture()` 不进入 `owned`，每次 `setMap` 重建时 PMREM 目标与虚线纹理泄漏。外部加载的贴图在 scene 与 stage 中都没有 dispose。
- `terrain.pixelRatio` 缺省为 1，示例没有设置。

### 有意与 master 不同（待确认）

- 相机是正交俯视，master 是带俯仰的透视相机。
- 预览舞台的玻璃板：`MissionMap` 没有 master 的敌人预览笼矩形，所有 `p` 字形格都画成玻璃。
- 风机方向：`MissionMap` 没有朝向字段，风机默认朝上。
- 渲染时钟不外推：master 允许最多 0.12 s 的外推，这里最多追到最新帧。
- 单位替身尚未重做。master 是头像菱形，头像有图即显示。
- 三维地面的格子随机用 `hash2(x, y)`，master 用 `hash2(r, c)`，同一格的图案不同。
- 活性源石去掉了边缘淡出，改为硬边并加入颗粒与高光。

## 8. 资源 assets-catalog、assets-extractor 与 app/data（P2）

需求、提取、派生、打包、客户端叠加与连接 master 的资源兼容已经完成，现状见 [资源从哪里来](../docs/alliance/data/03-resource.md)、[资源目录](../docs/assets-catalog/index.md)、[资源提取](../docs/assets-extractor/index.md)、[编译](../docs/alliance/data/02-compiler.md) 与 [连接 master 后端](../docs/alliance/compat/index.md)。资源的静态发布在第 9 节。

### 遗留

- 赛季媒体接线：非官方的赛季标志与入口图放在 `app/season/<seasonId>/media/`（第 5 节），键为 `image:season/<seasonId>/<name>`，`<seasonId>` 后只有一段；带 `loading/`、`entry/`、`trap/` 分组的键来自提取器的路径表，不受影响。`app/data` 打包时把这些文件登记进赛季清单，原始目录条目的 `source.id` 为 `app-season`（派生文件现在用 `app-data`）。目录与代码都未建。
- 渲染器按种类的贴图设置：见 [ECS.md](ECS.md)。
- 测试与冒烟：`app/server` 的 `pnpm test` 仍有 37 个文件、950 个用例失败，错误集中在技能下标选择与飞行目标规则，与资源字段无直接关系，原因与基线未确认。开发服务器按键加载头像、Spine、音频、字体与棋盘的人工冒烟未逐项做。服务端的资源验收：删除提取缓存后，启动、建房与演算不受影响（服务端只读数据包，`DATA_FILES` 不含 `assets`）。
- `--full` 的皮肤：`compile:needs --full` 的皮肤部分读 `json:gamedata/excel/skin_table`。表提取之前这部分为空（全量基础需求 14464 条，默认 3999 条）；`extract:media` 之后再运行一次 `compile:needs --full`，皮肤的 `spine:skin/*` 与 `spine:token/<id>/<皮肤>` 才进入需求。
- 未解释的缺失（`report.json` 的 `needs.unexplained`，共 4 个）：
  - `texture:map/autochess/TX_autochessi_D`、`TX_autochessi_common_D`、`TX_autochessi_BG`：只有本机客户端能提供。给赛季需求的这三个键写上 `absent` 原因（本机客户端独有），使它们归入 `absentUpstream`；`compiler/input/base/absent.json` 目前只覆盖基础需求。
  - `audio:sfx/battle/p_atk_arrow_n`：`voice` 分支中同名多候选，按名反查视为未命中。在 `assets-extractor/source/voice/paths.json` 登记确定的路径。

### 本机客户端来源

`assets-extractor/source/local-client/python/extract.py`（UnityPy，由 master 的 `tools/local-extract/` 改写）只能由 `pnpm extract:local` 单独运行，不接入 `pnpm extract`。棋盘贴图（含派生的法线与粗糙度）、`json:material/*`、`model:mesh/*`、`json:prefab/*`、社区缺失的敌人与召唤物 Spine 只有它能提供；没有它时棋盘 tiles 不生成，渲染器隐藏三维地形。接入需要本机游戏客户端验证：

- TS 适配器 `source/local-client/`：只在传入 `--game <dir>` 时启用，排在同命名空间的最前面；`--python <path>` 指定解释器，默认 `python3`；没有 `--game` 时不探测、不报错。`prepare` 运行 `extract.py --print-jobs` 声明 `covers`；有命中时运行 `extract.py --game <dir> --out <cache>/sources/local-client/files --manifest <cache>/sources/local-client/manifest.json`，只跑需要的 `--only` 组。
- 输出路径到键的映射表（TS 数据，带测试）：`spine/enemy/<id>/` → `spine:enemy/<id>`；`spine/token/<id>/` → `spine:token/<id>/front`；`map/<theme>/<name>.png` → `texture:map/<theme>/<name>`（webp 副本是同一条目的另一格式，派生图 `_rgb`、`_rough` 是独立的键）；`map/<theme>/materials.json` → `json:material/<theme>`；`mesh/<bundle>/<mesh>.obj` → `model:mesh/<bundle>/<mesh>`；`mesh/<bundle>/prefab.json` → `json:prefab/<bundle>`；界面、表情、引导 Sprite → 对应的 `image:` 键。之后与其他来源共用哈希、`files/`、`SpineMeta` 与原始目录，`source.id` 为 `local-client`，`source.revision` 为客户端资源版本。
- 从 master 恢复：`TOKEN_SPINES` 与 `export_token_spines`（社区缺失的召唤物 Spine，取 Front 渲染器）；清单写盘（`--manifest`，`--only` 时按组合并）；`enemy_model_offsets.py`。它与 `enemy_scales.py` 作为诊断命令 `extract:local-report scales|offsets`，结果写进 `report.json`，不进原始目录。
- 测试：`assets-extractor/test/extract.spec.ts` 中依赖脚本清单的 5 个用例（清单、网格组、webp 副本、棋盘材质）现在跳过，清单写盘恢复后改读清单；没有 Python 时跳过，断言不放宽。接入后与 master 的输出逐项对照一次。
- Python 环境（虚拟环境、安装 `requirements.txt` 中的 UnityPy、lz4、Pillow）由用户自理，暂不管理。其他包、默认提取流程与 `pnpm test` 不依赖 Python。

### 探索

1. 本机提取的替代方案：TS 读取 Unity AssetBundle、ArkUnpacker（同为 Python 栈）及其他工具。评估 macOS、Linux、Windows 与 iOS 客户端（ASTC 图集页）的可用性，LZ4AK 解码，网格、材质参数与 prefab 变换的导出，以及维护成本。替换后只换 `local-client` 的实现，原始目录、需求清单与包清单不变。
2. 攻击时序的官方来源：在官方 prefab、动画控制器或 gamedata 中找攻击判定时间，替换 `DEFAULT_ATTACK_ANIM`（`null`，`mission-core` 无动画片段时停顿 0.35 秒）。不从 Spine 的 Attack 时长与 OnAttack 事件推导。写入数据包会改变 `contentHash` 与演算结果，按第 2 节的迁移处理。
3. 敌人模型缩放与偏移的自动化：见 [ECS.md](ECS.md)。
4. fexli 的 `build` 姿势：`spine:char/<charId>/build` 是登记过的姿势，`fexli` 适配器没有对应规则。
5. 快照更新：`app/data/compiler/input/research/07-assets.json`（2026-09-27 由工具从上游 git 树生成，生成脚本不在仓库中，之后只手工编辑）与 `arknights-assets`、`voice` 适配器的 `paths.json` 都是固定快照，官方新增的干员、道具、羁绊、界面与音效不会被自动发现。等 07 的更新方案确定后再处理。
6. `refs` 的 JSON Patch：ARCH「数据、文案与资源层」允许模组用 JSON Patch 修改 `refs`；当前清单格式没有对应字段，解析器只按 JSON 路径合并。
7. 模组包的加载、Service Worker 完整性校验与权限（ARCH「探索项」第 2 项），PWA 与离线包。模组清单与基础、赛季清单同格式，`loadResourceStore` 的 `mods` 按顺序叠在赛季之上。
8. 多语言文案目录。

## 9. 部署 deployment（P2）

目录结构：`deployment/server/{image,stack,script}`、`deployment/client/{image,config,script,vendor}`、`deployment/tool`。当前已有 `deployment/server/{image,script}` 与 `deployment/client/{image,script,vendor}`。

master 来源：`server/index.js` 的静态文件、gzip、ETag、Range 归入 `deployment/client/config`；`tools/vendor.mjs`、`scripts/`、`Dockerfile` 归入 `deployment`，镜像拆成 `client/image` 与 `server/image`。

`deployment/server` 负责：

- 对局进程镜像，不包含媒体字节；
- 启动配置指定的赛季包，镜像内、挂载卷或独立存储均可；
- `HOST`、`PORT`、`TRUST_PROXY`；
- `/healthz` 与 `/ws`。

`deployment/client` 负责：

- 前端构建产物与 vendor；
- 赛季 JSON、资源清单与媒体文件的静态发布，见下「资源发布」。

赛季与协商：

- 服务端一次只启用一个赛季。启动时加载配置指定的赛季包，运行期间不热切换；更换赛季需停机、重新指定赛季包并重启。已有房间随服务停止而结束。
- 赛季包的静态地址可以独立于后端。后端是赛季版本的权威方：连接协商时返回 `seasonId`、`contentHash`、协议版本，以及赛季包和资源清单的地址。前端从后端指定的地址下载并校验，不自行选择赛季。判定与回落规则见第 3 节。
- 新内容发布不改变已创建房间的 `contentHash`。静态站点更新页面和资源时，不需要重启对局进程。

资源发布：

地址由 `assets-catalog` 的地址模块计算（[地址](../docs/assets-catalog/03-address.md)），所有种类同一格式，不保留 master 的 `/media/` 无扩展名音频路由。开发服务器（`app/client/vite-plugins.ts`）已按这套布局提供文件；生产发布未实现。

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
- 握手返回清单地址：见上「赛季与协商」；客户端 `loadResourceStore` 现在由调用方给出基础包与赛季包地址。
- vendor 与前端构建产物的发布。
- 镜像与工具：Docker 镜像（`client/image`、`server/image`），根目录初始化脚本与 `deployment/tool` 的统一命令（初始化、检查、资源总命令）。
- CI：缓存整个提取缓存目录 `app/data/.cache/assets`（含 `repos/` 浅克隆、`files/`、`ledger.json`），再次运行由账本复用。

0.2.x 的发行形态暂不迁移：master 有完整包、精简包（首次启动从公开镜像下载素材）、更新包（只含改动文件，依 `MANIFEST.json` 校验并删除旧文件）、`npm run doctor` 文件校验与 `npm run package`。以后尽量复用 master 的形式，基于原始目录与包清单的哈希实现。

验收：

- 删除提取缓存与媒体文件后，服务端启动、建房与演算不受影响（服务端只读内容包）；
- 浏览器能从静态站点读取资源，并通过 `/healthz`、`/ws` 连接对局进程；
- 连接协商能返回当前启用的 `seasonId`、`contentHash`、协议版本与赛季包地址。

## 10. 待确认的决定

- 死亡单位的去留、renderer 目录布局、备用模型与别名染色、master 的 `theme` / `fx` 材质表：见 [ECS.md](ECS.md)「待决事项」。
- 三维地面的雾、区域裁剪、画质开关是否保留为设计决定。
- 包版本号：next 为 0.1.3，master 为 0.2.1，版本关系与 next 的版本号策略需要确认。门槛版本号依赖这一项（第 3 节）。
- 兼容层 `data/` 中，数据视图与 packet 视图是否共用一个类型，还是各自独立（第 2 节）。
- 边界检查规则放在 `app/contract` 的哪个子目录，以及 next 服务端是否也强制执行（第 2 节）。
