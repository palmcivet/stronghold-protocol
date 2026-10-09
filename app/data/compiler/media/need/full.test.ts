import { expect, test } from "vitest"
import { fullBaseNeeds } from "#compiler/media/need/full.js"

const characters = {
  char_002_amiya: { profession: "CASTER", subProfessionId: "corecaster", phases: [{}, {}, {}], skills: [{ skillId: "skchr_amiya_1" }] },
  char_285_medic2: { profession: "MEDIC", phases: [{}], skills: [] },
  token_10020_ling_soul3: { profession: "TOKEN" },
  trap_001_crate: { profession: "TRAP" },
}
const skills = { skchr_amiya_1: { iconId: "skchr_amiya_icon" } }
const skins = {
  charSkins: {
    "char_002_amiya#1": { charId: "char_002_amiya", battleSkin: { skinOrPrefabId: "DefaultSkin" } },
    "char_002_amiya@epoque#4": { charId: "char_002_amiya", battleSkin: { skinOrPrefabId: "char_002_amiya_epoque#4" } },
    "token_10020_ling_soul3@x#1": { charId: "token_10020_ling_soul3", battleSkin: { skinOrPrefabId: "token_10020_ling_soul3_x#1" } },
  },
}
const handbook = { enemyData: { enemy_1007_slime: {}, enemy_2001_duckmi_2: {} } }
const enemyDatabase = {
  enemies: [
    { Key: "enemy_1007_slime", Value: [{ enemyData: { prefabKey: { m_defined: true, m_value: "enemy_1007_slime" } } }] },
    { Key: "enemy_2001_duckmi_2", Value: [{ enemyData: { prefabKey: { m_defined: true, m_value: "enemy_2001_duckmi" } } }] },
  ],
}

test("the full base needs list every operator, skin, summon and enemy of the tables, all optional", () => {
  const full = fullBaseNeeds({ characters, skills, skins, handbook, enemyDatabase })
  expect(full.operatorIds).toEqual(["char_002_amiya", "char_285_medic2"])
  expect(full.needs.every((need) => !need.required)).toBe(true)
  expect(full.needs.map((need) => need.key).sort()).toEqual(
    [
      "image:char/avatar/char_002_amiya",
      "image:char/avatar/char_002_amiya_2",
      "image:char/portrait/char_002_amiya_1",
      "image:char/portrait/char_002_amiya_2",
      "spine:char/char_002_amiya/front",
      "spine:char/char_002_amiya/back",
      "image:prof/sub/corecaster",
      "image:skill/skchr_amiya_icon",
      "image:char/avatar/char_285_medic2",
      "image:char/portrait/char_285_medic2_1",
      "spine:char/char_285_medic2/front",
      "spine:char/char_285_medic2/back",
      "image:token/icon/token_10020_ling_soul3",
      "spine:token/token_10020_ling_soul3/front",
      "spine:skin/char_002_amiya_epoque_4/front",
      "spine:skin/char_002_amiya_epoque_4/back",
      "spine:token/token_10020_ling_soul3/token_10020_ling_soul3_x_1",
      "image:enemy/icon/enemy_1007_slime",
      "image:enemy/icon/enemy_2001_duckmi_2",
      "spine:enemy/enemy_1007_slime",
      "spine:enemy/enemy_2001_duckmi",
    ].sort(),
  )
})

test("tables that are not extracted yet contribute nothing", () => {
  expect(fullBaseNeeds({ characters: null, skills: null, skins: null, handbook: null, enemyDatabase: null })).toEqual({ needs: [], operatorIds: [] })
})
