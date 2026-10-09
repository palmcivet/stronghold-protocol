---
title: 房间
description: 建房、入座、准备、观战，以及房间状态推送。
---

# 房间

房间码为 4 位，字母表 `ABCDEFGHJKLMNPQRSTUVWXYZ`（不含 I、O，也不含数字）。加入时大小写不敏感，状态里的 `code` 是大写。

`mode` 为 `solo`（独立模拟）或 `coop`（同盟模拟）。`solo` 只有一个真人座位，不能加机器人，也不能观战。`coop` 有 4 个玩家座位，座位号 0–3 不压缩；另有最多 2 个观战座位，观战者不在 `seats` 里。

`difficulty` 为 `FUNNY`、`NORMAL`、`HARD`、`ABYSS`。模式编号由服务端写成 `mode_single_<difficulty>` 或 `mode_multi_<difficulty>`，小写难度，出现在对局公开状态的 `modeId` 里。

建房消息只有 `mode` 与 `difficulty`。帧里没有赛季字段。

人在大厅房间里发送 `room.create` 或 `room.join` 时，会先离开当前房间。对局已经开始时，这两条回复 `ROOM_STARTED`，要先 `room.leave` 或 `g.leave`。

## 客户端 → 服务端

成功且带 `rid` 时先回复 `ok`，再推送状态。失败回复 `error`。

| 消息 | 字段 | 谁可以发 | 失败 |
|---|---|---|---|
| `room.create` | `mode`，`difficulty` | 不在进行中的对局里的会话 | 同一网络房间数超限时 `RATE` |
| `room.join` | `code`：字母数字，长度放宽到 6 再规范化 | 同上 | `ROOM_NOT_FOUND`、`ROOM_FULL`、`ROOM_STARTED` |
| `room.leave` | 无 | 在房间内的玩家或观战者 | `NOT_IN_ROOM` |
| `room.ready` | `ready`：布尔 | 大厅中的玩家座位 | 观战者为 `SPECTATOR` |
| `room.setDifficulty` | `difficulty` | 大厅中的房主 | `NOT_HOST`。改难度会使其他真人变为未准备 |
| `room.addBot` | 无 | 大厅中的合作房房主 | `NOT_HOST`、`ROOM_FULL`；独立模拟不能加 |
| `room.removeBot` | `seat`：0–3 | 大厅中的房主 | 该座不是机器人时 `BAD_TARGET` |
| `room.kick` | `seat`：0–3，`playerId` | 开局前的房主 | 不能踢自己，不能用这条踢机器人。`playerId` 必须仍是该座上的人，否则 `BAD_TARGET` |
| `room.start` | 无 | 房主 | 其他真人未连接或未准备时 `NOT_READY`。房主自己的开始视为房主已准备。同一网络进行中的对局超限时 `RATE` |
| `room.loadout` | `entries` | 会话。对局已过确认信息阶段时，本局配装不再更换 | 见下文 |
| `room.spectate` | `code` | 合作房间，大厅或对局中 | 独立模拟或观战座满为 `ROOM_FULL`。已是玩家时 `ALREADY` |
| `room.removeSpectator` | `playerId` | 房主，任何时候 | 没有这个观战者时 `BAD_TARGET` |

机器人显示名按空座顺序取：`AI·华法琳`、`AI·阿米娅`、`AI·惊蛰`、`AI·杜宾`、`AI·凯尔希`、`AI·可露希尔`。

### `room.loadout`

`entries` 是 `{ [baseChessId]: { skill?: 技能序号, module?: 模组 id | "none" } }`。最多 160 条。技能序号为 0–9 的整数。键是可见的基础干员 id，不能是精英 id。

服务端按数据包检查：未知、隐藏或非法的技能、模组会使整份配装被拒绝（`BAD_MSG` 或 `BAD_TARGET`），不写入。与默认技能、默认模组相同的条目不保存。没有精英的干员不能带 `module`。保存下来的每条是 `{ skill, module }`，没有精英时 `module` 为 `null`。

配装记在会话上，创建或加入房间时带到座位，断线重连仍在。机器人没有配装，用数据包默认值。对局进行中，只有确认信息阶段接受更换；之后回复 `WRONG_PHASE`，已保存的配装留给下一局。

### 观战座位

观战者不是玩家：不占 1–4 人，不计准备，不当房主，也不能让房间继续存在。他收到 `room.state` 和对局的公开推送，可以看战场，收不到 `m.private`。

观战者可以发的业务帧只有 `g.watch`、`room.leave`、`g.leave`、`room.loadout`。`room.loadout` 只记在会话上，不交给本局。其他帧回复 `SPECTATOR`。

大厅中的观战者可以用同一房间码 `room.join` 坐进空的玩家座。玩家不能在原地改成观战。

## `room.state`

推送给房间内的玩家和观战者。

| 字段 | 含义 |
|---|---|
| `code` | 房间码 |
| `hostId` | 房主 `playerId`；没有真人时房间会被拆掉 |
| `mode` | `solo` 或 `coop` |
| `difficulty` | 当前难度 |
| `inMatch` | 是否有进行中的对局 |
| `seats` | 长度 4。空座为 `null`。有人时为 `{ seat, playerId, name, isBot, ready, connected }` |
| `spectators` | `{ playerId, name, connected }` 的列表 |

`connected` 对已离开的玩家为假。大厅里有人断线时座位先保持，60 秒内重连可以回来；超时后该会话下次恢复会收到 `room.closed`。对局中断线不腾座位。

房主离开或被移除后，剩余真人里座位号最小者成为房主，仍连接着的优先。没有真人时房间拆除，机器人不保留房间。

## `room.closed`

发给被移出房间的会话。字段 `reason`：

| 值 | 何时 |
|---|---|
| `timeout` | 大厅断线超过 60 秒 |
| `kicked` | `room.kick` 或 `room.removeSpectator`。被踢的人可以用同一房间码再加入，没有封禁 |
| `empty` | 观战者所在房间的最后一名玩家离开 |
| `shutdown` | 进程关闭 |

当时不在线的人，把原因记到下次 `hello` 再送出。踢人或大厅超时如果发生在一局结束之后，恢复时还会在 `room.closed` 之后再收到该局最后的公开状态和结算。

对局中的 `room.leave` 与 `g.leave` 是永久离开：座位标记为已离开，对局按弃权处理，座位在本局结束后释放。这不是 `room.closed`。
