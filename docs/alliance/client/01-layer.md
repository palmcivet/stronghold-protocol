---
title: 目录与分层
description: 客户端的顶层目录、各层之间允许的依赖方向，以及跨目录导入使用的别名。
---

# 目录与分层

客户端按领域划分目录。目录分四层，上层可以依赖下层，下层不依赖上层。

## 目录

```text
alliance/client/
  infra/      基础设施
    boot/        启动与装配
    router/      路由表与菜单元数据
    connection/  WebSocket 连接与后端能力
    store/       会话、房间、对局视图与设置
    storage/     本地存储
    intent/      意图总线与按键映射
    resource/    资源清单、解析与预加载
    audio/       音效线索与播放
    text/        文案目录与格式化
    theme/       设计令牌与层叠顺序
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

- `infra` 不依赖上面任何一层。
- `infra/boot` 与 `infra/router` 是装配点，可以依赖领域：前者组装运行时并注册各领域的部件，后者收集页面。
- `ui` 只依赖 `infra/theme` 与 `infra/text`。
- `part` 不依赖 `shell` 与领域。
- `shell` 不依赖领域。
- 领域之间不互相导入。领域只共享 `@alliance/contract` 的类型与 `infra/store` 的状态。
- `match/` 的子目录只依赖 `match/` 根下的共享文件，不导入兄弟子目录。
- 测试文件不受以上规则约束。

这些规则由 dependency-cruiser 检查，写在 `test/infra/dependency.test.ts`，随 `pnpm test` 运行。

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
