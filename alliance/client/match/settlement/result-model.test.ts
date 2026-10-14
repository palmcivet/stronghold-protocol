import type { ResultView } from '@alliance/contract/server-message.js';
import { describe, expect, it } from 'vitest';
import {
  bestOf,
  cardBonds,
  cardOf,
  formatStat,
  seatOrder,
} from './result-model.js';

const view = (patch: Partial<ResultView> = {}): ResultView => ({
  victory: true,
  roundsPassed: 14,
  reason: '',
  modeId: 'm',
  difficulty: 'NORMAL',
  players: [],
  ...patch,
});

describe('result card data', () => {
  it("lists active bonds and those with layers, most layers first, at most six, without a no-stack bond's layers", () => {
    const bonds = cardBonds(
      [
        { bondId: 'a', active: true, layers: 1 },
        { bondId: 'b', active: false, layers: 0 },
        { bondId: 'c', active: false, layers: 3 },
        { bondId: 'solo', active: true, layers: 9 },
        ...['d', 'e', 'f', 'g'].map((bondId) => ({ bondId, active: true })),
      ],
      { solo: { id: 'solo', thresholds: [], noStack: true } },
    );
    expect(bonds.map((bond) => bond.bondId)).toEqual([
      'c',
      'a',
      'solo',
      'd',
      'e',
      'f',
    ]);
    expect(bonds.find((bond) => bond.bondId === 'solo')?.layers).toBeNull();
  });

  it('shows the shared pool from the Final Assault on, none for the fallen', () => {
    const alive = { playerId: 'p1', name: 'A', lp: 30 };
    expect(cardOf(alive, view(), {}).lp).toBe(30);
    expect(cardOf(alive, view({ teamLp: 55 }), {})).toMatchObject({
      lp: 55,
      lpShared: true,
    });
    expect(
      cardOf({ ...alive, alive: false }, view({ teamLp: 55 }), {}).lp,
    ).toBe(0);
  });

  it('keeps the first seven statistics present', () => {
    const stats = Object.fromEntries(
      [
        'dmgDealt',
        'kills',
        'bossDamage',
        'activatedLayers',
        'merges',
        'itemsEquipped',
        'gold',
        'perfectRounds',
      ].map((key) => [key, 1]),
    );
    expect(
      cardOf({ playerId: 'p', name: 'A', stats }, view(), {}).stats,
    ).toHaveLength(7);
  });

  it('marks the best of each statistic only with two players or more', () => {
    const rows = [
      { playerId: 'p1', name: 'A', seat: 1, stats: { kills: 3, leaks: 0 } },
      { playerId: 'p2', name: 'B', seat: 0, stats: { kills: 5, leaks: 0 } },
    ];
    expect(bestOf(rows)).toEqual({ kills: 'p2' });
    expect(bestOf(rows.slice(0, 1))).toEqual({});
    expect(seatOrder(rows).map((row) => row.playerId)).toEqual(['p2', 'p1']);
  });
});

describe('formatStat', () => {
  it('compacts large figures like master fmtNum', () => {
    expect(formatStat(2310000)).toBe('231万');
    expect(formatStat(150000)).toBe('15.0万');
    expect(formatStat(99)).toBe('99');
    expect(formatStat(null)).toBe('—');
  });
});
