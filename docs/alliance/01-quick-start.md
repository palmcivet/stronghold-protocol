---
title: 快速开始
description: 安装依赖，编译赛季数据包，启动对局进程并检查健康状态。
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

对局进程读取 `app/data/product/season/act2autochess/` 下的数据包，开发服务器还要读资源包。这些文件不在仓库里，要先编译：

```sh
cd app/data
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

## 启动对局进程

```sh
cd app/server
pnpm build
pnpm start
```

进程默认监听 `0.0.0.0:3000`，用 `HOST`、`PORT` 修改。端口被占用时进程退出，并提示换一个 `PORT`。

检查健康状态：

```sh
curl http://127.0.0.1:3000/healthz
```

返回的 JSON 里 `ok` 为 `true`，`version` 是协议版本 `1`。字段见 [HTTP](./protocol/01-http.md#get-healthz)。

## 开发服务器

```sh
cd app/client
pnpm dev
```

Vite 开发服务器监听 `5173`，按发布布局提供 `/res/` 下的资源与 `/data/seasons/` 下的数据包，见 [地址与发布布局](./data/03-resource.md#地址与发布布局)。

## 下一步

- 想了解 `app/` 下各包的分工：读 [架构](./02-architecture.md)
- 想写一个连接对局进程的客户端：读 [对局协议](./protocol/index.md)
