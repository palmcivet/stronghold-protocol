---
title: 对局协议
description: 对局进程对外的线路接口。浏览器和外壳通过这些操作加入房间、提交意图并接收对局视图。
---

# 对局协议

对局进程对浏览器和外壳提供两项操作：`GET /healthz`，以及路径 `/ws` 上的 WebSocket。页面、赛季 JSON 和媒体由站点提供，不在这份契约里。

线路上的事实来自当前实现：`app/server/entry/index.ts` 的健康检查与升级，`app/server/connection/session.ts` 的会话，`@alliance/contract` 的 `message.ts`（`C2S`、`S2C`、`validateC2S`）的消息校验，`app/server/room/index.ts` 的房间，`app/server/match/` 的对局与作战帧。消息名和字段以各页为准。

## 帧

每帧是一条 JSON 文本。对象带消息名 `t`。客户端帧可以带请求号 `rid`（整数，0 到 2³¹）。服务端对这一帧的直接回复带回同一个 `rid`。服务端主动推送没有 `rid`。校验不认识的字段会被忽略。

入站单帧不超过 64 KiB。二进制帧、无法解析的 JSON、未知的 `t`、字段不合法，都回复 `error`，`code` 为 `BAD_MSG`。除 `hello` 与 `ping` 之外，未完成 `hello` 的连接上的帧同样是 `BAD_MSG`。

协议版本是整数 `1`。`hello` 带了 `version` 且与此不同，回复 `BAD_MSG`。

## 消息名

客户端 → 服务端：

- 会话与房间：`hello` `ping` `room.create` `room.join` `room.leave` `room.ready` `room.setDifficulty` `room.addBot` `room.removeBot` `room.kick` `room.start` `room.loadout` `room.spectate` `room.removeSpectator`
- 对局：`g.infoReady` `g.band` `g.bandSkip` `g.bandFocus` `g.buy` `g.refresh` `g.freeze` `g.levelUp` `g.sell` `g.move` `g.equip` `g.art` `g.destroy` `g.reward` `g.choice` `g.ready` `g.emote` `g.watch` `g.autoplay` `g.pause` `g.unitStats` `g.leave`
- 作战：`b.progress` `b.result`

服务端 → 客户端：

- 会话与房间：`welcome` `ok` `error` `pong` `room.state` `room.closed`
- 对局：`m.public` `m.private` `m.field` `m.toast` `m.ticker` `m.emote` `m.result` `m.unitStats`
- 作战：`b.start` `b.pool` `b.end`；`combatMode` 为 `server` 时还有 `b.snap` `b.ev`
