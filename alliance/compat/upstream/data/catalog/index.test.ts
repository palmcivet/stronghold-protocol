import { describe, expect, it } from 'vitest';
import { buildUpstreamCatalog } from '#data/catalog/index.js';

describe('buildUpstreamCatalog', () => {
  it("carries the skill and module text the loadout pickers show, and the custom squad's owned pool", () => {
    const { catalog, text } = buildUpstreamCatalog({
      chess: {
        chess_a: {
          chessId: 'chess_a',
          goldenId: 'chess_b',
          skills: [
            {
              index: 0,
              name: '速射',
              desc: '攻击速度提升',
              spType: 'INCREASE_WITH_TIME',
              spCost: 30,
            },
            { index: 1, name: '狙击' },
            { name: 'no index' },
          ],
        },
        chess_b: {
          chessId: 'chess_b',
          isGolden: true,
          skill: { index: 0, desc: '攻击速度大幅提升' },
          modules: [
            {
              uniEquipId: 'uniequip_x',
              name: '“惊喜”',
              typeName: 'MAR-X',
              traitOverride: { moduleDesc: '攻击空中单位时攻击力提升' },
            },
            'junk',
          ],
        },
      },
      backups: { diy: { ownedPool: ['char_1'] } },
    });
    expect(catalog.chess.chess_a?.skills).toEqual([
      { index: 0, spType: 'INCREASE_WITH_TIME', spCost: 30 },
      { index: 1, spType: null, spCost: null },
    ]);
    expect(text).toMatchObject({
      'data:chess.chess_a.skill.0.name': '速射',
      'data:chess.chess_a.skill.0.desc': '攻击速度提升',
      'data:chess.chess_a.skill.1.name': '狙击',
      'data:chess.chess_b.skill.0.desc': '攻击速度大幅提升',
      'data:module.uniequip_x.name': '“惊喜”',
      'data:module.uniequip_x.type': 'MAR-X',
      'data:module.uniequip_x.desc': '攻击空中单位时攻击力提升',
    });
    expect(catalog.diyOwned).toEqual(['char_1']);
  });

  it("lists each custom pick's skills and modules as master's pickChoices, a prototype's locked", () => {
    const { catalog } = buildUpstreamCatalog({
      chess: {
        slot5: {
          chessId: 'slot5',
          status: { phase: 2, level: 1, skillLevel: 4 },
        },
        slot5_b: {
          chessId: 'slot5_b',
          status: { phase: 2, level: 60, skillLevel: 7, equipLevel: 1 },
        },
      },
      backups: {
        diy: {
          slots: { slot5: { tier: 5, goldenId: 'slot5_b' } },
          prototypes: { '5': ['char_p'] },
          locked: { '5': { char_p: { skillIndex: 2, uniEquipId: null } } },
          ownedPool: ['char_own'],
        },
        units: {
          char_own: {
            forms: {
              '2/1/4/0': { skills: [{ index: 0 }, { index: 1 }, { index: 2 }] },
              '2/60/7/1': {
                modules: [
                  { uniEquipId: 'uniequip_x', typeName: 'MAR-X' },
                  { uniEquipId: 'uniequip_isw', typeName: 'ISW-A' },
                ],
              },
            },
          },
        },
      },
    });
    expect(catalog.diySlots?.[0]?.choices).toEqual({
      char_p: {
        skills: [],
        modules: [],
        locked: { skillIndex: 2, uniEquipId: null },
      },
      char_own: { skills: [0, 1, 2], modules: ['uniequip_x'] },
    });
  });

  it('maps master records to the catalog view and data keys', () => {
    const { catalog, text } = buildUpstreamCatalog({
      chess: {
        chess_a: {
          chessId: 'chess_a',
          baseId: 'chess_a',
          charId: 'char_498_inside',
          goldenId: 'chess_b',
          isGolden: false,
          tier: 2,
          name: '隐现',
          subProfessionName: '伏击客',
          bonds: [{ bondId: 'yanShip' }],
          skills: [{ index: 0 }, { index: 1, isDefault: true }],
        },
        chess_b: { chessId: 'chess_b', isGolden: true, tier: 2 },
      },
      bands: {
        band_x: {
          bandId: 'band_x',
          sortId: 3,
          name: '华法琳',
          modeTypeList: ['SINGLE'],
        },
      },
      waves: {
        wave_1: {
          id: 'wave_1',
          kind: 'boss',
          bossId: 'boss_1',
          spawns: [
            { key: 'enemy_slime', count: 2 },
            { key: 'enemy_slime', count: 1 },
            { key: 'enemy_liprr', count: 2 },
          ],
        },
      },
      config: {
        modes: {
          mode_a: { modeId: 'mode_a', type: 'SINGLE', name: '标准模拟' },
        },
      },
    });
    expect(catalog.chess.chess_a).toMatchObject({
      tier: 2,
      charId: 'char_498_inside',
      goldenId: 'chess_b',
      bondIds: ['yanShip'],
      visible: true,
      loadout: { skills: [0, 1], defaultSkill: 1, defaultModule: 'none' },
    });
    expect(catalog.chess.chess_b?.loadout).toBeNull();
    expect(catalog.bands.band_x?.modeTypes).toEqual(['SINGLE']);
    expect(catalog.chess.chess_b?.charId).toBeNull();
    expect(catalog.waves.wave_1).toEqual({
      id: 'wave_1',
      kind: 'boss',
      bossId: 'boss_1',
      enemyIds: ['enemy_slime', 'enemy_liprr'],
    });
    expect(catalog.modes.mode_a?.type).toBe('SINGLE');
    expect(text['data:chess.chess_a.name']).toBe('隐现');
    expect(text['data:chess.chess_a.subProfession']).toBe('伏击客');
    expect(text['data:band.band_x.name']).toBe('华法琳');
    expect(text['data:mode.mode_a.name']).toBe('标准模拟');
  });

  it('skips what is not a record', () => {
    const { catalog } = buildUpstreamCatalog({ chess: [1, 2], bonds: null });
    expect(catalog.chess).toEqual({});
    expect(catalog.bonds).toEqual({});
  });

  it('generates boss, stage, faction, mode and operator text from the content, and the ownership and squad data', () => {
    const { catalog, text } = buildUpstreamCatalog({
      chess: {
        normal: {
          chessId: 'normal',
          baseId: 'normal',
          charId: 'char_a',
          chessType: 'NORMAL',
          backup: { charId: 'char_standin' },
        },
        preset: {
          chessId: 'preset',
          charId: 'char_b',
          chessType: 'PRESET',
          backup: { charId: 'char_c' },
        },
      },
      config: {
        modes: {
          m1: {
            modeId: 'm1',
            name: '标准',
            desc: '说明',
            code: 'AC-2',
            lastRound: 14,
            hiddenRound: 15,
            iconId: 'mode_normal_icon',
            effectDescList: ['·可使用盟约数增加', '·大幅增加奖励'],
          },
        },
        tips: [{ tip: '提示一', weight: 50 }, { weight: 1 }, '提示三'],
      },
      bosses: {
        boss_7: { bossId: 'boss_7', enemyKey: 'enemy_9', name: '领袖' },
      },
      stages: { s1: { id: 's1', name: '战场#01' } },
      factions: {
        types: { DOT: { type: 'DOT', name: '特训敌人·持续', desc: 'd' } },
      },
      backups: {
        diy: {
          slots: { slot5: { tier: 5 }, slot6: { tier: 6 } },
          prototypes: { '5': ['char_p5'], '6': ['char_p6'] },
          ownedPool: ['char_own', 'char_p6'],
          operators: { char_own: { name: '陈' } },
        },
      },
    });
    expect(catalog.modes.m1).toEqual({
      id: 'm1',
      type: 'SINGLE',
      difficulty: 'NORMAL',
      code: 'AC-2',
      lastRound: 14,
      hiddenRound: 15,
      icon: 'image:ui/modeIcon/mode_normal_icon',
    });
    expect(text['data:mode.m1.effects']).toBe('可使用盟约数增加\n大幅增加奖励');
    expect(catalog.tips).toEqual(['0', '2']);
    expect(text['data:tip.2']).toBe('提示三');
    expect(catalog.chess.normal?.droppable).toBe(true);
    expect(catalog.chess.preset?.droppable).toBe(false);
    expect(catalog.bosses?.boss_7).toEqual({
      id: 'boss_7',
      enemyId: 'enemy_9',
    });
    expect(catalog.diySlots).toMatchObject([
      { id: 'slot5', tier: 5, candidates: ['char_p5', 'char_own', 'char_p6'] },
      { id: 'slot6', tier: 6, candidates: ['char_p6', 'char_own'] },
    ]);
    expect(text).toMatchObject({
      'data:mode.m1.desc': '说明',
      'data:boss.boss_7.name': '领袖',
      'data:stage.s1.name': '战场#01',
      'data:faction.DOT.name': '特训敌人·持续',
      'data:operator.char_own.name': '陈',
    });
  });

  it('carries what the briefing and the strategy draft show', () => {
    const { catalog, text } = buildUpstreamCatalog({
      bands: {
        b1: { bandId: 'b1', totalHp: 20, bondIds: ['bond_x'] },
      },
      bonds: {
        bond_x: {
          bondId: 'bond_x',
          isCore: true,
          bondOrder: 2,
          identifier: 3,
          visibleMembers: ['c1', 'c2'],
          noStack: true,
        },
      },
      config: {
        bandDraft: { timeoutBandId: 'b1' },
        modes: {
          m1: {
            modeId: 'm1',
            bossRound: 14,
            stages: ['s1', 's2'],
            inactiveBondIds: ['bond_x'],
          },
        },
      },
      bosses: { boss_1: { bossId: 'boss_1', abilities: ['一', '二'] } },
      factions: { types: { DOT: { type: 'DOT', icon: 'dot_icon' } } },
    });
    expect(catalog.bands.b1?.bondIds).toEqual(['bond_x']);
    expect(catalog.bonds.bond_x).toEqual({
      id: 'bond_x',
      thresholds: [],
      core: true,
      order: 2003,
      members: ['c1', 'c2'],
      noStack: true,
    });
    expect(catalog.timeoutBandId).toBe('b1');
    expect(catalog.modes.m1).toMatchObject({
      bossRound: 14,
      stages: 2,
      inactiveBonds: ['bond_x'],
    });
    expect(catalog.bosses?.boss_1?.abilities).toBe(2);
    expect(text['data:boss.boss_1.abilities']).toBe('一\n二');
    expect(catalog.factions?.DOT).toEqual({
      id: 'DOT',
      icon: 'image:ui/enemyTypeIcon/dot_icon',
    });
  });
});
