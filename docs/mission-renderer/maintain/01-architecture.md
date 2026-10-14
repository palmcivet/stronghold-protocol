---
title: 架构设计
description: 源码结构、依赖边界、命名规则、每帧视图系统的顺序与骨骼运行时的实现。
---

# 架构设计

## 源码结构

| 目录 | 内容 |
| --- | --- |
| `contract/` | 对外的数据类型：视图、命令、指针、表现数据、线索、音效 |
| `runtime/` | 舞台、喂数、相机变换、剔除、命名空间注册表 |
| `ground/` | 地面：布局、网格、材质、地形资源包 |
| `actor/` | 演员：实体、头顶条、替身、骨骼运行时 |
| `effect/` | 线索、线索绑定、特效表与引擎的特效种类 |
| `audio/` | 音效线索 |
| `pointer/` | 拾取 |
| `port/` | 资源端口与骨骼端口 |

包内用 `#<目录>/*.js` 子路径互相引用，入口 `index.ts` 汇总公开导出。

## 依赖

| 依赖 | 用途 |
| --- | --- |
| `arknights-mission-core` | 快照、事件与地图类型 |
| `arknights-assets-catalog` | 资源键、解析器与 Spine 缓存 |
| `three`（peer） | 场景、相机、渲染器、纹理 |
| `@pixi-spine/*`、`@pixi/*` | Spine 3.8 骨骼的解析与姿态计算 |

`biome.json` 守住 Pixi 的边界：

- 只有 `actor/skeleton/` 可以引入 `@pixi/*` 与 `@pixi-spine/*`（`noRestrictedImports`；测试文件不在这条限制里）
- 任何非测试文件都不能以值的方式引入 Pixi 的渲染器、显示对象或纹理（`Application`、`Renderer`、`autoDetectRenderer`、`Spine`、`Container`、`Sprite`、`Graphics`、`Mesh`、`SimpleMesh`、`Texture`、`BaseTexture`、`DisplayObject`；Grit 插件 `lint/no-pixi-display.grit`）。`import type` 与行内 `type` 不在此列。只用骨骼数据与姿态，绘制交给 Three

## 命名

- 公开类型与创建函数带 `Mission` 前缀，如 `MissionBoard`、`createMissionStage`
- 公开常量带 `MISSION_` 前缀
- 只做计算的函数不带前缀，如 `cueFor`、`impostorDue`、`hudReadoutsOf`
- 可扩展的条目（特效种类、读数）用命名空间 id `<namespace>:<name>`，引擎自己的用 `mission:`

## 每帧顺序

`update` 按 `MISSION_VIEW_SYSTEM_ORDER` 依次运行视图系统：

| 系统 | 做什么 |
| --- | --- |
| `ingest` | 取本帧的快照与释放的事件 |
| `lifecycle` | 建立、移除演员，切换动作 |
| `position` | 摆放根节点 |
| `facing` | 设置朝向 |
| `skeleton` | 推进动画 |
| `impostor` | 替身取槽、轮流重画 |
| `hud` | 更新头顶条与读数 |
| `effect` | 推进与启动特效 |
| `audio` | 发出音效线索 |
| `cull` | 视锥剔除 |
| `release` | 释放淡出完的演员 |

## 骨骼运行时

- 姿态由 `@pixi-spine/runtime-3.8` 计算，顶点、贴图坐标与颜色写入 Three 的 `BufferGeometry`
- 裁剪：先关闭颜色写入，把裁剪多边形写进模板缓冲；被裁剪的部分以模板相等测试绘制；未闭合的裁剪在骨骼末尾结束
- 换用别的运行时只需实现 `MissionSkeletonRuntime`，演员不依赖具体实现
