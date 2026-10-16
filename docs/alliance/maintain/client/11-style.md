---
title: 样式与令牌
description: 客户端的 CSS 命名规则、设计令牌怎样成为 CSS 自定义属性，以及层叠顺序。
---

# 样式与令牌

客户端用普通 CSS 与 CSS Modules，不用运行时 CSS-in-JS。颜色、字体、间距等取值来自设计令牌。组件只用令牌，主题就是一组令牌覆盖。令牌与组件的说明见 `@alliance/ui`。

## 示例

令牌树中的路径用 `-` 连接，加上 `--wsde-` 前缀，成为 CSS 自定义属性：

```text
color.surface.base  →  --wsde-color-surface-base
palette.mint.500    →  --wsde-palette-mint-500
layer.tooltip       →  --wsde-layer-tooltip
```

## CSS 命名

| 对象 | 规则 | 例 |
| --- | --- | --- |
| 对模组公开的类名 | `wsde-` 前缀的 kebab-case | `wsde-visually-hidden` |
| 对模组公开的自定义属性 | `wsde-` 前缀的 kebab-case | `--wsde-color-accent-400` |
| CSS Modules 内部类名 | camelCase | `.slotList` |
| CSS Modules 局部自定义属性 | camelCase | `--gap` |

- CSS Modules 文件可以读取公开令牌。
- 选择器与自定义属性命名由 stylelint 检查（`*.module.css` 有单独规则）。检查命令与配置见 [客户端目录与分层](./17-directory.md#样式检查)。
- `cx(...)` 拼接类名，跳过空值。

## 设计令牌

令牌的定义、色调、尺寸单位与层级见 `@alliance/ui` 的主题文档（`alliance/ui/src/theme/theme.mdx`）。客户端启动时调用 `@alliance/ui/theme` 的 `installTheme()` 把令牌写入页面。

## 层叠顺序

```text
@layer reset, tokens, base, components, mods, overrides;
```

| 层 | 内容 |
| --- | --- |
| `reset` | 盒模型与元素默认样式的重置 |
| `tokens` | 设计令牌 |
| `base` | 根元素的颜色与字体、焦点样式、文字大小、减弱动效 |
| `components` | 组件样式 |
| `mods` | 模组样式 |
| `overrides` | 最终覆盖 |

## 图层次序

各层的 `z-index` 令牌见 `@alliance/ui` 的主题文档。

## 字体

| 令牌 | 用途 | 来源 |
| --- | --- | --- |
| `font.body` | 中文正文与界面 | `@fontsource-variable/noto-sans-sc` |
| `font.formal` | 标题与评语 | `@fontsource-variable/noto-serif-sc` |
| `font.number` | 数字 | Bender，其次 `@fontsource/rajdhani` |
| `font.display` | 英文标题与微标签 | Novecento Wide，其次 `@fontsource-variable/saira`（宽度轴 125%） |

开源字体随客户端打包。资源包有 `font:*` 时，`fonts.css` 把官方字体族（如 `Bender`、`Novecento Wide`）按字重声明出来，字体栈把它们排在开源替代之前。这份样式表要等连上服务器、资源仓库加载之后才插入，在那之前界面用开源替代。开发服务器把 `/fonts` 代理到 master。

`body` 的字号是 `font.body` 的阶梯档，没单独写字号的文字（含按钮，以及传送到 `body` 的浮层）都跟着画布缩放，并跟随个人配置的文字大小。

## 基础层工具类

数字字体、展示字体、角标与读屏专用类等工具类，见 `@alliance/ui` 的主题文档。

## 文字大小

个人配置的文字大小有四档：`sm`、`md`、`lg`、`xl`。所选档位写在根元素的 `data-text` 上，基础层据此把 `--wsde-text-factor` 设为 1、1.125、1.25 或 1.375。字号令牌乘 `--wsde-text-dp`，不改浏览器根字号。

## 视口与安全区

设计画布 1920×1080，等比 contain 放进视口。根元素带：

| 属性 / 变量 | 含义 |
| --- | --- |
| `data-orientation` | `landscape` 或 `portrait` |
| `data-safe-area` | `on` / `off`（异形屏 UI 适配） |
| `data-text` | 文字大小档位 |
| `--wsde-scale` | 设计尺寸到可用矩形的 contain 缩放 |
| `--wsde-offset-x` / `--wsde-offset-y` | 画布在视口中的偏移（边带铺背景） |
| `--wsde-design-width` / `--wsde-design-height` | 设计画布尺寸，由 `DESIGN_SIZE` 写入 |
| `--wsde-dp` | `calc(var(--wsde-scale) * 1px)`，盒子尺寸的 1 设计像素 |
| `--wsde-text-dp` | `--wsde-dp` 乘文字大小系数 |
| `--wsde-safe-*` | 安全区探针；关闭适配时为 `0`。部件不读 |

竖屏仍显示旋转提示。模块 CSS 用 `%`、`fr`、`em`、时间和角度；盒子用 dp，字号用 text dp。线宽保留 `1px` / `2px`。`rem`、视口单位和其他 `px` 由 stylelint 禁止。例外是 `infra/theme/layer.css` 里的画布宿主、边带和旋转提示。代码里拼出的长度也一样：内联样式写 `calc(var(--wsde-dp) * N)`，`test/infra/units.test.ts` 检查源码里没有 `rem` 与视口单位。

## 构建

CSS 由 Lightning CSS 转换与压缩，目标浏览器取自 browserslist。

