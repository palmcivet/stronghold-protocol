// @vitest-environment jsdom

import { type Catalog, EMPTY_CATALOG } from '@alliance/contract/catalog.js';
import type { PublicView } from '@alliance/contract/server-message.js';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { IntentBus } from '../../infra/intent/bus.js';
import { catalogStore } from '../../infra/store/catalog.js';
import { resetMatch } from '../../infra/store/frame.js';
import { matchStore } from '../../infra/store/match.js';
import { sessionStore } from '../../infra/store/session.js';
import { t } from '../../infra/text/index.js';
import { renderPart } from '../support/part.js';

const bus: IntentBus = {
  dispatch: async () => ({ ok: true, reply: { t: 'ok' } }),
  preview: () => null,
  onOutcome: () => () => {},
};

function draftIn(type: 'SINGLE' | 'COOP', skipsLeft: number) {
  const catalog: Catalog = {
    ...EMPTY_CATALOG,
    modes: { mode: { id: 'mode', type, difficulty: 'NORMAL' } },
  };
  catalogStore.setState({ catalog, loaded: true });
  sessionStore.setState({ playerId: 'p1' });
  matchStore.setState({
    public: {
      phase: 'BAND_DRAFT',
      modeId: 'mode',
      players: [],
      draft: {
        order: ['p1', 'p2'],
        turn: 'p1',
        picks: {},
        skipsLeft: { p1: skipsLeft },
        turnDeadline: 0,
        untimed: true,
      },
    } as unknown as PublicView,
  });
  renderPart('core:strategy.layout', { bus });
}

afterEach(() => {
  cleanup();
  resetMatch();
  catalogStore.setState({ catalog: EMPTY_CATALOG, loaded: false });
});

describe('strategy draft', () => {
  it('offers the skip in a team draft while skips are left', () => {
    draftIn('COOP', 1);
    expect(
      screen.getByRole('button', { name: t('core:strategy.skip') }),
    ).toBeTruthy();
  });

  it('hides the skip in a solo draft and once the skips are used up', () => {
    draftIn('SINGLE', 1);
    expect(
      screen.queryByRole('button', { name: t('core:strategy.skip') }),
    ).toBeNull();
    cleanup();
    draftIn('COOP', 0);
    expect(
      screen.queryByRole('button', { name: t('core:strategy.skip') }),
    ).toBeNull();
  });
});
