---
title: 样式与令牌
description: 客户端的 CSS 命名规则、设计令牌怎样成为 CSS 自定义属性，以及层叠顺序。
---

# 样式与令牌

客户端用普通 CSS 与 CSS Modules，不用运行时 CSS-in-JS。颜色、字体、间距等取值来自设计令牌。基础组件只用令牌，主题就是一组令牌覆盖。

## 示例

令牌树中的路径用 `-` 连接，加上 `--wsde-` 前缀，成为 CSS 自定义属性：

```text
color.bg.0          →  --wsde-color-bg-0
color.accent.400    →  --wsde-color-accent-400
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
- 命名由 stylelint 的 `selector-class-pattern` 与 `custom-property-pattern` 检查，配置在 `stylelint.config.mjs`，`*.module.css` 单独覆盖。
- `pnpm lint` 运行 stylelint。格式等其余规则归 Biome。
- `cx(...)` 拼接类名，跳过空值。

## 设计令牌

令牌采用 W3C Design Tokens 格式（2025.10），定义在 `infra/theme/tokens.ts`。启动时 `installTheme` 把令牌写成 `tokens` 层里 `:root` 上的自定义属性。

| 类别 | 令牌组 |
| --- | --- |
| 颜色 | `color`：底、线、强调、状态、阶色、难度色、盟约色、富文本色等 |
| 字体 | `font`、`font-size` |
| 动效 | `ease`、`duration`、`motion` |
| 间距与形状 | `space`、`radius`、`stroke`、`shadow` |
| 尺寸 | `size`：HUD 条高、卡片宽、头像、触控最小尺寸等 |
| 断点 | `breakpoint`：`phone`、`tablet`、`desktop` |
| 层叠 | `layer` |

- `motion` 是所有时长的系数。系统要求减弱动效时，基础层把它设为 0，并取消过渡与动画。
- 媒体查询读不到自定义属性，断点令牌供脚本与容器查询使用。

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

`layer` 令牌给出界面各层的 `z-index`：

| 令牌 | 值 |
| --- | --- |
| `backdrop` | 0 |
| `screen` | 1 |
| `hud` | 10 |
| `banner` | 40 |
| `overlay` | 60 |
| `connection` | 75 |
| `modal` | 80 |
| `toast` | 90 |
| `tooltip` | 95 |

## 文字大小

个人配置的文字大小有四档：`sm`、`md`、`lg`、`xl`。所选档位写在根元素的 `data-text` 上，基础层据此把根字号设为 100%、112.5%、125% 或 137.5%。

## 构建

CSS 由 Lightning CSS 转换与压缩，目标浏览器取自 browserslist。

## 基础组件

`ui/` 用 React Aria 实现，只读令牌，经包入口导出给模组。

通用：按钮、开关、面板、计量条、滑块、输入框、选项组、动作菜单、对话框与模态、全屏覆盖页、弹层、工具提示、提示栈、分页、列表与卡片网格、卡片、下拉选择、搜索框、折叠、进度条、加载圈、倒计时、头像框、徽标与标签、图标、富文本（官方描述标记）、按键提示、空状态与错误面板、布局件。

游戏专用（仍在 `ui/`，不注册部件 id）：`TierChip`、`PriceHex`、`BondDisc`、`LpTower`、`SevenSeg`、`PhaseCapsule`、`DifficultyTag`、`UnitThumb`、`EmoteArt`。

