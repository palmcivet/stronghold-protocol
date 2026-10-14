---
title: 连接与兼容模式
description: 客户端怎样连接服务端、怎样判断后端的能力，以及界面怎样经意图总线发消息。
---

# 连接与兼容模式

客户端经一条 WebSocket 连接对局服务端。连接层负责握手、请求号与重连。握手回复决定后端的能力集。

## 连接地址

连接地址是页面同源的 `/ws`：`https:` 页面用 `wss://<host>/ws`，否则用 `ws://<host>/ws`。

开发服务器把 `/ws`、`/data`、`/assets`、`/media` 转发到环境变量 `ALLIANCE_BACKEND` 指定的后端，默认 `http://localhost:3000`。页面因此保持同源，master 后端不需要 CORS 头。

## 连接状态

| 状态 | 含义 |
| --- | --- |
| `idle` | 尚未连接 |
| `connecting` | 正在打开 WebSocket |
| `connected` | WebSocket 已打开，尚未握手 |
| `handshaking` | 已发 `hello`，等待 `welcome` |
| `online` | 收到 `welcome`，可以收发 |
| `reconnecting` | 连接断开，等待下一次重连 |
| `closed` | 连接已关闭，不再重连 |

## 重连与超时

| 项 | 值 |
| --- | --- |
| 请求超时 | 8 秒 |
| `hello` 超时 | 8 秒 |
| 心跳间隔 | 4 秒 |
| 判定连接失效 | 心跳 15 秒没有回应 |
| 重连退避 | 从 500 毫秒起每次翻倍，最多 10 秒，抖动 ±20% |

- 带 `rid` 的请求在重连期间排队，收到 `welcome` 后发出。
- 发送前用 `@alliance/contract` 的 `validateC2S` 校验，不合法的帧不发。
- 服务端推送的载荷只按 `@alliance/contract` 的类型读取，不做运行期校验。
- 连接不在线时，外壳的连接横幅显示正在连接、重连倒计时或已关闭；会话被另一页面接管时说明原因。

## 兼容模式

`welcome` 带对象形式的 `ext` 时，后端是本项目的服务端（`native`）；不带时是 master 后端，客户端进入兼容模式（`compat`）。

两边的 `PROTOCOL_VERSION` 都是 1，不能用协议版本区分后端。

兼容模式下：

- 能力集固定为 master 0.2.4 的能力。
- 规则数据在 `welcome` 后从后端的 `/data` 读取，赛季包不参与。
- 界面资源取自后端，经兼容层映射。
- 战斗由 master 演算，客户端只显示它推送的战斗状态与画面。

## 能力集

| 能力 | 含义 | master 0.2.4 |
| --- | --- | --- |
| `watchByField` | `g.watch` 按战场指定观看对象 | 有 |
| `watchByPlayer` | `g.watch` 带 `playerId` | 无 |
| `spectatorSeats` | 观战席位 | 有 |
| `loadout` | 干员调配 | 有 |
| `extensions` | 扩展信道 `x` | 无 |
| `clientCombat` | 客户端演算战斗并回报 `b.progress`、`b.result` | 有 |

后端没有的能力，对应入口隐藏。插槽与菜单项的 `when` 用 `capability` 读取这张表，见 [部件与插槽](./05-part.md#出现条件)。

## 意图总线

界面不直接调用连接。所有 `g.*` 与 `room.*` 消息经意图总线发出。

- `dispatch(intent)`：先用 `validateC2S` 做本地检查，再发请求，等服务端回复。它不抛错，结果是 `{ ok: true, reply }` 或 `{ ok: false, error }`。
- `preview(intent)`：只做本地检查，返回拒绝原因或 `null`。服务端仍然做最终判定。
- `onOutcome(listener)`：订阅每个意图的结果。音效与离开房间的流程由此接入。
