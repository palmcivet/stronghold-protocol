import { describe, expect, it } from 'vitest';
import { settlementOf } from '#data/view/settlement.js';

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
