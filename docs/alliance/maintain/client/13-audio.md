---
title: 音效线索
description: 客户端怎样按线索角色选取声音：线索表的合并、曲目的选择、界面与对局事件对应的线索，以及音量。
---

# 音效线索

客户端只按线索角色取声音，不认文件名。线索表把角色映射到 `audio:` 资源键，来自资源包清单的应用段 `app.cues`。

线索表的格式与校验由 `@alliance/data` 的 schema 定义，见 [资源从哪里来](../data/03-resource.md)。

## 示例

```text
ui.click        →  按钮按下
bond.levelUp    →  自己的盟约层数增长
battle.deploy   →  战场上部署干员
bgm.prep        →  备战曲目：前奏与循环
```

## 线索角色

| 角色 | 形式 | 用途 |
| --- | --- | --- |
| 界面 | `ui.<名>` | 界面与对局事件 |
| 盟约 | `bond.<名>` | 盟约层数变化 |
| 战斗 | `battle.<名>` | 当前显示的战场上的事件 |
| 曲目 | `bgm.<曲目>` | 前奏与循环一对 |
| 首领曲目 | `bossBgm.<首领 id>` | 前奏与循环一对 |
| 作战曲目表 | `combat` | 按回合区间选曲，每项 `{ rounds: { from, to? }, intro?, loop? }` |

`combat` 的项没有 `to` 时，覆盖从 `from` 起的所有回合。

## 合并

客户端按资源层的顺序合并各层的线索表：

- 后层按角色或曲目名覆盖前层。
- `combat` 整表替换。

## 对局快照

服务端宣布开局时，客户端把当时的资源与目录冻结为本局的快照，对局内不变。音效从快照中取声音。

- 开发构建在绑定快照时用 `console.warn` 列出没有任何层发布的线索键。
- 缺键只是不播放，不阻塞对局。

## 曲目选择

| 屏幕或阶段 | 曲目角色 |
| --- | --- |
| 对局外 | `lobby` |
| `LOBBY`、`INFO_CHECK`、`BAND_DRAFT`、`BATTLE_CHECK`、`RESULT` | `lobby` |
| `COMBAT` | `combat` |
| `UNITE` | `unite`，缺省用 `combat` |
| `FINAL_ASSAULT` | `boss:<首领 id>`，缺省用 `boss` |
| `HIDDEN_CORE` | `boss:<隐秘首领 id>`，缺省用 `boss` |
| 其余阶段 | `prep` |

作战时按当前回合在 `combat` 中选曲。没有覆盖当前回合的项时，用 `bgm.combat`。

## 界面线索

| 事件 | 线索 |
| --- | --- |
| 按钮按下 | `ui.click` |
| 切换分页或选项 | `ui.tab` |
| 标题页进入 | `ui.start` |
| 连接从在线断开 | `ui.disconnect` |
| 房间里有其他玩家入座 | `ui.joinRoom` |
| 服务端宣布开局 | `ui.matchSucceed` |
| 意图被拒绝 | `ui.error` |
| 加入或创建房间被拒绝 | `ui.matchFail` |

意图被接受时按意图类型播放：

| 意图 | 线索 |
| --- | --- |
| `g.buy` | `ui.buy` |
| `g.sell` | `ui.sell` |
| `g.refresh` | `ui.refresh` |
| `g.freeze` | `ui.freeze` |
| `g.levelUp` | `ui.levelup` |
| `g.move` | `ui.drop` |
| `g.equip` | `ui.equip` |
| `g.art` | `ui.artPlace` |
| `g.reward`、`g.choice` | `ui.pick` |
| `g.band` | `ui.confirm` |
| `g.bandSkip`、`g.destroy` | `ui.back` |
| `g.infoReady` | `ui.ready` |
| `g.emote` | `ui.emote` |
| `room.leave` | `ui.matchCancel` |

## 对局线索

进入阶段：

