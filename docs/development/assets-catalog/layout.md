---
title: 目录
description: 资源目录包的目录结构与入口。
---

# 目录

```text
assets-catalog/
  key/
    asset-key.ts        种类表，键的解析、格式化与校验
  schema/
    issue.ts            守卫的问题类型与读取工具
    asset-file.ts       文件条目与按种类的文件规则
    needs-list.ts       需求清单
    raw-catalog.ts      原始目录
    pack-manifest.ts    包清单与 refs
    spine-meta.ts       Spine 侧车
  address/
    file.ts             键与文件到相对地址、文件 URL
    pack.ts             发布布局：包目录、清单地址、fileRoot
  resolver/
    overlay.ts          覆盖层、按键查找、fallbackId 回退、依赖展开
    refs.ts             refs 合并与查找
  cache/
    spine.ts            Spine 句柄缓存
    audio.ts            音频解码缓存
  test/                 跨多个模块的用例（.spec.ts）
  index.ts              包入口
```

单个源文件的用例放在源文件旁边，文件名用 `.test.ts`。

包只有一个入口 `.`，导出上面全部模块的公开 API。包内用 `package.json` 的 `imports` 别名互相引用（`#key/*.js`、`#schema/*.js`、`#address/*.js`、`#resolver/*.js`、`#cache/*.js`）。

`tsconfig.json` 的 `lib` 为 ES 与 DOM，不含 Node 类型；用例的 `tsconfig.test.json` 使用 Node 类型。

## 命令

在 `assets-catalog/` 目录内执行：

| 命令 | 作用 |
| --- | --- |
| `pnpm build` | 编译到 `dist/` |
| `pnpm lint` | 对源码与用例做类型检查 |
| `pnpm test` | 运行全部用例 |
