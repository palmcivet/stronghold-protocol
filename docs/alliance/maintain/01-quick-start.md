---
title: 快速开始
description: 安装依赖，编译赛季数据包，并启动开发服务器。
---

# 快速开始

需要 Node 22 或更高版本与 pnpm。命令都在仓库根目录或所在包内执行。

## 安装与构建

```sh
pnpm install
pnpm build
```

`pnpm build` 在每个工作区包里运行各自的 `build`。

## 编译数据包

对局进程读取 `alliance/data/product/season/act2autochess/` 下的数据包，开发服务器还要读资源包。这些文件不在仓库里，要先编译：

```sh
cd alliance/data
pnpm compile:needs --season act2autochess
pnpm extract:media
pnpm compile:needs --season act2autochess
pnpm extract:media
pnpm compile:packet --season act2autochess
pnpm compile:needs --season act2autochess
pnpm extract:media
pnpm compile:derive --season act2autochess
pnpm compile:packs --season act2autochess
```

为什么要跑三遍，见 [编译](./data/02-compiler.md#流程)。

## 对局进程

`alliance/server` 是连接层：`connection/` 放 HTTP、地址、会话与 WebSocket，`entry/main.ts` 是 Vite 的 ssr 入口。包内没有 `start` 脚本。接口见 [对局协议](./protocol/index.md)，目录见 [架构](./02-architecture.md#目录)。

## 开发服务器

```sh
cd alliance/client
pnpm dev
```

Vite 开发服务器监听 `5173`，按发布布局提供 `/res/` 下的资源与 `/data/seasons/` 下的数据包，见 [地址与发布布局](./data/03-resource.md#地址与发布布局)。

## 下一步

- 想了解 `alliance/` 下各包的分工与数据流：读 [架构](./02-architecture.md)；依赖图见 [包依赖](./03-deps.md)
- 想写一个连接对局进程的客户端：读 [对局协议](./protocol/index.md)
