import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"
import { packManifestIssues, type PackAsset } from "arknights-assets-catalog"
import { buildUpstreamManifest, type UpstreamIssue } from "arknights-compat-upstream"

const BACKEND = "http://127.0.0.1:3000/"

async function fixtureBuild() {
  const assets: unknown = JSON.parse(await readFile(new URL("./fixtures/assets.json", import.meta.url), "utf8"))
  return buildUpstreamManifest({ backend: BACKEND, assets })
}

describe("upstream manifest from the trimmed master file", () => {
  it("passes the pack manifest guard as an upstream pack", async () => {
    const { manifest } = await fixtureBuild()
    expect(packManifestIssues(manifest)).toEqual([])
    expect(manifest.pack).toMatchObject({ type: "upstream", id: "master", version: "1+7ae1d03466cb" })
    expect(manifest.fileRoot).toBe(BACKEND)
    expect(Object.keys(manifest.assets)).toHaveLength(56)
  })

  it("maps a two-pose operator with an elite avatar to exact files and keys", async () => {
    const { manifest } = await fixtureBuild()
    const front = manifest.assets["spine:char/char_003_kalts/front"] as PackAsset
    expect(front.kind).toBe("spine")
    expect(front.files).toEqual([
      { role: "skel", name: "char_003_kalts.skel", format: "skel", bytes: 0, hash: "", href: "http://127.0.0.1:3000/assets/spine/op/char_003_kalts/front/char_003_kalts.skel" },
      { role: "atlas", name: "char_003_kalts.atlas", format: "atlas", bytes: 0, hash: "", href: "http://127.0.0.1:3000/assets/spine/op/char_003_kalts/front/char_003_kalts.atlas" },
      { role: "page", name: "char_003_kalts.png", format: "png", bytes: 0, hash: "", href: "http://127.0.0.1:3000/assets/spine/op/char_003_kalts/front/char_003_kalts.png" },
    ])
    expect(manifest.assets["image:char/avatar/char_003_kalts_2"]?.files).toEqual([
      { role: "main", name: null, format: "png", bytes: 0, hash: "", href: "http://127.0.0.1:3000/assets/char/avatar/char_003_kalts_2.png" },
    ])
  })

  it("routes music and sound through the extension-less media route and fonts to the font path", async () => {
    const { manifest } = await fixtureBuild()
    expect(manifest.assets["audio:bgm/m_sys_act1autochess_loop"]?.files[0]?.href).toBe("http://127.0.0.1:3000/media/bgm/m_sys_act1autochess_loop")
    expect(manifest.assets["audio:sfx/battle/p_atk_healpistol_n"]?.files[0]?.href).toBe("http://127.0.0.1:3000/media/sfx/player/p_atk/p_atk_healpistol_n")
    expect(manifest.assets["font:bender/regular"]).toEqual({
      kind: "font",
      files: [{ role: "main", name: null, format: "woff2", bytes: 0, hash: "", href: "http://127.0.0.1:3000/fonts/bender-regular.woff2" }],
      dependsOn: [],
      fallbackId: null,
      preloadGroup: null,
    })
  })

  it("writes refs in the season shape, with every leaf a key", async () => {
    const { manifest } = await fixtureBuild()
    expect(manifest.refs).toEqual({
      "chars": {
        "char_003_kalts": {
          "avatar": "image:char/avatar/char_003_kalts",
          "avatarElite": "image:char/avatar/char_003_kalts_2",
          "portrait": "image:char/portrait/char_003_kalts_1",
          "portraitElite": "image:char/portrait/char_003_kalts_2",
          "spine": {
            "front": "spine:char/char_003_kalts/front",
            "back": "spine:char/char_003_kalts/back"
          }
        },
        "char_010_chen": {
          "avatar": "image:char/avatar/char_010_chen",
          "avatarElite": "image:char/avatar/char_010_chen_2",
          "portrait": "image:char/portrait/char_010_chen_1",
          "portraitElite": "image:char/portrait/char_010_chen_2",
          "spine": {
            "front": "spine:char/char_010_chen/front",
            "back": "spine:char/char_010_chen/back"
          }
        },
        "char_600_cpione": {
          "avatar": "image:char/avatar/char_600_cpione",
          "portrait": "image:char/portrait/char_600_cpione_1",
          "spine": {
            "front": "spine:char/char_600_cpione/front",
            "back": "spine:char/char_600_cpione/back"
          }
        }
      },
      "enemies": {
        "enemy_10001_trslim": {
          "icon": "image:enemy/icon/enemy_10001_trslim",
          "spine": "spine:enemy/enemy_10001_trslim"
        },
        "enemy_1305_mhslim": {
          "icon": "image:enemy/icon/enemy_1305_mhslim",
          "spine": "spine:enemy/enemy_1305_mhslim"
        },
        "enemy_9016_acstmr": {
          "icon": "image:enemy/icon/enemy_9016_acstmr"
        }
      },
      "tokens": {
        "token_10000_silent_healrb": {
          "icon": "image:token/icon/token_10000_silent_healrb",
          "spine": "spine:token/token_10000_silent_healrb/front"
        },
        "token_10006_vodfox_doll": {
          "icon": "image:token/icon/token_10006_vodfox_doll",
          "spineVariants": {
            "token_10006_vodfox_doll_witch_2": "spine:token/token_10006_vodfox_doll/token_10006_vodfox_doll_witch_2"
          }
        },
        "token_10002_kalts_mon3tr": {
          "icon": "image:token/icon/token_10002_kalts_mon3tr"
        }
      },
      "bonds": {
        "yanShip": "image:bond/yanShip"
      },
      "items": {
        "trap_1041_acarm041": "image:season/act2autochess/trap/trap_1041_acarm041"
      },
      "bands": {
        "band_bldsk": "image:band/band_bldsk"
      },
      "skills": {
        "skchr_kalts_1": "image:skill/skchr_kalts_1",
        "skcom_powerstrike[3]": "image:skill/skcom_powerstrike_3_",
        "skchr_huang_1": "image:skill/skcom_powerstrike_3_"
      },
      "prof": {
        "icon": {
          "caster": "image:prof/caster",
          "tank": "image:prof/tank"
        },
        "large": {
          "caster": "image:prof/large/caster"
        },
        "card": {
          "caster": "image:prof/card/caster"
        },
        "sub": {
          "fastshot": "image:prof/sub/fastshot"
        }
      },
      "bgm": {
        "m_sys_act1autochess_loop": "audio:bgm/m_sys_act1autochess_loop",
        "m_sys_act1autochess_intro": "audio:bgm/m_sys_act1autochess_intro",
        "m_bat_kazimierz2_1_loop": "audio:bgm/m_bat_kazimierz2_1_loop",
        "m_bat_kazimierz2_1_intro": "audio:bgm/m_bat_kazimierz2_1_intro",
        "m_bat_ancestor_loop": "audio:bgm/m_bat_ancestor_loop"
      },
      "voice": {
        "char_102_texas": {
          "start": "audio:voice/cn/char_102_texas/cn_019",
          "select": [
            "audio:voice/cn/char_102_texas/cn_021",
            "audio:voice/cn/char_102_texas/cn_022"
          ],
          "skill1": "audio:voice/cn/char_102_texas/cn_025"
        }
      },
      "sfx": {
        "ui": {
          "g_ui_btn_h": "audio:sfx/ui/g_ui_btn_h"
        },
        "battle": {
          "b_char_set": "audio:sfx/battle/b_char_set"
        }
      },
      "fonts": {
        "bender": {
          "regular": "font:bender/regular"
        },
        "novecento-wide": {
          "normal": "font:novecento-wide/normal"
        }
      }
    })
  })

  it("reports exactly the addresses the rules do not map", async () => {
    const { issues } = await fixtureBuild()
    const expected: UpstreamIssue[] = [
      {
        "source": "assets",
        "path": "enemies.enemy_1305_mhslim.spineLocal",
        "address": null,
        "reason": "local-client Spine has no address; its files are listed by local-assets.json, which is not mapped"
      },
      {
        "source": "assets",
        "path": "tokens.token_10002_kalts_mon3tr.spineLocal",
        "address": null,
        "reason": "local-client Spine has no address; its files are listed by local-assets.json, which is not mapped"
      },
      {
        "source": "assets",
        "path": "audio.sfx.ui.income",
        "address": "/assets/audio/sfx/customse/act1autochess/act1autochess_b_ui_getmoney.mp3",
        "reason": "does not match the address pattern of audio.sfx.ui"
      },
      {
        "source": "assets",
        "path": "audio.sfx.battle.enemyHit",
        "address": "/assets/audio/sfx/enemy/e_imp/e_imp_general_w.mp3",
        "reason": "does not match the address pattern of audio.sfx.battle"
      },
      {
        "source": "assets",
        "path": "audio.sfx.units.token_10071_aglna2_agairp.die",
        "address": "/assets/audio/sfx/ambience/a_bat/a_bat_arngmkdpr.mp3",
        "reason": "does not match the address pattern of audio.sfx.units"
      },
      {
        "source": "assets",
        "path": "audio.sfx.units.token_10071_aglna2_agairp.born",
        "address": "/assets/audio/sfx/ambience/a_bat/a_bat_arngmkpr.mp3",
        "reason": "does not match the address pattern of audio.sfx.units"
      }
    ]
    expect(issues).toEqual(expected)
  })

})
