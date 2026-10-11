---
title: 对局
description: 一局开始之后的意图，以及服务端推送的公开状态、个人状态和结算。
---

# 对局

`room.start` 之后，`g.*` 进入这一局。`g.leave` 由房间按永久离开处理，不到达对局规则。观战者除 `g.watch` 与离开、配装外，其余 `g.*` 回复 `SPECTATOR`。已被淘汰的玩家发需要操作的意图时回复 `ELIMINATED`。

阶段名出现在 `m.public.phase`：`INFO_CHECK`、`BAND_DRAFT`、`BATTLE_CHECK`、`ROUND_START`、`SP_DRAFT`、`PREP`、`COMBAT`、`UNITE`、`SETTLE`、`FINAL_ASSAULT`、`HIDDEN_CORE`、`RESULT`。阶段不对的意图回复 `WRONG_PHASE`。

带合法 `rid` 且被接受的意图回复 `ok`。金币、棋子和胜负以随后的 `m.public` / `m.private` 为准。

## 意图

朝向取 `UP`、`RIGHT`、`DOWN`、`LEFT`。缺省朝向为 `RIGHT`。棋盘行列在 19×21 的舞台格内，行 0 在下方。手牌下标 0–9。近战默认只能站地面。装备的模组带 `meleeOnHighGround` 时，这名棋子也可以站远程位。

| 消息 | 字段 | 作用 |
|---|---|---|
| `g.infoReady` | 无 | 确认本局信息。仅 `INFO_CHECK` |
| `g.band` | `bandId` | 选择策略 |
| `g.bandSkip` | 无 | 跳过本次策略选择 |
| `g.bandFocus` | `bandId` 可省略或为 `null` | 草稿界面当前高亮的策略。倒计时结束时若它仍可选则采用。省略或 `null` 表示清除。非 `BAND_DRAFT` 为 `WRONG_PHASE`，已选过为 `ALREADY`，不可选为 `BAD_TARGET` |
| `g.buy` | `slot`：0–15 | 购买商店槽 |
| `g.refresh` | 无 | 刷新商店 |
| `g.freeze` | 无 | 冻结或解冻商店 |
| `g.levelUp` | 无 | 升级调度。已满级为 `MAX_LEVEL`，资金不足为 `NO_FUNDS` |
| `g.sell` | `uid` | 出售。`uid` 为 1 到 2³¹ 的整数 |
| `g.move` | `uid`，`to`，可选 `dir` | `to` 为 `{ "area": "board", "row", "col" }` 或 `{ "area": "hand", "idx" }`。落到自己所在格上是改朝向。非法格为 `BAD_TILE` |
| `g.equip` | `itemUid`，`targetUid`，可选 `replaceUid` | 把装备给到目标。目标两格都满时，`replaceUid` 指定被替换的那一件；省略则替换更早的一件。不是目标身上的装备时为 `BAD_TARGET` |
| `g.art` | `itemUid`，`row`，`col`，可选 `dir` | 把神器放到格子上 |
| `g.destroy` | `uid` | 销毁手牌或临时区里的装备。已装备的不能销毁 |
| `g.reward` | `idx`：0–5 | 领取当前奖励 |
| `g.choice` | `idx`：0–5 | 机变选牌 |
| `g.ready` | `ready`：布尔 | 休整期准备。临时区非空时不能完成准备 |
| `g.emote` | `id` | 36 个官方表情 id 之一。服务端另有约 1 秒的发送间隔 |
| `g.watch` | `fieldId`：最长 32 | 观看一块战场或休整中的一名玩家。回复后推送 `m.field`，作战中还会带上该战场的起始或快照。受更紧的频率限制 |
| `g.autoplay` | `on`：布尔 | 托管。托管者发出与玩家相同的意图 |
| `g.pause` | `on`：布尔 | 仅独立模拟，且只在作战进行中可以暂停。合作对局为 `WRONG_PHASE`。暂停时 `m.public.paused` 为真，战场时钟、截止时间和本机战斗一起停 |
| `g.unitStats` | 可选 `seq` | 休整相关阶段查询自己棋盘单位的开战属性。回复是推送 `m.unitStats`。`seq` 原样返回，便于丢掉过期答复 |
| `g.leave` | 无 | 永久离开本局，由房间处理 |

