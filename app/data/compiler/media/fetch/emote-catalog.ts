// 36 个对局表情。顺序与主题页、sortId 一致，供资源计划生成 ui 键。

export interface EmoteCatalogEntry {
  readonly id: string
  readonly sortId: number
  readonly picId: string
  readonly label: string
  readonly themeId: string
  readonly dir: string
}

const entry = (
  id: string,
  sortId: number,
  picId: string,
  label: string,
  themeId: string,
  dir: string,
): EmoteCatalogEntry => ({ id, sortId, picId, label, themeId, dir })

export const emoteCatalog: readonly EmoteCatalogEntry[] = Object.freeze([
  entry("autochess_battle_happy", 1001, "pic_happy_battle", "开心", "emoticon_autochess_basic", "basic"),
  entry("autochess_battle_scared", 1002, "pic_scared_battle", "害怕", "emoticon_autochess_basic", "basic"),
  entry("autochess_battle_sorry", 1003, "pic_sorry_battle", "对不起", "emoticon_autochess_basic", "basic"),
  entry("autochess_battle_thanks", 1004, "pic_thanks_battle", "谢谢", "emoticon_autochess_basic", "basic"),
  entry("autochess_battle_thinking", 1005, "pic_thinking_battle", "思考", "emoticon_autochess_basic", "basic"),
  entry("autochess_battle_nice_cooperate", 1006, "pic_cooperate_battle", "合作愉快", "emoticon_autochess_basic", "basic"),
  entry("slug_autochess_battle_nice_work", 2001, "pic_nice_work_battle", "合作愉快！", "emoticon_originium_slug", "slug"),
  entry("slug_autochess_battle_thanks", 2002, "pic_thanks_battle", "谢谢！", "emoticon_originium_slug", "slug"),
  entry("slug_autochess_battle_sorry", 2003, "pic_sorry_battle", "对不起！", "emoticon_originium_slug", "slug"),
  entry("slug_autochess_battle_bye", 2004, "pic_bye_battle", "再见！", "emoticon_originium_slug", "slug"),
  entry("slug_autochess_battle_distrust", 2005, "pic_distrust_battle", "？？？", "emoticon_originium_slug", "slug"),
  entry("slug_autochess_battle_very_soon", 2006, "pic_very_soon_battle", "很快就好！", "emoticon_originium_slug", "slug"),
  entry("autochess_battle_noproblem", 1007, "pic_noproblem_battle", "没问题！", "emoticon_autochess_basic_2", "basic_2"),
  entry("autochess_battle_respect", 1008, "pic_respect_battle", "敬礼！", "emoticon_autochess_basic_2", "basic_2"),
  entry("autochess_battle_call", 1009, "pic_call_battle", "欢呼！", "emoticon_autochess_basic_2", "basic_2"),
  entry("autochess_battle_playingcool", 1010, "pic_playingcool_battle", "酷！", "emoticon_autochess_basic_2", "basic_2"),
  entry("autochess_battle_sad", 1011, "pic_sad_battle", "伤心", "emoticon_autochess_basic_2", "basic_2"),
  entry("autochess_battle_dying", 1012, "pic_dying_battle", "快死了", "emoticon_autochess_basic_2", "basic_2"),
  entry("autochess_battle_fooldoctor_01", 1020, "pic_fooldoctor_01_battle", "博士士 1", "emoticon_foolsday_doctor", "fooldoctor"),
  entry("autochess_battle_fooldoctor_02", 1021, "pic_fooldoctor_02_battle", "博士士 2", "emoticon_foolsday_doctor", "fooldoctor"),
  entry("autochess_battle_fooldoctor_03", 1022, "pic_fooldoctor_04_battle", "博士士 3", "emoticon_foolsday_doctor", "fooldoctor"),
  entry("autochess_battle_fooldoctor_04", 1023, "pic_fooldoctor_05_battle", "博士士 4", "emoticon_foolsday_doctor", "fooldoctor"),
  entry("autochess_battle_fooldoctor_05", 1024, "pic_fooldoctor_06_battle", "博士士 5", "emoticon_foolsday_doctor", "fooldoctor"),
  entry("autochess_battle_fooldoctor_06", 1025, "pic_fooldoctor_08_battle", "博士士 6", "emoticon_foolsday_doctor", "fooldoctor"),
  entry("autochess_battle_foolamiya_01", 1040, "pic_foolamiya_01_battle", "米米子 1", "emoticon_foolsday_amiya", "foolamiya"),
  entry("autochess_battle_foolamiya_02", 1041, "pic_foolamiya_02_battle", "米米子 2", "emoticon_foolsday_amiya", "foolamiya"),
  entry("autochess_battle_foolamiya_03", 1042, "pic_foolamiya_03_battle", "米米子 3", "emoticon_foolsday_amiya", "foolamiya"),
  entry("autochess_battle_foolamiya_04", 1043, "pic_foolamiya_04_battle", "米米子 4", "emoticon_foolsday_amiya", "foolamiya"),
  entry("autochess_battle_foolamiya_05", 1044, "pic_foolamiya_05_battle", "米米子 5", "emoticon_foolsday_amiya", "foolamiya"),
  entry("autochess_battle_foolamiya_06", 1045, "pic_foolamiya_06_battle", "米米子 6", "emoticon_foolsday_amiya", "foolamiya"),
  entry("autochess_battle_foolwisdel_01", 1060, "pic_foolwisdel_01_battle", "维维美 1", "emoticon_foolsday_wisdel", "foolwisdel"),
  entry("autochess_battle_foolwisdel_02", 1061, "pic_foolwisdel_02_battle", "维维美 2", "emoticon_foolsday_wisdel", "foolwisdel"),
  entry("autochess_battle_foolwisdel_03", 1062, "pic_foolwisdel_03_battle", "维维美 3", "emoticon_foolsday_wisdel", "foolwisdel"),
  entry("autochess_battle_foolwisdel_04", 1063, "pic_foolwisdel_04_battle", "维维美 4", "emoticon_foolsday_wisdel", "foolwisdel"),
  entry("autochess_battle_foolwisdel_05", 1064, "pic_foolwisdel_05_battle", "维维美 5", "emoticon_foolsday_wisdel", "foolwisdel"),
  entry("autochess_battle_foolwisdel_06", 1065, "pic_foolwisdel_06_battle", "维维美 6", "emoticon_foolsday_wisdel", "foolwisdel"),
])
