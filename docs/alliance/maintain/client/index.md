---
title: 客户端
description: 盟约的浏览器客户端：技术栈、目录分层，以及各页说明。
---

# @alliance/client

`@alliance/client` 是盟约的浏览器客户端。它连接对局服务端，显示房间与对局，把玩家的操作作为意图发给服务端。

连接 master 后端时，客户端以兼容模式运行，见 [连接与兼容模式](./02-connection.md)。

## 技术栈

| 用途 | 库 |
| --- | --- |
| 界面 | React 19、React Aria（`react-aria-components`） |
| 路由 | TanStack Router（`@tanstack/react-router`） |
| 状态 | zustand |
| 校验 | valibot |
| 大数据存储 | idb-keyval |
| 构建与开发服务器 | Vite、Lightning CSS、browserslist |
| 测试 | Vitest、Testing Library、jsdom、fake-indexeddb |
| 检查 | Biome、stylelint、dependency-cruiser |

- 官方代码用 TSX。
- 样式是普通 CSS 与 CSS Modules，不用运行时 CSS-in-JS。
- 浏览器基线由 `package.json` 的 browserslist 给出：2021 年以后的版本。
- 客户端不依赖 Pixi。

## 入口

`index.html` 只有挂载点 `#app`。启动代码在 `infra/boot/main.tsx`，顺序如下：

1. 把默认令牌写进页面
2. 准备本地存储：适配器、服务端来源、旧键迁移、预读
3. 选定本标签的重连令牌
4. 装配连接、状态仓库、意图总线与战斗播放
5. 创建路由器并渲染

页面上的 `window.wsde` 提供 `enter`、`createRoom`、`joinRoom`、`submit` 与 `view`，供页面脚本、外壳与端到端测试驱动页面。

## 内容

- [目录与分层](./01-layer.md)：四层划分与依赖规则（完整目录树见 [客户端目录与分层](./17-directory.md)）
- [连接与兼容模式](./02-connection.md)：WebSocket 连接、能力集与意图总线
- [页面与路由](./03-route.md)：三个路由、在场状态与路由守卫
- [外壳与对话框](./04-shell.md)：外壳分层、对话框注册表、菜单入口与错误边界
- [部件与插槽](./05-part.md)：部件注册表、`replace`、`wrap` 与 `insert`
- [部件清单](./06-inventory.md)：各页的部件与插槽
- [按键](./07-keymap.md)：动作到按键的映射表
- [本地存储](./08-storage.md)：适配器、键格式、版本迁移与模组 id
- [身份与多标签](./09-identity.md)：重连令牌的选择与标签间协商
- [干员调配同步](./10-loadout.md)：三项配置的发送时机与生效时机
- [样式与令牌](./11-style.md)：CSS 命名、设计令牌与层叠顺序
- [文案与语言](./12-text.md)：命名空间键、语言包与回退
- [音效线索](./13-audio.md)：线索表、曲目选择、界面事件与技能音库
- [战场](./14-field.md)：三维舞台接线、地面半场、备战手势、战斗特效与键盘网格
- [设置段](./15-settings.md)：`defineSettingSection`、`getSetting` / `setSetting` / `useSetting` / `startSettings`、官方四段
- [平台探测](./16-platform.md)：`configurePlatform` / `probe` / `getPlatform`，不做 UA 嗅探
- [客户端目录与分层](./17-directory.md)：完整目录树、导入别名与 dependency-cruiser 检查
- [调试叠层](./18-debug.md)：DEV 下的部件高亮、出血线与 `window.wsde`
