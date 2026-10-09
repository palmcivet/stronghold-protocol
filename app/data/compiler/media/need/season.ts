// 赛季包需求：模式专属的界面、表情、引导、BGM、模式音效、陷阱道具图、盟约与羁绊图、棋盘贴图，以及赛季关卡的 gamedata。

import type { Need } from "arknights-assets-catalog"
import { safeName } from "arknights-assets-extractor"
import { levelGamedataPaths, seasonLevels } from "#compiler/packet/compile/levels.js"
import { gamedataNeeds } from "#compiler/media/need/base.js"
import { BOARD_TEXTURE_KEYS } from "#compiler/media/derive/board/material.js"
import { listOf, needOf, recordOf, soundName, tableNeeds, textOf, uniqueNeeds, type JsonRecord, type NeedContext } from "#compiler/media/need/input.js"
import type { AudioIndex } from "#compiler/media/need/audio-bank.js"
import type { GameRecord } from "#compiler/packet/text/parse.js"

/** Background music of the mode: the fixed battle and lobby tracks, and the track of every boss round. */
function bgmNeeds(audio: AudioIndex, maps05: JsonRecord): Need[] {
  const banks = [
    "sys.ON_ACTIVITY_LOADED.act2autochess",
    "battle.ON_GAME_READY.act1autochess_shop",
    "battle.ON_GAME_READY.rglk1phantomcastle",
    "battle.ON_GAME_READY.corrosion",
    "battle.ON_GAME_READY.bat_kazimierz2_1",
    "battle.ON_GAME_READY.bat_kazimierz2_2",
  ]
  const tracks = new Set(banks)
  for (const level of Object.values(recordOf(maps05["roundLevels"]))) {
    const track = textOf(recordOf(level)["bgm"])
    if (!track) continue
    for (const used of listOf(recordOf(level)["usedBy"]).map(String)) {
      if (/\(boss:boss_\d+\)/.test(used) && !used.startsWith("mode_training")) tracks.add(`battle.ON_GAME_READY.${track}`)
    }
  }
  const out: Need[] = []
  for (const bank of tracks) {
    const track = audio.bgm(bank)
    if (!track) continue
    for (const path of [track.loop, track.intro]) if (path) out.push(needOf("audio", `bgm/${soundName(path)}`, false))
  }
  return out
}

/**
 * Season needs for one season id. `activity` is the parsed `activity_table.json` when it is extracted;
 * without it the level tables cannot be named yet and are left for the next `compile:needs` run.
 */
export function seasonNeeds(context: NeedContext, seasonId: string, activity: unknown | null): Need[] {
  const assets07 = recordOf(context.research.assets07)
  const needs: Need[] = [
    ...tableNeeds(context.arknightsAssets, [`image:season/${seasonId}/`, "image:ui/"]),
    ...tableNeeds(context.voice, ["audio:bgm/", "audio:sfx/autochess/"]),
    ...BOARD_TEXTURE_KEYS.map((key): Need => ({ key, required: false })),
  ]
  for (const id of Object.keys(recordOf(assets07["bands"]))) needs.push(needOf("image", `band/${safeName(id)}`, false))
  for (const id of Object.keys(recordOf(assets07["bonds"]))) needs.push(needOf("image", `bond/${safeName(id)}`, false))
  for (const id of Object.keys(recordOf(assets07["items"]))) needs.push(needOf("image", `season/${seasonId}/trap/${safeName(id)}`, false))

  if (context.audio) needs.push(...bgmNeeds(context.audio, recordOf(context.research.maps05)))

  if (activity) {
    const root = recordOf(activity)
    const act = recordOf(recordOf(root["activity"])["AUTOCHESS_SEASON"])[seasonId] as GameRecord | undefined
    const ac = recordOf(root["autoChessData"]) as GameRecord
    if (act) {
      const levels = seasonLevels(act, ac)
      needs.push(...gamedataNeeds(levelGamedataPaths(levels)))
    }
  }
  return uniqueNeeds(needs)
}
