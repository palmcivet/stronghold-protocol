---
title: 调试叠层
description: DEV 下的 WSDE 调试叠层：部件高亮、出血线与屏幕比例，以及 getWsde / window.wsde。
---

# 调试叠层

运行时调试叠层集中在 `infra/debug`：部件高亮、出血线（安全区）与屏幕比例框。只在 DEV 构建可用；生产构建里 `getWsde()` 为 `null`，`window.wsde` 上只有主机 API（无调试方法）。主机与调试共用同一全局 **`window.wsde`**（DEV 下也可经 `getWsde()` 取调试面）；旧全局名 `alliance` 已废弃，也不要挂成 `alliance.debug`。与 welcome 协议下发的后端 `Capabilities`（`infra/connection`）无关，不要合并。

## 入口

| 名称 | 作用 |
| --- | --- |
| `getWsde()` | DEV 返回调试面（`WsdeDebugApi`）；生产返回 `null` |
| `getWsdeDebug()` | 与 `getWsde()` 相同；新代码优先用 `getWsde()` |
| `resetWsde()` | 清空挂载登记与全部叠层状态；**仅测试**使用（同类于 `resetPlatform`） |
| `window.wsde` | boot **始终**挂上主机 API（`enter` / `createRoom` / `joinRoom` / `submit` / `view`）；DEV 再把调试方法混到**同一**对象上 |

控制台示例：

```js
const wsde = window.wsde
if (wsde) {
  wsde.highlight({ type: 'part', id: 'core:room.roster' })
}
```

## 高亮与查询

`WsdeDebugApi`（挂在 `window.wsde` 上的调试方法）的高亮与挂载查询：

| 名称 | 作用 |
| --- | --- |
| `highlight(target?)` | 打开部件高亮叠层；省略时等同 `{ type: 'all' }`，会替换当前过滤 |
| `clearHighlight()` | 关闭高亮叠层 |
| `isHighlighting()` | 高亮是否开启 |
| `getHighlightTarget()` | 当前过滤；关闭时为 `null` |
| `listMountedParts()` | 当前已挂载部件快照（`partId` / `slotId` / `element`） |
| `partFromNode(node)` | 向最近的 `[data-part]` 祖先（或自身）取部件 id |
| `partAtPoint(x, y)` | 视口坐标下最上层命中的部件 id |
| `subscribe(listener)` | 订阅挂载 / 高亮 / 出血 / 比例变化；返回取消函数 |

`HighlightTarget`：

| `type` | 含义 |
| --- | --- |
| `all` | 全部已挂载部件 |
| `part` | 单个 `id` |
| `parts` | `ids` 列表 |
| `slot` | 落在该插槽 id 下的部件（看最近 `[data-slot]`） |

健康路径上的 `PartSlot` / `PageBoundary` 会包一层 `display: contents` 的 `[data-part]` 标记，并在挂载时登记到调试注册表。跳过边界（`boundary="none"`）时不写标记。部件注册与插槽见 [部件与插槽](./05-part.md)。

## 出血线

| 名称 | 作用 |
| --- | --- |
| `showBleed()` | 显示安全区出血线（只开关，无绘制选项） |
| `hideBleed()` | 关闭 |
| `isBleedVisible()` | 是否显示 |

叠层绑定 `viewportStore.safeInsets`（由 `applyViewport` / `applySafeArea` 写入）：`core:display.safeAreaUi` 开时为 `env(safe-area-inset-*)`，关时四边为 0。画布已放进这个矩形，部件不再读 `--wsde-safe-*`。不接受自定义 inset，也不用视口百分比回退。设置项见 [设置段](./15-settings.md)；令牌见 [样式与令牌](./11-style.md)。

```js
window.wsde?.showBleed()
```

## 屏幕比例

| 名称 | 作用 |
| --- | --- |
| `showAspect()` | 显示比例叠层（只开关，无目标比例选项） |
| `hideAspect()` | 关闭 |
| `isAspectVisible()` | 是否显示 |

叠层绑定 `viewportStore.layout`（contain 后的画布几何，与 `.wsde-layout-stage` / `--wsde-offset-*` / `--wsde-scale` 一致）：画出当前画布框与边带，标签为视口与设计比例。不接受自定义 `W:H` 目标框。

```js
window.wsde?.showAspect()
```

## DOM 与样式类

- 标记：`[data-part]`（部件）、最近祖先 `[data-slot]`（插槽，供 `slot` 过滤）。
- 根上的开关属性（叠层激活时）：`data-wsde-debug-highlight` / `data-wsde-debug-bleed` / `data-wsde-debug-aspect`。
- 样式类前缀：`wsde-debug-highlight-*`、`wsde-debug-bleed-*`、`wsde-debug-aspect-*`（另有根层 `wsde-debug-root`）。叠层 `pointer-events: none`，不抢交互。

## 分层

代码在 `infra/debug`。与 [设置段](./15-settings.md) 一样会触达部件信息，但**不**从 `infra` 反向依赖 `part`：挂载登记由 `part/boundary` 调用 `registerPartMount`（`part` → `infra`，方向合法）。boot 始终挂上 `window.wsde`（主机 API）；DEV 再混入调试方法并渲染 `DebugOverlays`。依赖方向见 [目录与分层](./01-layer.md)；完整目录树见 [客户端目录与分层](./17-directory.md)。

## 边界

- 生产构建不要假设叠层存在：先判 `getWsde()`（生产为 `null`）；`window.wsde` 在生产仍有主机 API，但无调试方法。
- 不要自造临时 DOM 高亮或安全区框；走本页 API，便于与挂载登记一致。
- 调试方法直接挂在 **`window.wsde`**（与主机同一对象），不要另挂 `window.alliance`、`alliance.debug` 或嵌套的 `window.wsde.debug`。
- `resetWsde` 只给测试清状态，应用与控制台日常调试用 `clearHighlight` / `hideBleed` / `hideAspect`。
- 本机能力探测见 [平台探测](./16-platform.md)；后端能力集见 [连接与兼容模式](./02-connection.md)。二者都不是本叠层。
