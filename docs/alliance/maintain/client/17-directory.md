---
title: 客户端目录与分层
description: alliance/client 的完整目录树、导入别名与 dependency-cruiser 检查；依赖规则见目录与分层。
---

# 客户端目录与分层

客户端按领域划分目录。目录分四层，上层可以依赖下层，下层不依赖上层。依赖规则以 [目录与分层 · 依赖规则](./01-layer.md#依赖规则) 为准。

## 目录

```text
alliance/client/
  infra/      基础设施
    boot/        启动与装配
    router/      路由表与菜单元数据
    connection/  WebSocket 连接与后端能力
    store/       会话、房间、对局视图；设置聚合再导出
    storage/     本地存储
    settings/    设置段注册与读写
    platform/    本机能力探测
    debug/       DEV 调试叠层（高亮、出血线、比例）
    intent/      意图总线与按键映射
    resource/    资源清单、解析与预加载
    audio/       音效线索与播放
    text/        文案目录与格式化
    theme/       设计令牌、视口与层叠顺序
  ui/         基础组件（React Aria）与游戏专用小件
  part/       部件注册表、插槽、对话框注册表与错误边界
  shell/      外壳：横幅、提示、菜单入口、对话框层与离开流程
  entry/      入口页
  profile/    个人配置
  loadout/    干员调配
  guide/      玩法说明
  room/       房间页
  match/      对局页
    briefing/    简报
    strategy/    选策略
    hud/         对局 HUD
    settlement/  结算
    field/       战场
    playback/    战斗播放
  test/       跨文件的测试
```

## 层

| 层 | 目录 |
| --- | --- |
| 领域 | `entry`、`profile`、`loadout`、`guide`、`room`、`match` |
| 外壳 | `shell` |
| 部件与基础组件 | `part`、`ui` |
| 基础设施 | `infra` |

## 依赖规则

依赖规则见 [目录与分层 · 依赖规则](./01-layer.md#依赖规则)。由 dependency-cruiser 检查，写在 `test/infra/dependency.test.ts`，随 `pnpm test` 运行。

## 导入别名

跨目录的导入一律使用 `package.json` 的 `imports` 别名，每个顶层目录一个：

```text
#infra/*  #ui/*  #part/*  #shell/*
#entry/*  #profile/*  #loadout/*  #guide/*  #room/*  #match/*
#test/*
```

- 写法如 `#infra/store/hook.js`，扩展名写 `.js`。
- 同一目录内用相对路径。
- 不写跨目录的 `../` 或 `./子目录/`。
- 别名由 TypeScript、Vite 与 Vitest 直接解析，不需要插件。

同一个测试文件还检查：每个别名都解析到客户端里的文件，没有跨目录的相对导入。

## 存储适配器契约

适配器契约测试在 `infra/storage/backend-contract.ts`，内存适配器与浏览器适配器都运行这套测试。对外的适配器形状与宿主注入见 [本地存储](./08-storage.md#适配器)。

## 样式检查

- 命名由 stylelint 的 `selector-class-pattern` 与 `custom-property-pattern` 检查，配置在 `stylelint.config.mjs`，`*.module.css` 单独覆盖。
- `pnpm lint` 运行 stylelint；格式等其余规则归 Biome。
- 设计令牌定义在 `infra/theme/tokens.ts`。

对外的命名约定与令牌类别见 [样式与令牌](./11-style.md)。

