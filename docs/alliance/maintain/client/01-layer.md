---
title: 目录与分层
description: 客户端四层划分与依赖规则，说明扩展应落在哪一层。
---

# 目录与分层

客户端按领域划分目录。目录分四层，上层可以依赖下层，下层不依赖上层。完整目录树、导入别名与 dependency-cruiser 检查见 [客户端目录与分层](./17-directory.md)。

## 层

| 层 | 目录 |
| --- | --- |
| 领域 | `entry`、`profile`、`loadout`、`guide`、`room`、`match` |
| 外壳 | `shell` |
| 部件与基础组件 | `part`、`ui` |
| 基础设施 | `infra` |

## 依赖规则

- `infra` 不依赖上面任何一层；例外：`infra/settings` 可依赖 `part`（注册个人配置分页），不得依赖 `ui`、`shell` 或领域。`infra/debug` 同类会用到部件信息，但挂载登记只在 `part/boundary`（`part` → `infra`），不构成 `infra` → `part`；见 [调试叠层](./18-debug.md)。
- `infra/boot` 与 `infra/router` 是装配点，可以依赖领域：前者组装运行时并注册各领域的部件，后者收集页面。
- `ui` 只依赖 `infra/theme` 与 `infra/text`。
- `part` 不依赖 `shell` 与领域。
- `shell` 不依赖领域。
- 领域之间不互相导入。领域只共享 `@alliance/contract` 的类型与 `infra/store` 的状态。
- `match/` 的子目录只依赖 `match/` 根下的共享文件，不导入兄弟子目录。
- 测试文件不受以上规则约束。
