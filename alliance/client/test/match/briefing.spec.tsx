// @vitest-environment jsdom

import { type Catalog, EMPTY_CATALOG } from '@alliance/contract/catalog.js';
import type {
  PrivateView as MatchPrivate,
  PublicView,
} from '@alliance/contract/server-message.js';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { IntentBus } from '#infra/intent/bus.js';
import { catalogStore } from '#infra/store/catalog.js';
import { resetMatch } from '#infra/store/frame.js';
import { matchStore } from '#infra/store/match.js';
import { initialSession, sessionStore } from '#infra/store/session.js';
import { setDataText, t } from '#infra/text/index.js';
import { renderPart } from '#test/support/part.js';

const recorder = () => {
  const sent: unknown[] = [];
  const bus: IntentBus = {
    dispatch: async (intent) => {
      sent.push(intent);
      return { ok: true, reply: { t: 'ok' } };
    },
    preview: () => null,
    onOutcome: () => () => {},
  };
  return { bus, sent };
};

const catalog = (type: 'SINGLE' | 'MULTI'): Catalog => ({
  ...EMPTY_CATALOG,
  modes: {
    m: {
      id: 'm',
      type,
      difficulty: 'NORMAL',
      stages: 3,
      bossRound: 14,
      inactiveBonds: ['lat'],
    },
  },
  bosses: { boss_1: { id: 'boss_1', enemyId: null, abilities: 2 } },
  bands: {
    a: { id: 'a', sortId: 1, modeTypes: [], totalHp: 20 },
    dflt: {
      id: 'dflt',
      sortId: 2,
      modeTypes: [],
      totalHp: 25,
      bondIds: ['lat'],
    },
  },
  timeoutBandId: 'dflt',
});

function show(
  phase: 'INFO_CHECK' | 'BAND_DRAFT',
  patch: Partial<PublicView> = {},
  type: 'SINGLE' | 'MULTI' = 'MULTI',
) {
  catalogStore.setState({ catalog: catalog(type), loaded: true });
  setDataText({
    'data:boss.boss_1.name': '假想敌',
    'data:boss.boss_1.abilities': '射线\n召唤',
    'data:band.a.name': '甲',
    'data:band.dflt.name': '华法琳',
    'data:bond.lat.name': '拉特兰',
  });
  sessionStore.setState({ playerId: 'p1' });
  matchStore.setState({
    public: {
      phase,
      modeId: 'm',
      difficulty: 'NORMAL',
      lastRound: 14,
      stageId: null,
      bossId: 'boss_1',
      factions: [],
      players: [
        { playerId: 'p1', name: '我', ready: false },
        { playerId: 'p2', name: '队友', ready: true },
      ],
      ...patch,
    } as unknown as PublicView,
  });
  const { bus, sent } = recorder();
  renderPart(
    phase === 'INFO_CHECK' ? 'core:briefing.layout' : 'core:strategy.layout',
    { bus },
  );
  return sent;
}

afterEach(() => {
  cleanup();
  resetMatch();
  catalogStore.setState({ catalog: EMPTY_CATALOG, loaded: false });
  sessionStore.setState(initialSession());
  setDataText({});
});

describe('briefing', () => {
  it('shows the step, the leader’s abilities, the battlefield pool and the empty special enemies', () => {
    show('INFO_CHECK');
    expect(
      screen.getByText(t('core:briefing.step', { step: 1, of: 2 })),
    ).toBeTruthy();
    expect(screen.getByText('射线')).toBeTruthy();
    expect(
      screen.getByText(t('core:briefing.poolRandom', { count: 3 })),
    ).toBeTruthy();
    expect(screen.getByText(t('core:briefing.noFactions'))).toBeTruthy();
    expect(screen.getByText(t('core:briefing.noBanned'))).toBeTruthy();
  });

  it('readies with the setup revision, and holds while a reroll vote runs', () => {
    const sent = show('INFO_CHECK', { setupRevision: 4 });
    fireEvent.click(
      screen.getByRole('button', { name: t('core:briefing.getReady') }),
    );
    expect(sent).toEqual([
      { type: 'g.infoReady', fields: { setupRevision: 4 } },
    ]);
    cleanup();
    show('INFO_CHECK', {
      rerollVote: { id: 1, proposerId: 'p2', voters: ['p1'], agreed: [] },
    });
    const button = screen.getByRole('button', {
      name: t('core:briefing.getReady'),
    });
    expect(
      button.hasAttribute('disabled') ||
        button.getAttribute('aria-disabled') === 'true',
    ).toBe(true);
  });
});

