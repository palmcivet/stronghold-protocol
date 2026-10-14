---
title: 文案与语言
description: 界面文本怎样经命名空间键取得，语言包与回退顺序，以及 master 后端消息的翻译。
---

# 文案与语言

界面文本都经命名空间键取得，代码在 `infra/text`。中文是源文本，其他语言由语言包提供。

## 示例

源目录 `infra/text/catalog/core.ts` 中的一项：

```text
"core:connection.reconnecting"  →  "连接已断开，{seconds} 秒后重连"
```

调用 `t("core:connection.reconnecting", { seconds: 3 })` 时，参数的名称与类型由源文本中的占位符推导，缺少参数是类型错误。

## 命名空间

| 前缀 | 来源 |
| --- | --- |
| `core:` | 界面文本，源目录在客户端里 |
| `data:` | 数据包文本，如 `data:chess.<id>.name`，随赛季数据载入 |
| `server:` | 服务端消息，如 `server:error.<code>` |

- `core:phase.<阶段>` 的源文本取自 `@alliance/contract` 的阶段名。
- `server:error.<code>` 的源文本取自 `@alliance/contract` 的错误文本，也就是 master 的 msgid。

## 取文本

| 函数 | 用途 |
| --- | --- |
| `t(key, params)` | 类型化的键与参数 |
| `lookup(key, params)` | 运行时拼出的键，如阶段或难度 |
| `useText()` | 在组件中取 `t`，语言或数据文本变化时重新渲染 |
| `dataName(table, id)` | 数据记录的名称，没有时显示 id |
| `shownName(table, id)` | 数据记录的名称，没有时显示占位文本 |
| `errorText(code, text)` | 服务端错误码的文本，没有键时显示服务端给出的文本 |

未知的键按原样显示。

## 消息格式

消息格式是 ICU MessageFormat 的子集：

- `{name}`：替换为参数值
- `{count, plural, one {…} other {…}}`：按语言的复数规则选择分支，分支内 `#` 替换为数值

没有给值的占位符按原样保留。

## 语言

| 语言 | 来源 |
| --- | --- |
| `zh-Hans` | 源文本，也是基础语言 |
| `en` | `infra/text/catalog/en.ts` |

- 所选语言存在个人配置里，并写到根元素的 `lang`。
- 英文语言包只能包含源目录里有的键。
- 已完成页面的键组，英文语言包必须齐全，由 `en.test.ts` 检查。

## 回退

取一个键的文本时依次查：

1. 玩家所选语言的语言包
2. 源文本
3. 当前赛季的 `data:` 文本

开发构建中，所选语言缺少某个界面键时，在控制台提示一次。

## master 后端的消息

master 后端的消息是 `{ text, msgid, params }`。客户端按 msgid 查找源文本相同的键：

- 找到时，按玩家语言显示这个键。
- 找不到时，显示 `text`。

对照表由源目录的源文本生成，不单独维护。
