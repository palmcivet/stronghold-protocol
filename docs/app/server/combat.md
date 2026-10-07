---
title: 作战
description: 一场战斗的开始、进度、结果和共享血池。默认在浏览器里演算，服务端验收结果。
---

# 作战

`m.public.combatMode` 为 `client` 时，浏览器按服务端发来的规格演算战斗。服务端不按实时推送快照。规格由服务端生成，服务端自己也按同一份规格演算机器人、断线玩家，以及校验失败后的战场。

`combatMode` 为 `server` 时（进程环境 `SP_COMBAT=server`），战斗在服务端演算，并用 `b.snap`、`b.ev` 推向正在看这块战场的人。

一场战斗的 `battleId` 在本房间的各局之间唯一。过期的 `b.progress` 或 `b.result`（战场已经结束，或房间已经开了下一局）被忽略。

谁的客户端说了算：普通战场是该玩家仍连接着的浏览器；联防和首领双场是场上座位号最小的仍连接玩家。机器人、已离开或整场没有连接中的玩家时，由服务端演算。权威断线、离开或超过时限时，服务端接管；原权威收到 `b.end`，`reason` 为 `takeover`。

## `b.start`

服务端 → 客户端。作战、联防、最终攻势、隐秘核心开始时发给场上的玩家；`g.watch`、重连时按该玩家当前观看的战场再发。

| 字段 | 含义 |
|---|---|
| `battleId` `fieldId` `kind` | 战斗标识、战场、种类 |
| `spec` | 战斗规格。观战者拿到的副本里去掉每名玩家开战时的私有资金，其余足够把同一场战斗演出来 |
| `authoritative` | 该接收者是否要向服务端汇报进度和结果。观看者、已结束的战场为假 |
| `startAt` `serverNow` `elapsed` | 开战时钟、当前时钟、战场上已经过去的游戏秒 |
| `speed` | 游戏秒每真实秒。正式对局为 2 |
| `watch` | 接收者是不是这块战场的观看者 |
| `done` | 战场是否已经结束 |

## `b.progress`

权威客户端 → 服务端。大约每秒一次；首领战场大约每秒四次。

| 字段 | 约束 |
|---|---|
| `battleId` | 标识 |
| `gt` | 游戏时间，0–100000 |
| `killed` `total` | 整数，0–100000 |
| `leaks` | 可选。已计入的漏怪 |
| `bossDmg` | 可选。本战场对共享血池的累计伤害 |
| `by` | 可选。最多 4 名玩家，每人一个 `0` 到 `1e13` 的有限数字，表示各自对血池的累计伤害 |
| `done` | 可选布尔 |
| `left` | 可选。联防中每个漏怪方仍站着的敌人数，每人为 0–100000 的整数 |

服务端只记增量。没有 `rid` 且对局已经不接收它时，不回复 `error`。

## `b.result`

权威客户端在战斗结束时发送。`result` 通过结构校验后，服务端再按规格核对敌人数、漏怪、层数和金币；不通过则服务端自己演算，首领战场则移交权威。

`result` 的字段：

| 字段 | 约束 |
|---|---|
| `reason` | `cleared`、`timeout`、`forced` |
| `time` | 有限数字，0–100000 |
| `killed` `total` | 可选整数，`0`–`100000` |
| `perPlayer` | 1–4 名玩家，键为玩家 id，值见下表。不能为空 |
| `unspawned` | 可选，最多 400 条。必有 `enemyKey`。`sourcePlayerId` 与 `tag` 可以没有，也可以是 `null`。`time` 可选 |
| `errors` | 可选整数，`0`–`1000000000` |
| `bossHpLeft` | 可选，`0` 到 `1e13` 的有限数字 |

`perPlayer` 的一条必有 `killed`、`total`（均为 `0`–`100000` 的整数，且 `killed` 不超过 `total`）、`leaked`（最多 400）、`perfect`、`layerGains`（最多 40 个盟约）和 `unitsEnd`（最多 64）。`unitStats` 可选，最多 160。`coins`、`damageDealt`、`bossDamage`、`healingDone`、`deaths` 可以不出现；出现时是 `0` 到 `1e13` 的有限数字。

`leaked[]` 必有 `enemyKey`。`mods`、`lpr`、`sourcePlayerId`、`tag`、`counted`、`boss`、`spawned` 都可以不出现。`mods` 最多 16 项，值是 `null`、`-1e13`–`1e13` 的有限数字、不超过 64 字的字符串或布尔。`lpr` 为 `0`–`1000`。`sourcePlayerId` 与 `tag` 也可以是 `null`。

`unitsEnd[]` 必有 `hpPct`（`0`–`1`）、`sp`（`0`–`100000`）和 `alive`。`uid` 与 `defId` 可以没有，也可以是 `null`。`skillActive` 可选。

整帧仍受 64 KiB 入站上限约束。

进程环境 `SP_VERIFY` 不改变帧的形状。`all` 会在接受普通战场和联防的结果之前再演算一遍，不一致时采用服务端结果。`sample` 抽查。默认 `off`。

## `b.pool`

服务端 → 客户端。首领回合的共享血池，大约不超过每秒四次。数字不四舍五入。

| 字段 | 含义 |
|---|---|
| `hp` `max` | 当前与最大血池 |
| `teamLp` | 队伍共享生命 |
| `acked` | `{ [fieldId]: 已经计入的累计伤害 }` |

## `b.end`

服务端 → 客户端。

| 字段 | 含义 |
|---|---|
| `battleId` `fieldId` | 哪一场 |
| `reason` | `cleared`（血池空）、`forced`（队伍生命空）、`takeover`（换了权威；停止汇报，画面可以继续） |

## `b.snap` 与 `b.ev`

只在 `combatMode` 为 `server` 时作为作战推送。客户端作战不靠这两帧同步胜负。

`b.snap`：`fieldId`、`gt`、`units`、`dp`、`killed`、`total`，以及可选的 `down`、`elem`。`units` 的一行是 `[id, x, y, hp, maxHp, sp, spMax, flags, anim]`。发送队列超过约 1 MB 时，服务端丢掉这种帧；超过约 16 MB 时断开连接，客户端重连后收全量状态。

`flags`：1 被阻挡，2 眩晕，4 冻结，8 隐匿，16 技能中，32 护盾，64 无敌，128 寒冷，256 睡眠，512 飞行。

`anim`：0 待机，1 移动，2 攻击，3 技能，4 倒下，5 眩晕，6 部署。

`b.ev`：`{ fieldId, ev }`。`ev` 里每一条是数组，首元素为 `spawn`、`atk`、`dmg`、`heal`、`skill`、`engage`、`die`、`leak`、`status`、`fx`、`layer`、`bounty`、`deploy`。游戏时间在帧里叫 `gt`，因为 `t` 已经是消息名。
