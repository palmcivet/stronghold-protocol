---
title: 盟约
description: 盟约是「卫戍协议：盟约」的应用：赛季数据与资源包、对局协议，以及连接 master 后端。
---

# 盟约

盟约是本仓库里的应用，复刻《明日方舟》自走棋塔防玩法「卫戍协议：盟约」。它用四个库搭成一款游戏：

- [arknights-mission-core](../mission-core/index.md) 演算战斗
- [arknights-mission-renderer](../mission-renderer/index.md) 绘制战场
- [arknights-assets-catalog](../assets-catalog/index.md) 按键解析资源
- [arknights-assets-extractor](../assets-extractor/index.md) 在构建期取回资源

库文档只写库本身。应用怎样组织数据、发布资源、连接服务端，写在这一节。

## 内容

- [快速开始](./01-quick-start.md)：构建数据包，启动对局进程与开发服务器
- [架构](./02-architecture.md)：`alliance/` 下的各个包与它们的依赖
- [客户端](./client/index.md)：浏览器客户端的技术栈、分层、页面与部件
- [卫戍协议数据](./data/index.md)：赛季数据包、基础包与赛季包的编译，资源的发布布局与客户端加载
- [对局协议](./protocol/index.md)：对局进程的 HTTP 与 WebSocket 接口，房间、对局与作战消息
- [连接 master 后端](./compat/index.md)：master 资源表的映射、用例对照表与追溯标记

## 下一步

- 第一次运行：读 [快速开始](./01-quick-start.md)
- 想了解资源怎样从社区仓库到达浏览器：读 [资源从哪里来](./data/03-resource.md)
- 想接入对局服务：读 [对局协议](./protocol/index.md)