describe('match info', () => {
  it('lists a bond’s banned members on hover, and my custom picks left out of the shop', async () => {
    const base = catalog('MULTI');
    catalogStore.setState({
      catalog: {
        ...base,
        chess: {
          c1: {
            id: 'c1',
            tier: 2,
            bondIds: ['lat', 'agl'],
          } as unknown as Catalog['chess'][string],
        },
        bonds: {
          lat: { id: 'lat', thresholds: [] },
          agl: { id: 'agl', thresholds: [], core: true, members: ['c1'] },
        },
      },
      loaded: true,
    });
    setDataText({
      'data:bond.lat.name': '拉特兰',
      'data:bond.agl.name': '阿戈尔',
      'data:chess.c1.name': '莫斯提马',
      'data:operator.char_x.name': '陈',
    });
    matchStore.setState({
      public: {
        phase: 'INFO_CHECK',
        modeId: 'm',
        bannedChess: ['c1'],
        players: [],
      } as unknown as PublicView,
      private: {
        diy: { slot5: { charId: 'char_x' } },
        diyBanned: ['slot5'],
      } as unknown as MatchPrivate,
    });
    renderPart('core:match.info', { props: { factions: false } });
    expect(
      screen.getByText(t('core:briefing.diyBanned', { names: '陈' })),
    ).toBeTruthy();
    const bond = screen.getByRole('img', {
      name: t('core:briefing.bondBanned', { name: '阿戈尔', count: 1 }),
    });
    // a keyboard focus opens the tip, as a hover does
    fireEvent.keyDown(document.body, { key: 'Tab' });
    act(() => bond.focus());
    expect((await screen.findByRole('tooltip')).textContent).toContain(
      '莫斯提马',
    );
  });
});

describe('strategy draft view', () => {
  it('starts on the timeout strategy, marks it off this match, and names it in the tip', () => {
    show('BAND_DRAFT', {
      draft: {
        order: ['p1', 'p2'],
        turn: 'p1',
        picks: {},
        turnDeadline: Date.now() + 30000,
        turnSeconds: 30,
        untimed: false,
      },
    });
    expect(screen.getByRole('note').textContent).toContain('【拉特兰】');
    expect(
      screen.getByText(
        t('core:strategy.tipAuto', {
          clock: t('core:strategy.clock', { seconds: 30 }),
          name: '华法琳',
        }),
      ),
    ).toBeTruthy();
  });

  it('marks a strategy a teammate holds, and moves off it when my turn comes', () => {
    show('BAND_DRAFT', {
      draft: {
        order: ['p2', 'p3', 'p1'],
        turn: 'p3',
        picks: { p2: 'a' },
        turnDeadline: 0,
        untimed: true,
      },
    });
    fireEvent.click(screen.getByRole('row', { name: '甲' }));
    expect(screen.getByText(t('core:strategy.takenHint'))).toBeTruthy();
    cleanup();
    show('BAND_DRAFT', {
      draft: {
        order: ['p2', 'p1'],
        turn: 'p1',
        picks: { p2: 'a' },
        turnDeadline: 0,
        untimed: true,
      },
    });
    fireEvent.click(screen.getByRole('row', { name: '甲' }));
    expect(screen.queryByText(t('core:strategy.takenHint'))).toBeNull();
    expect(
      screen.getByRole('button', { name: t('core:strategy.pick') }),
    ).toBeTruthy();
  });
});
