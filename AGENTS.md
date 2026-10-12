## 约束

- 按游戏创作的思路来设计，代码与结构遵循领域驱动设计
- 引擎机制保持扩展性，不保证官方规则也会迭代
- 尽量复用前端生态，减少自行实现，优先采用轻量库
- 代码以 GPL-3.0-or-later 发布，新文件沿用各包的 `license` 字段
- 禁止提交任何游戏素材文件）

## 技术栈

- Three + React
- Node 22
- PNPM 10 + Vite + Vitest

## 格式与工具

- 缩进 2 空格，LF 换行（见 `.editor.config`）
- 格式与 lint 以根目录 `biome.json` 为准
- 大仓通用依赖统一放在 `pnpm-workspace.yaml` 的 `catalog` 中，已有条目优先使用 `catalog:` 引用

## 开发规范

见 [CODE_OF_CONDUCT](.github/CODE_OF_CONDUCT.md)
