---
title: 传输
description: 每个仓库分支一次浅克隆、按命中目录做稀疏检出，以及重试、代理、刷新与离线。
---

# 传输

提取不下载整个仓库。每个「仓库@分支」只做一次浅克隆，文件列表从 git 的树对象读出；文件内容只在命中后、按所在目录检出。这部分由 `GitRepoCache` 完成。

## 克隆

- 启动时检查 `git --version`，低于 2.25 时报错退出；2.25 是 cone 模式 `sparse-checkout` 的最低版本
- 每个「仓库@分支」第一次用到时执行：

  ```bash
  git clone --depth 1 --filter=blob:none --sparse --single-branch \
    --branch <branch> <url>
  ```

- 先克隆到临时目录，再改名为 `<cache>/repos/<owner>/<repo>@<branch>/`
- `arknights-assets` 与 `voice` 是同一仓库的两个分支，各有一份克隆

## 文件列表

- 文件列表来自 `git ls-tree -r -z --name-only HEAD`，不下载文件内容
- `git rev-parse HEAD` 的结果记为条目的 `source.revision`

## 稀疏检出

一轮查找结束后，按仓库汇总命中的文件，算出最小的父目录集合：

- 被其他目录覆盖的目录去掉，根目录下的文件不计
- 第一次用 `git sparse-checkout set --cone`，之后用 `add`
- 已检出的目录保留，集合只增不减
- 目录名含 `*?[]\`（如 `[uc]battlecommon`）且 git 为 2.36 及以上时加 `--skip-checks`，由 git 在模式文件里转义

## 重试与超时

- 克隆、`fetch`、检出失败时最多试 3 次
- 指数退避：从 400 ms 起每次翻倍，另加随机抖动
- 单个 git 进程默认 600 秒超时，用 `--timeout` 修改
- 设置 `GIT_TERMINAL_PROMPT=0`，git 不会停下来等输入

## 代理

`--proxy <url>` 作为以下环境变量传给 git：

- `HTTPS_PROXY`、`HTTP_PROXY`、`ALL_PROXY`
- 以及它们的小写形式

## 刷新与离线

- `--refresh-index`：对已有克隆执行 `fetch --depth 1 --filter=blob:none origin <branch>`，再 `reset --hard FETCH_HEAD`
- `--offline`：不克隆、不 `fetch`、不检出
  - 没有克隆的来源不可用
  - 没有检出的文件按缺失报告
- 两者不能同时使用

调用方可以通过 `extractCommand` 的 `deps.repos` 换掉克隆缓存，见 [核心接口](./06-api.md#命令)。测试替身见 [架构设计](../maintain/01-architecture.md#测试替身)。