| 阶段 | 线索 |
| --- | --- |
| `ROUND_START` | `ui.roundStart` |
| `PREP` | `ui.rest` |
| `COMBAT` | `ui.battleStart` |
| `UNITE` | `ui.defenceUnite` |
| `FINAL_ASSAULT` | 单人 `ui.bossRoundSingle`，多人 `ui.bossRoundTeam` |
| `HIDDEN_CORE` | `ui.bossRoundSecret` |
| `SP_DRAFT` | `ui.draft` |

其他对局事件：

| 事件 | 线索 |
| --- | --- |
| 选队时自己先手 | `ui.goFirst` |
| 轮到自己 | `ui.yourTurn` |
| 自己的 LP 降到 5 及以下 | `ui.danger` |
| 首领血量归零 | `ui.killBoss` |
| 备战最后 5 秒，每秒 | `ui.timer` |
| 新的播报 | `ui.broadcast` |
| 他人的表情 | `ui.emote` |
| 结算失败 | `ui.settlementFail` |
| 结算胜利，单人 | `ui.settlementSucceed` |
| 结算胜利，多人 | `ui.settlementTeam` |
| 自己的盟约层数增长（`m.layer`） | `bond.levelUp` |

## 战斗结束

战斗结束的线索按自己的 LP 扣减判定：

| 扣减 | 线索 |
| --- | --- |
| 大于 0 | `ui.battleOverReduce` |
| 联防后没有减少 | `ui.battleOverNoReduce` |
| 其余 | `ui.battleOverNormal` |

- 状态带有结算数据中自己的 LP 扣减时，按它判定。兼容层只在联防后给出结算数据。
- 没有时，在阶段离开 `SETTLE` 后的第一个状态，按与开战时相比的 LP 判定。
- 判定不依赖 LP 推送与阶段推送的先后。

## 战斗线索

当前显示的战场上的事件，按 `spawn` 事件得知单位的阵营与种类：

| 事件 | 线索 |
| --- | --- |
| 部署干员 | `battle.deploy` |
| 部署召唤物 | `battle.tokenDeploy` |
| 干员阵亡 | `battle.charDie` |
| 召唤物阵亡 | `battle.tokenDie` |
| 敌人倒下 | `battle.enemyDie`；阶 2 及以上为 `battle.enemyDieHeavy` |
| 敌人攻击我方 | `battle.enemyHit` |
| 治疗 | `battle.heal` |
| 漏怪 | `battle.leak` |

单位各自的攻击、受击、技能音效与语音不是线索角色，属于单位的资源引用。

## 技能音库

单位的攻击、受击音效不是线索角色，而按单位音库选取。核心战斗事件与音效线索可带 `skillSlot`（技能槽下标）。

`infra/audio/bank.ts` 的 `skillBankOf(banks, kind, skillSlot?)`：

- `kind` 为 `attack` 或 `hit`
- 有有效的 `skillSlot`，且该槽在 `banks.attacks` / `banks.hits` 里有键时，用技能模式音库
- 否则用普通 `banks.attack` / `banks.hit`
- 都没有时返回 `null`，该次不播

赛季编译在 `alliance/data` 用 `pickModeAttacks` / `pickModeHits` 收集技能模式音库键。

## 兼容模式

兼容层把 master 清单的 `audio.sfx.ui`、`audio.sfx.battle`、`audio.bgm`、`audio.bossBgm` 按键名填进线索表，名单外的名字不填。master 的两首交替作战曲映射为 `combat` 的两项：回合 1 到 7，以及 8 起。

## 音量

| 通道 | 默认音量 |
| --- | --- |
| 总音量 `master` | 80 |
| 音乐 `music` | 60 |
| 音效 `sfx` | 80 |

- 每个通道有音量（0 到 100）与静音，在设置段 `core:audio` 里。
- 音乐与音效的增益是各自音量乘以总音量。
- 浏览器在第一次用户操作前拒绝播放时，该次播放静默。
