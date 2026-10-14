import { sendSetting } from '#loadout/sync.js';
// @vitest-environment jsdom

import {
  type Catalog,
  type CatalogChess,
  EMPTY_CATALOG,
} from '@alliance/contract/catalog.js';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Intent, IntentBus } from '#infra/intent/bus.js';
import { catalogStore } from '#infra/store/catalog.js';
import { setDataText, t } from '#infra/text/index.js';
import {
  sanitizeEntries,
  sanitizeOps,
  setChoice,
  setOps,
} from '#loadout/model.js';
import { loadoutStore } from '#loadout/state.js';
import { renderPart } from '#test/support/part.js';

const chess = (
  patch: Partial<CatalogChess> & { id: string },
): CatalogChess => ({
  baseId: patch.id,
  charId: null,
  goldenId: null,
  golden: false,
  tier: 3,
  rarity: 5,
  profession: 'SNIPER',
  bondIds: [],
  visible: true,
  loadout: null,
  ...patch,
});

const catalog: Catalog = {
  ...EMPTY_CATALOG,
  chess: {
    chess_a: chess({
      id: 'chess_a',
      charId: 'char_a',
      goldenId: 'chess_b',
      loadout: {
        skills: [0, 1],
        defaultSkill: 1,
        modules: ['none', 'uniequip_x'],
        defaultModule: 'uniequip_x',
      },
      skills: [
        { index: 0, spType: 'INCREASE_WITH_TIME', spCost: 30 },
        { index: 1, spType: 'INCREASE_WHEN_ATTACK', spCost: 4 },
      ],
    }),
    chess_b: chess({ id: 'chess_b', charId: 'char_a', golden: true }),
  },
  diyOwned: ['char_owned'],
};

function fakeBus() {
  const sent: Intent[] = [];
  const bus: IntentBus = {
    dispatch: async (intent) => {
      sent.push(intent);
      return { ok: true, reply: { t: 'ok' } };
    },
    preview: () => null,
    onOutcome: () => () => {},
  };
  return { bus, sent };
}

afterEach(() => {
  cleanup();
  catalogStore.setState({ catalog: EMPTY_CATALOG, loaded: false });
  loadoutStore.setState({
    selected: null,
    entries: {},
    ops: {},
    notOwned: [],
    diy: {},
  });
});

describe('loadout data', () => {
  const a = catalog.chess.chess_a as CatalogChess;

  it('keeps only choices that differ from the default, as master', () => {
    const changed = setChoice({}, a, { skill: 0 });
    expect(changed).toEqual({ chess_a: { skill: 0 } });
    expect(setChoice(changed, a, { skill: 1 })).toEqual({});
    expect(setChoice({}, a, { skill: 7 })).toEqual({});
    expect(setOps({}, 'char_a', { potential: 1 })).toEqual({
      char_a: { potential: 1 },
    });
    expect(
      setOps({ char_a: { potential: 1 } }, 'char_a', { potential: 6 }),
    ).toEqual({});
  });

  it('drops what master would refuse before sending', () => {
    expect(
      sanitizeEntries(
        { chess_a: { skill: 0 }, chess_b: { skill: 0 }, gone: { skill: 0 } },
        catalog,
      ),
    ).toEqual({ chess_a: { skill: 0 } });
    expect(
      sanitizeOps(
        {
          char_a: { cultivate: 0 },
          char_owned: { potential: 2 },
          char_unknown: { potential: 1 },
        },
        catalog,
      ),
    ).toEqual({ char_a: { cultivate: 0 }, char_owned: { potential: 2 } });
  });
});

describe('loadout detail', () => {
  it("shows master's skill and module names, and sends potential and cultivation with room.loadout", async () => {
    setDataText({
      'data:chess.chess_a.name': '隐现',
      'data:chess.chess_a.skill.0.name': '速射',
      'data:chess.chess_a.skill.0.desc': '攻击速度提升',
      'data:chess.chess_a.skill.1.name': '狙击',
      'data:module.uniequip_x.name': '惊喜',
      'data:module.uniequip_x.type': 'MAR-X',
    });
    catalogStore.setState({ catalog, loaded: true });
    loadoutStore.setState({ selected: 'chess_a' });
    const { bus, sent } = fakeBus();
    renderPart('core:loadout.detail', { bus });

    fireEvent.click(screen.getByRole('radio', { name: '速射' }));
    expect(screen.getByText('攻击速度提升')).toBeTruthy();
    expect(
      screen.getByRole('radio', {
        name: `MAR-X 惊喜 · ${t('core:loadout.default')}`,
      }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: '1' }));
    fireEvent.click(
      screen.getByRole('radio', { name: t('core:loadout.cultivate.0') }),
    );
    await sendSetting(bus, 'loadout', catalog);
    expect(sent).toEqual([
      {
        type: 'room.loadout',
        fields: {
          entries: { chess_a: { skill: 0 } },
          ops: { char_a: { potential: 1, cultivate: 0 } },
        },
      },
    ]);

    fireEvent.click(
      screen.getByRole('button', { name: t('core:loadout.reset') }),
    );
    expect(loadoutStore.getState()).toMatchObject({ entries: {}, ops: {} });
  });
});
