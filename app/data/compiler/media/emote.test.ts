import { expect, test } from "vitest"
import { isAssetKey } from "arknights-assets-catalog"
import { buildEmotes, emoteArtKey } from "#compiler/media/emote.js"

const display = {
  emoticonData: {
    emojiDataDict: {
      autochess_battle_happy: { id: "autochess_battle_happy", type: "AUTOCHESS_BATTLE", sortId: 1, picId: "pic_happy_battle" },
      lobby_wave: { id: "lobby_wave", type: "HOME", sortId: 2, picId: "pic_wave" },
    },
    emoticonThemeDataDict: { emoticon_autochess_basic: ["autochess_battle_happy", "lobby_wave"] },
    emoticonThemeTypeDict: { emoticon_autochess_basic: { sortId: 100000, isBasic: true } },
  },
}
const activity = { autoChessData: { enabledEmoticonThemeIdList: ["emoticon_autochess_basic"], constData: { chatCD: 1, chatTime: 3 } } }

test("an emote names its picture by asset key, not by address", () => {
  const { doc } = buildEmotes({ display, activity })
  expect(doc.emotes.map((emote) => emote.art)).toEqual(["image:ui/emoticon/basic/pic_happy_battle"])
  expect(doc.emotes.every((emote) => isAssetKey(emote.art))).toBe(true)
  expect(emoteArtKey("fooldoctor", "pic_fooldoctor_08_battle")).toBe("image:ui/emoticon/fooldoctor/pic_fooldoctor_08_battle")
})
