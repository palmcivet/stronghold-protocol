---
title: 对局协议
description: 对局进程对外的线路接口。浏览器和外壳通过这些操作加入房间、提交意图并接收对局视图。
---

# 对局协议

对局进程对浏览器和外壳提供两项操作：`GET /healthz`，以及路径 `/ws` 上的 WebSocket。页面、赛季 JSON 和媒体由站点提供，不在这份契约里。

## 对照版本

线路形状以 master **应用版本 0.2.6**（提交 `488db49`）与 `@alliance/contract` 为准。二者不一致时，各页写明差异。

| 名称 | 值 | 含义 |
| --- | --- | --- |
| 应用版本 | `0.2.6` | master 发行版本；`/healthz` 的 `app` 字段 |
| 线路协议版本 | `1` | 帧格式号；`PROTOCOL_VERSION`；`hello` / `welcome` / `/healthz` 的 `version` |

应用版本与线路协议版本不要混用。master 0.2.6 与更早的 0.2.x 一样，线路协议版本仍是整数 `1`。

next 对局进程的代码在 `connection/`（HTTP、地址、会话、WebSocket）与 `entry/main.ts`。目录见 [架构](../02-architecture.md#目录)。

消息名与字段以各页为准。校验入口是 `@alliance/contract` 的 `C2S`、`S2C`、`validateC2S`。

## 帧

每帧是一条 JSON 文本。对象带消息名 `t`。客户端帧可以带请求号 `rid`（整数，0 到 2³¹）。服务端对这一帧的直接回复带回同一个 `rid`。服务端主动推送没有 `rid`。校验不认识的字段会被忽略。

入站单帧不超过 64 KiB。二进制帧、无法解析的 JSON、未知的 `t`、字段不合法，都回复 `error`，`code` 为 `BAD_MSG`。除 `hello` 与 `ping` 之外，未完成 `hello` 的连接上的帧同样是 `BAD_MSG`。

`hello` 带了 `version` 且与线路协议版本 `1` 不同，回复 `BAD_MSG`。

## 消息名

消息名带前缀：`g.` 是对局中玩家发出的意图（客户端 → 服务端）；`m.` 是对局状态推送（服务端 → 客户端）。`room.` 管大厅与入座，`b.` 管一场战斗的进度与结果。

客户端 → 服务端：

- 会话与房间：`hello` `ping` `room.create` `room.join` `room.leave` `room.ready` `room.setDifficulty` `room.setAiPicksLast` `room.addBot` `room.removeBot` `room.kick` `room.start` `room.rerollSetup` `room.cancelReroll` `room.loadout` `room.ownership` `room.diy` `room.spectate` `room.removeSpectator`
- 对局：`g.infoReady` `g.rerollVote` `g.band` `g.bandSkip` `g.bandFocus` `g.buy` `g.refresh` `g.freeze` `g.levelUp` `g.sell` `g.move` `g.equip` `g.art` `g.destroy` `g.reward` `g.choice` `g.ready` `g.emote` `g.watch` `g.autoplay` `g.pause` `g.unitStats` `g.leave`
- 作战：`b.progress` `b.result`

服务端 → 客户端：

- 会话与房间：`welcome` `ok` `error` `pong` `room.state` `room.closed`
- 对局：`m.public` `m.private` `m.field` `m.toast` `m.ticker` `m.emote` `m.result` `m.layer` `m.unitStats`
- 作战：`b.start` `b.pool` `b.end`；`combatMode` 为 `server` 时还有 `b.snap` `b.ev`

## 契约与进程

`@alliance/contract` 的 `C2S` 已与 master 0.2.6 对齐下列曾缺口字段：`g.watch.playerId`、`g.choice.choiceId`、`b.progress.resolved` / `leaksBy`。`room.ownership`、`room.diy` 的形状亦在契约中。

上述意图的分发、开局取值与 `welcome.ext` 下发均「待新 server」。开发期客户端连 master 后端；无 `ext` 的 `welcome` 进入兼容模式。

`hello` / `welcome` 的 `ext`（赛季与内容哈希等）是 next 原生握手的规划，master 0.2.6 不下发。
