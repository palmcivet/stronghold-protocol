import { describe, expect, it } from 'vitest';
import { buildUpstreamCatalog } from '#data/catalog/index.js';

describe('buildUpstreamCatalog', () => {
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
      config: { modes: { m1: { modeId: 'm1', name: '标准', desc: '说明' } } },
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
    expect(catalog.chess.normal?.droppable).toBe(true);
    expect(catalog.chess.preset?.droppable).toBe(false);
    expect(catalog.bosses?.boss_7).toEqual({
      id: 'boss_7',
      enemyId: 'enemy_9',
    });
    expect(catalog.diySlots).toEqual([
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
});