`g.watch` 的 `fieldId`：普通战场为 `n:<playerId>`，联防为 `u`，首领半场为 `b1`、`b2`。休整期观看队友时也使用 `n:<playerId>`。

## `m.public`

房间内每人一份的公开状态。变化合并后发送，大约不超过每秒 10 次。内容未变则不发。

| 字段 | 含义 |
|---|---|
| `phase` `round` `lastRound` | 阶段、当前回合、最后一回合 |
| `deadline` `serverNow` | 阶段截止的毫秒时钟，以及当前服务器时钟 |
| `modeId` `difficulty` `stageId` | 模式、难度、地图 |
| `factions` | 本局阵营 |
| `disabledBonds` `drawnDisabledBonds` | 本局不激活的盟约。前者含模式固定禁用与抽出的禁用 |
| `bannedChess` | 本局禁用的干员 |
| `bossId` `hiddenBossId` | 首领与隐秘核心 |
| `bossRound` `hiddenRound` `spRound` | 首领回合、隐秘核心回合，以及本回合是否机变 |
| `combatMode` | `client`（默认，浏览器作战）或 `server`（进程环境 `SP_COMBAT=server`） |
| `paused` | 独立模拟是否暂停 |
| `players` | 每名玩家的公开行，见下表 |
| `fields` | 当前战场。`{ fieldId, kind, players, live, progress? }`。`kind` 为 `normal`、`unite`、`boss`、`hidden`。`progress` 在作战中出现：`{ killed, total, done }` |
| `teamLp` | 首领战共享生命，有则出现 |
| `bossHp` | `{ hp, max }`，有共享血池时出现 |
| `overtimeAt` | 最终攻势或隐秘核心开始扣生命的毫秒时钟 |
| `draft` | 策略选择进行中：`order`、`turn`、`picks`、`skipsLeft`、`turnDeadline`、`turnSeconds`、`untimed` |
| `sp` | 机变进行中：`family`、`name`、`desc`、`eventId`、`cards`、`order`、`turn`、`picks`、`taken`、`untimed` |
| `unite` | 联防进行中：`{ helpers, leakers }`，均为 `playerId` 列表 |

`players[]` 的一行：

| 字段 | 含义 |
|---|---|
| `playerId` `seat` `name` `isBot` | 身份 |
| `connected` `alive` `lp` | 是否在线、是否未被淘汰、生命点 |
| `bandId` `shopLevel` `boardCount` | 策略、商店等级、场上人数 |
| `ready` | 确认信息阶段看是否已确认，其余阶段看休整准备 |
| `bonds` | `{ bondId, count, active, tier, layers, harmony? }`。淘汰后为空列表。模式关闭但仍有成员的盟约带 `off: true` |
| `fieldId` | 该玩家所在战场，没有则为 `null` |
| `status` | `acting`、`ready`、`deciding`、`combat`、`done`、`helping`、`left`、`dead` |
| `autoplay` | 是否托管 |
| `pendingLp` | 本回合作战或联防到目前为止、结算时将扣除的生命。为 0 或其他阶段时省略 |
| `uniteLeft` | 联防中该漏怪方仍站着的敌人数，不封顶。没有则省略 |

观战者收到 `m.public`，不收到 `m.private`。

## `m.private`

只发给对应玩家。每次个人状态变化推送完整视图。

| 字段 | 含义 |
|---|---|
| `playerId` `seat` `alive` `lp` `funds` `bandId` | 身份与资源。`bandId` 未选时为空 |
| `ready` `canReady` | 是否准备。`canReady` 仅在存活、临时区为空且阶段为 `PREP` 时为真 |
| `shop` | `level`、`maxLevel`、`upgradePrice`、`refreshPrice`（有免费刷新时为 0）、`freeRefreshes`、`frozen`、`slots`、`rewardOffer` |
| `hand` | 长度 10，空位为 `null` |
| `temp` | 长度 5，空位为 `null` |
| `board` | 场上的棋子，带 `row`、`col`、`dir` |
| `deployCap` `deployCount` | 部署上限与已部署数 |
| `bonds` | 比公开条多 `thresholds`、`countsHand`。排序为激活的在前，其次层数 |
| `effects` | `{ id, name, desc, iconKind, iconId, counter?, counterText? }`。`iconKind` 为 `band`、`choice`、`team`、`item`、`garrison` |
| `nextEnemies` | `{ enemyKey, count, tag, start? }`。`start` 是首领在首领场地的出现格 `[row, col]` |
| `loadout` | 本局生效的配装，`{ [baseChessId]: { skill, module } }`。未列出的干员用默认值 |
| `stats` | `dmgDealt`、`kills`、`leaks`、`gold`、`refreshes`、`merges` |

