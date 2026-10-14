import { type Catalog, EMPTY_CATALOG } from '@alliance/contract/catalog.js';
import type { PublicView } from '@alliance/contract/server-message.js';
import { describe, expect, it } from 'vitest';
import { matchInfoModel } from '#match/info-model.js';
import {
  autoPickBand,
  bandOffBonds,
  draftSelection,
  teammateBands,
  timeoutBand,
} from '#match/strategy/draft.js';

const band = (id: string, bondIds: string[] = []) => ({
  id,
  sortId: 1,
  modeTypes: [],
  totalHp: 20,
  bondIds,
});
const BANDS = [band('a'), band('dflt'), band('c', ['lat'])];

describe('strategy draft logic', () => {
  it('keeps teammates’ picks apart from mine', () => {
    const taken = teammateBands({ me: 'a', p2: 'dflt', p3: 'dflt' }, 'me');
    expect([...taken]).toEqual([['dflt', ['p2', 'p3']]]);
  });

  it('times out to the default while free, else the first free strategy', () => {
    expect(timeoutBand(BANDS, new Map(), 'dflt')).toBe('dflt');
    expect(timeoutBand(BANDS, new Map([['dflt', []]]), 'dflt')).toBe('a');
  });

  it('selects my pick or the timeout, and moves off a taken one on my turn', () => {
    const options = {
      bands: BANDS,
      taken: new Map(),
      myPick: null,
      myTurn: true,
      defaultId: 'dflt',
    };
    expect(draftSelection(null, options)).toBe('dflt');
    expect(draftSelection(null, { ...options, myPick: 'c' })).toBe('c');
    expect(
      draftSelection('a', { ...options, taken: new Map([['a', []]]) }),
    ).toBe('dflt');
    expect(
      draftSelection('a', {
        ...options,
        myTurn: false,
        taken: new Map([['a', []]]),
      }),
    ).toBe('a');
  });

  it('auto-picks the highlighted strategy while free, nothing after my pick', () => {
    const options = {
      bands: BANDS,
      taken: new Map(),
      myPick: null,
      defaultId: 'dflt',
    };
    expect(autoPickBand('c', options)).toBe('c');
    expect(autoPickBand('c', { ...options, taken: new Map([['c', []]]) })).toBe(
      'dflt',
    );
    expect(autoPickBand('c', { ...options, myPick: 'a' })).toBeNull();
  });

  it('marks the bonds the mode switches off', () => {
    expect(bandOffBonds(band('c', ['lat', 'x']), new Set(['lat']))).toEqual([
      'lat',
    ]);
  });
});

describe('match info model', () => {
  it('splits core and add-on bonds, greys off and drawn ones, counts banned members', () => {
    const catalog: Catalog = {
      ...EMPTY_CATALOG,
      chess: {
        c1: { tier: 3 } as Catalog['chess'][string],
        c2: { tier: 1 } as Catalog['chess'][string],
      },
      bonds: {
        b2: { id: 'b2', thresholds: [], core: true, order: 2, members: ['c1'] },
        b1: { id: 'b1', thresholds: [], core: true, order: 1 },
        b3: { id: 'b3', thresholds: [], order: 3 },
      },
      modes: {
        m: {
          id: 'm',
          type: 'SINGLE',
          difficulty: 'NORMAL',
          inactiveBonds: ['b3'],
        },
      },
    };
    const view = {
      modeId: 'm',
      drawnDisabledBonds: ['b1', 'b3'],
      bannedChess: ['c1', 'c2', 'unknown'],
    } as unknown as PublicView;
    const model = matchInfoModel(view, catalog);
    expect(model.core.map((bond) => bond.id)).toEqual(['b1', 'b2']);
    expect(model.addon.map((bond) => bond.id)).toEqual(['b3']);
    expect([
      model.stateOf('b1'),
      model.stateOf('b2'),
      model.stateOf('b3'),
    ]).toEqual(['drawn', null, 'off']);
    expect(model.banned).toEqual(['c2', 'c1']);
    expect(model.bannedOf('b2')).toBe(1);
    expect(model.modeOff).toBe(true);
  });
});
