---
title: HTTP
description: 对局进程的 HTTP 面。健康检查，以及把连接升级为 WebSocket。
---

# HTTP

进程只接受 `GET` 与 `HEAD`。其他方法回应 `405`，`Allow: GET, HEAD`。请求目标长于 4096 字节时回应 `414`。每条响应带 `X-Content-Type-Options: nosniff` 与 `Referrer-Policy: same-origin`。

监听地址来自环境变量 `HOST`（默认 `0.0.0.0`）和 `PORT`（默认 `3000`）。

## `GET /healthz`

`HEAD /healthz` 使用同一组首部，没有正文。

`200`，`Content-Type: application/json; charset=utf-8`，`Cache-Control: no-store`。

| 字段 | 含义 |
|---|---|
| `ok` | `true` |
| `version` | 协议版本，当前为 `1` |
| `app` | 发行版本字符串，与包版本相同 |
| `uptimeSec` | 进程已运行的秒数 |
| `build` | 当前对外页面运行时的 12 位标识；读不到页面文件时为 `null` |
| `sockets` | 当前 WebSocket 数 |
| `sessions` | 会话数，含断线后仍可恢复的 |
| `rooms` | 房间数 |
| `matches` | 进行中的对局数 |
| `humans` | 座位上的真人（不含已离开的） |
| `bots` | 机器人座位数 |
| `spectators` | 观战座位数 |

`build` 由进程启动时根据所提供的页面、脚本和样式算一次。编排和页面更新用它判断浏览器是否还拿着旧页面。

## `GET /ws`

HTTP 升级为 WebSocket。`maxPayload` 为 64 KiB，不启用按消息压缩。路径不是 `/ws` 时，升级被拒绝为 `404`。

准入在升级之前完成：

| 结果 | 状态 | 条件 |
|---|---|---|
| 拒绝 | `429` | 该来源网络上的连接数已达上限（默认 64） |
| 拒绝 | `503` | 进程正在关闭，或全局连接数已达上限（默认 2000） |
| 接受 | `101` | 其余情况 |

来源地址默认是 TCP 对端。`TRUST_PROXY` 为 `auto`（默认）时，仅当对端是回环或私网地址，才采用 `CF-Connecting-IP`、`X-Real-IP` 或 `X-Forwarded-For` 最右侧的地址。`1` 始终采用，`0` 从不采用。局域网直连、没有转发头的对端不按网络计数。

按网络的房间数与进行中对局数不在升级时检查。超限发生在 `room.create` 与 `room.start`，回复见 [会话](./session.md) 的 `RATE`。默认同时存在的房间不超过 1000，同一网络创建中的房间不超过 16，同一网络进行中的对局不超过 8。