商店槽：`{ kind: "chess"|"item", id, price, basePrice, sold, frozen }` 或 `null`。

`rewardOffer` 为 `null`，或 `{ tier, source: "merge"|"special", label, queued, slots }`。槽位 `{ kind, id, price, sold }`。`queued` 是后面还排着的份数。

棋子 `Piece`：`{ uid, kind: "chess"|"item"|"token", id, golden, tier, items, count, ownerUid }`。`items` 只在干员上有内容，元素为 `{ uid, id }`。`count` 与 `ownerUid` 用于召唤物。手牌和临时区的棋子没有行列。

## `m.field`

开始观看时推送。作战中的战场来自战斗元数据，并带 `fieldId`、`kind`、`live`。

休整期观看另一名玩家时：`fieldId` 为 `n:<playerId>`，`kind` 为 `normal`，`prep` 为真，`rect` 为普通战场矩形。`units` 含棋盘、手牌（行 7）和临时区（行 8，列 4–8）。`effects` 与 `nextEnemies` 属于被观看的玩家。观战座位拿到的这份与队友相同。

单位条 `UnitInfo` 的字段：`id`、`kind`、`side`、`ownerId`、`defId`、`name`、`tier`、`golden`、`spine`、`avatar`、`x`、`y`、`facing`、`dir`、`maxHp`，以及可选的 `skillIndex`、`moduleId`、`items`、`form`。

## `m.unitStats`

答复 `g.unitStats`，只发给请求者。

| 字段 | 含义 |
|---|---|
| `seq` | 请求里的 `seq`；请求没带时为 `null` |
| `round` | 当前回合 |
| `units` | 自己棋盘上的干员和召唤物 |

`units[]` 的一条：`id`、`uid`、`defId`、`hp`、`alive`、`maxHp`、`atk`、`def`、`res`、`interval`、`blockCnt`、`moveSpeed`、`silenced`、`base`（同一组不含当前生命和沉默的基础值）。友方有攻击范围时多一个 `range`，元素为 `[dRow, dCol]`，朝向按向右记录。

## `m.toast` `m.ticker` `m.emote`

| 消息 | 字段 | 发给谁 |
|---|---|---|
| `m.toast` | `kind`，`text` | 当事玩家 |
| `m.ticker` | `text`，`id`，`type`，`priority`，`playerId` | 房间。`text` 最长约 200 字。客户端按 `priority` 从高到低播放 |
| `m.emote` | `playerId`，`id` | 房间 |

## `m.result`

对局进入结算时发给每名仍在的观看者。字段 `playerId` 是接收者；观战者没有自己的结算行，仍收到公开的 `players`。

| 字段 | 含义 |
|---|---|
| `victory` | 本局是否胜利 |
| `roundsPassed` | 队伍通过的回合数 |
| `hiddenReached` `hiddenCleared` | 是否进入、是否打过隐秘核心 |
| `reason` | 结束原因，如 `victory`、`defeat` |
| `teamLp` | 最终攻势共享生命；首领战之前为 `null` |
| `modeId` `difficulty` `stageId` `bossId` `hiddenBossId` `seed` | 本局标识与种子 |
| `durationMs` | 从开局到结算的毫秒 |
| `players` | 按座位排序的结算行 |

结算行：`playerId`、`seat`、`name`、`isBot`、`left`、`alive`、`victory`、`roundsPassed`、`eliminatedRound`、`lp`、`bandId`、`lineup`、`bonds`、`stats`、`title`、`trophies`、`reward`。

`lineup[]`：`{ id, golden, tier, row, col, items }`，只含场上的干员。`stats` 在个人统计之外还有 `itemsEquipped`、`bossDamage`、`activatedLayers`、`lpLost`、`perfectRounds`。

房间回到大厅后，最后一帧 `m.public` 和每人的 `m.result` 会在重同步时再送一次，直到该玩家在大厅里准备、改难度、动机器人座位、开始下一局或离开。
