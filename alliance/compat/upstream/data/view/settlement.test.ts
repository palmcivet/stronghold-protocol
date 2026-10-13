import { describe, expect, it } from 'vitest';
import { resultOf, settlementOf } from '#data/view/settlement.js';

describe('master settlement', () => {
  it('maps the co-op defence losses to the LP loss by player', () => {
    expect(
      settlementOf({
        uniteResult: {
          through: 3,
          helpers: ['p2'],
          leakers: ['p1'],
          losses: { p1: 2, p2: 0 },
        },
      }),
    ).toEqual({ lpLoss: { p1: 2, p2: 0 } });
  });

  it('has no settlement without a co-op defence result', () => {
    expect(settlementOf({})).toBeNull();
    expect(settlementOf({ uniteResult: null })).toBeNull();
  });

  it('drops entries that are no LP charge', () => {
    expect(
      settlementOf({
        uniteResult: {
          through: 0,
          helpers: [],
          leakers: [],
          losses: { p1: -1, p2: 1.5, p3: 'x' as unknown as number, p4: 1 },
        },
      }),
    ).toEqual({ lpLoss: { p4: 1 } });
  });
});

describe('master result', () => {
  it('keeps the fields the result screen reads and drops ill-typed ones', () => {
    const result = resultOf({
      t: 'm.result',
      victory: false,
      roundsPassed: 3,
      reason: 'lp',
      hiddenReached: false,
      teamLp: null,
      modeId: 'm1',
      difficulty: 'NORMAL',
      bossId: 'boss_7',
      durationMs: 240000,
      players: [
        {
          playerId: 'p1',
          name: 'A',
          isBot: false,
          alive: false,
          bandId: 'band_1',
          lineup: [
            { id: 'chess_1', golden: true, tier: 2, row: 0 },
            { tier: 1 },
          ],
          stats: { kills: 4, dmgDealt: 'x' },
          title: { id: 't1', name: 'MVP', picId: 'p', text: 'best' },
        },
        { name: 'no id' },
      ],
    });
    expect(result?.players).toEqual([
      {
        playerId: 'p1',
        name: 'A',
        isBot: false,
        alive: false,
        bandId: 'band_1',
        lineup: [{ id: 'chess_1', golden: true, tier: 2 }],
        stats: { kills: 4 },
        title: { id: 't1', name: 'MVP', text: 'best' },
      },
    ]);
    expect(result?.teamLp).toBeNull();
    expect(result?.durationMs).toBe(240000);
    expect(resultOf('nope')).toBeNull();
  });
});
