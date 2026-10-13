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
});
