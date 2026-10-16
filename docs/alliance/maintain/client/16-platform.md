---
title: 平台探测
description: 客户端怎样探测本机能力：configurePlatform、probe 与 getPlatform，不做 UA 嗅探。
---

# 平台探测

本机能力集中在 `infra/platform`。只做特性探测，不按 User-Agent 猜浏览器或设备。与 welcome 协议下发的后端 `Capabilities`（`infra/connection`）分开，不要合并。

## 入口

| 名称 | 作用 |
| --- | --- |
| `configurePlatform(overrides)` | 写入宿主覆盖（Tauri / Capacitor / 测试）；已有快照时就地合并 |
| `probe(overrides?)` | 探测本机能力，与宿主覆盖及本次 `overrides` 合并后写入快照并返回 |
| `getPlatform()` | 返回当前快照；尚未探测过时会懒调用一次 `probe()` |

## `Platform` 字段

均为布尔：

| 字段 | 含义 |
| --- | --- |
| `indexedDb` | 是否有 IndexedDB |
| `broadcastChannel` | 是否有 `BroadcastChannel` |
| `clipboardWrite` | 是否有 `navigator.clipboard.writeText` |
| `fullscreen` | 是否有 `requestFullscreen` |
| `webgl2` | 是否能取得 WebGL2 上下文 |
| `secureContext` | 是否在安全上下文 |
| `localStorage` | 是否能读写 `localStorage` |
| `sessionStorage` | 是否能读写 `sessionStorage` |

快照供外壳、战场与存储只读查询，不替代 [设置段](./15-settings.md) 里的玩家选项。

## 原则

- 只探测「能不能用」，不根据 UA 字符串分支。
- `probe` 可重复调用；每次以新的探测结果为底，再叠宿主覆盖与本次参数。
- 画布的 contain 缩放在 `infra/theme/viewport`；平台层不写视口尺寸类。

## 与其它层

| 需求 | 去向 |
| --- | --- |
| 多标签令牌协商是否可用 | 看 `broadcastChannel`；流程见 [身份与多标签](./09-identity.md) |
| 异形屏 UI 是否避让 | 玩家选项在 `core:display` 的 `safeAreaUi`；inset 见 [样式与令牌](./11-style.md) |
| 舞台能否用 WebGL2 | 看 `webgl2`；建舞台与降级见 [战场](./14-field.md) |
