---
title: 目录
description: 资源提取包的目录与缓存目录布局。
---

# 目录

```text
assets-extractor/
  source/                 来源适配器
    asset-source.ts       AssetSource、SourceHit、SourceContext 接口
    table.ts              来源表与 createSources
    path-table.ts         路径表（paths.json）的读取与校验
    repository.ts         git 来源共用的工作区打开、单一候选与命中构造
    name.ts               安全名、文件名工具
    yuanyan/ fexli/ ark-models/ fonts/ gamedata/   各来源的 adapter.ts
    arknights-assets/     adapter.ts 与 paths.json（界面图路径表）
    voice/                adapter.ts 与 paths.json（BGM 与音效路径表）
    local-client/python/  本机客户端提取脚本与依赖（Python）
  download/
    repo-cache.ts         浅克隆、稀疏检出、git 版本检查、重试与代理
    repo-index.ts         从树对象读出的文件列表与按名查找
    sparse.ts             由命中文件算出 cone 目录集合
    format.ts             文件格式校验
    ledger.ts             文件账本
  spine/                  图集规范化、骨架解析、Spine 组装与侧车
  font/                   WOFF2 编码
  catalog/
    extract.ts            一次提取：查找、检出、物化、写目录与报告
    needs.ts              读取并合并需求清单
    raw-catalog.ts        原始目录的规范化与序列化
    report.ts             报告类型
    cache-layout.ts       缓存目录布局
  port/                   文件与 git 进程端口
  script/extract.ts       pnpm extract 命令
  test/                   同时用到多个源文件的用例（.spec.ts）与夹具
    fixture/              用例读取的小样本：字体及其 WOFF2、Spine 骨架、图集与页图
  workspace.ts            由调用方给出的缓存目录得到本包根与缓存布局
  package-root.ts         按包名向上找到本包根
  index.ts                包的导出入口
```

单个源文件的用例与源码放在一起，文件名用 `.test.ts`。包内引用使用 `package.json` 的 `imports` 别名（`#source/*`、`#download/*` 等）。

## 缓存目录

`--cache <dir>` 指定，默认是命令工作目录下的 `.cache/assets`。

```text
<cache>/
  repos/<owner>/<repo>@<branch>/   浅克隆工作区，只检出命中的目录
  sources/<sourceId>/              适配器派生索引的位置（cacheLayout().sources）；git 来源直接读克隆工作区；pnpm extract:local 默认写到 sources/local-client/files/
  files/<address>                  规范化文件，按 assets-catalog 的文件地址存放
  catalog.json                     原始目录
  ledger.json                      文件账本
  report.json                      报告
```

`files/` 下的地址与 `assets-catalog` 的 `fileAddress` 一致：单文件种类为 `<kind>/<path>.<format>`，Spine 为 `spine/<path>/<name>`。
