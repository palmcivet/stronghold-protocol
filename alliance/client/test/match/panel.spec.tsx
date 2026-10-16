// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EMOTE_CATALOG } from '@alliance/contract/match.js';
import type {
  PrivateMessage,
  PublicMessage,
  ServerMessage,
} from '@alliance/contract/server-message.js';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MASTER_CAPABILITIES } from '#infra/connection/backend.js';
import type { Intent, IntentBus } from '#infra/intent/bus.js';
import { applyFrame, resetMatch } from '#infra/store/frame.js';
import { matchStore } from '#infra/store/match.js';
import { presenceStore } from '#infra/store/presence.js';
import { roomStore } from '#infra/store/room.js';
import { sessionStore } from '#infra/store/session.js';
import { t } from '#infra/text/index.js';
import { emoteName } from '#match/hud/emote.js';
import { hudStore } from '#match/hud/state.js';
import { cardName } from '#match/piece-label.js';
import { renderPart } from '#test/support/part.js';

const frames = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '..', 'fixture', 'master-solo.json'),
    'utf8',
  ),
) as readonly ServerMessage[];

function firstOf<T extends ServerMessage['t']>(
  type: T,
): Extract<ServerMessage, { t: T }> {
  const frame = frames.find((item) => item.t === type);
  if (!frame) {
    throw new Error(`the recording has no ${type}`);
  }
  return frame as Extract<ServerMessage, { t: T }>;
}

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

/** The recorded public view in the preparation phase, so the shop is open. */
function preparing(): PublicMessage {
  return { ...firstOf('m.public'), phase: 'PREP' };
}

beforeEach(() => {
  resetMatch();
  roomStore.setState({ room: null });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** The first recorded private view whose shop offers something. */
function stockedShop(): PrivateMessage {
  const own = frames.find(
    (frame): frame is PrivateMessage =>
      frame.t === 'm.private' &&
      frame.shop.slots.some((slot) => slot !== null && !slot.sold),
  );
  if (!own) {
    throw new Error('the recording has no stocked shop');
  }
  return own;
}

describe('shop', () => {
  it('buys the slot the player presses and offers nothing the funds cannot pay', () => {
    const own = stockedShop();
    applyFrame(preparing(), 0);
    applyFrame({ ...own, alive: true }, 0);
    const { bus, sent } = fakeBus();
    renderPart('core:match.shop', { bus });

    own.shop.slots.forEach((slot, position) => {
      if (!slot || slot.sold) {
        return;
      }
      const buy = screen.getByRole('button', {
        name: t('core:shop.buy', { name: cardName(slot), price: slot.price }),
      });
      expect(buy.hasAttribute('disabled')).toBe(own.funds < slot.price);
      fireEvent.click(buy);
      if (own.funds >= slot.price) {
        expect(sent.at(-1)).toEqual({
          type: 'g.buy',
          fields: { slot: position },
        });
      }
    });
    expect(sent.length).toBeGreaterThan(0);

    const levelUp = screen.getByRole('button', {
      name: t('core:shop.levelUp', { price: own.shop.upgradePrice }),
    });
    expect(levelUp.hasAttribute('disabled')).toBe(
      own.funds < own.shop.upgradePrice,
    );
  });

  it('keeps every action off while the player cannot act', () => {
    applyFrame({ ...firstOf('m.public'), phase: 'COMBAT' }, 0);
    applyFrame(stockedShop(), 0);
    const { bus, sent } = fakeBus();
    renderPart('core:match.shop', { bus });
    for (const button of screen.getAllByRole('button')) {
      fireEvent.click(button);
    }
    expect(sent).toEqual([]);
  });
});

describe('emotes', () => {
  it('sends an official emote and waits out the cooldown', async () => {
    applyFrame(firstOf('m.public'), 0);
    applyFrame(stockedShop(), 0);
    const { bus, sent } = fakeBus();
    renderPart('core:match.emote', { bus });

    const open = screen.getByRole('button', { name: t('core:emote.open') });
    fireEvent.click(open);
    const first = EMOTE_CATALOG[0];
    if (!first) {
      throw new Error('there is no official emote');
    }
    fireEvent.click(
      await screen.findByRole('option', { name: emoteName(first.id) }),
    );
    expect(sent).toEqual([{ type: 'g.emote', fields: { id: first.id } }]);
    expect(
      screen
        .getByRole('button', { name: t('core:emote.open') })
        .hasAttribute('disabled'),
    ).toBe(true);
  });

  it('shows the emote a player sends on their team row', () => {
    const publicView: PublicMessage = firstOf('m.public');
    applyFrame(publicView, Date.now());
    const player = publicView.players[0];
    const first = EMOTE_CATALOG[0];
    if (!player || !first) {
      throw new Error('the recording has no player');
    }
    const { bus } = fakeBus();
    renderPart('core:match.team', { bus });
    act(() => {
      applyFrame(
        { t: 'm.emote', playerId: player.playerId, id: first.id },
        Date.now(),
      );
    });
    const row = screen.getByText(player.name).closest('li');
    expect(row?.textContent).toContain(emoteName(first.id));
  });
});

describe('ticker', () => {
  it('reads out the broadcast lines', () => {
    renderPart('core:match.ticker');
    act(() => {
      applyFrame(firstOf('m.ticker'), 0);
    });
    const log = screen.getByRole('log');
    expect(log.getAttribute('aria-live')).toBe('polite');
    expect(log.querySelectorAll('li')).toHaveLength(1);
  });
});

describe('result', () => {
  it("shows master's result data: the hidden core, gains, bonds and the shared LP", () => {
    applyFrame(firstOf('m.public'), 0);
    act(() => {
      applyFrame(
        {
          t: 'm.result',
          victory: true,
          roundsPassed: 15,
          reason: 'cleared',
          modeId: 'mode_single_funny',
          difficulty: 'FUNNY',
          bossId: 'boss_a',
          hiddenBossId: 'boss_b',
          hiddenCleared: false,
          hiddenReached: true,
          teamLp: 12,
          players: [
            {
              playerId: 'p1',
              name: 'Amiya',
              seat: 0,
              lp: 40,
              trophies: 2,
              reward: 3,
              bonds: [{ bondId: 'bond_x', active: true, layers: 4 }],
              stats: { kills: 9 },
            },
            { playerId: 'p2', name: 'Kal', seat: 1, stats: { kills: 2 } },
          ],
        },
        0,
      );
    });
    renderPart('core:result.layout');
    expect(screen.getByText(t('core:result.hiddenCore'))).toBeTruthy();
    expect(screen.getByText('+2')).toBeTruthy();
    expect(screen.getByText('+3')).toBeTruthy();
    expect(screen.getAllByTitle(t('core:result.lpSharedHint'))).toHaveLength(2);
    expect(document.querySelectorAll('[data-best]')).toHaveLength(1);
  });

  it('shows the outcome and leaves the settlement for the room', () => {
    for (const frame of frames) {
      applyFrame(frame, 0);
    }
    presenceStore.setState({
      presence: {
        kind: 'in-match',
        code: roomStore.getState().room?.code ?? '',
      },
    });
    act(() => {
      applyFrame(
        {
          t: 'm.result',
          victory: true,
          roundsPassed: 3,
          reason: 'cleared',
          modeId: 'mode_single_funny',
          difficulty: 'FUNNY',
          players: [{ playerId: 'p1', name: 'Amiya', victory: true, lp: 40 }],
        },
        0,
      );
    });
    renderPart('core:result.layout');
    expect(screen.getByRole('status').textContent).toContain(
      t('core:result.cleared'),
    );
    fireEvent.click(
      screen.getByRole('button', { name: t('core:result.back') }),
    );
    expect(matchStore.getState().result).toBeNull();
    expect(presenceStore.getState().presence.kind).toBe('in-room');
  });
});

describe('top bar and corner', () => {
  it('leaves only through the exit dialog', () => {
    applyFrame(preparing(), 0);
    const { bus, sent } = fakeBus();
    renderPart('core:match.exit', { bus });
    fireEvent.click(screen.getByRole('button', { name: t('core:match.exit') }));
    expect(sent).toEqual([]);
    const dialog = screen.getByRole('dialog');
    const leave = [...dialog.querySelectorAll('button')].find(
      (button) =>
        button.textContent === t('core:match.leave') ||
        button.textContent === t('core:match.leaveSpectate'),
    );
    if (!leave) {
      throw new Error('the dialog has no leave button');
    }
    fireEvent.click(leave);
    expect(sent).toEqual([{ type: 'g.leave' }]);
  });

  it('hints how to activate bonds while there are none', () => {
    applyFrame(preparing(), 0);
    applyFrame({ ...stockedShop(), bonds: [] }, 0);
    renderPart('core:match.bonds');
    expect(screen.getByText(t('core:bonds.empty'))).toBeTruthy();
  });

  it('puts emotes, settings, guide and fullscreen in the corner', () => {
    applyFrame(preparing(), 0);
    applyFrame(stockedShop(), 0);
    renderPart('core:match.corner', { bus: fakeBus().bus });
    for (const name of [
      t('core:emote.open'),
      t('core:settings.open'),
      t('core:nav.guide'),
      t('core:match.fullscreen'),
    ]) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });
});

describe('team watch and enemy intel', () => {
  it('watches a teammate when their avatar is pressed', () => {
    const base = firstOf('m.public');
    const template = base.players[0];
    if (!template) {
      throw new Error('the recording has no player');
    }
    const pub: PublicMessage = {
      ...base,
      phase: 'COMBAT',
      fields: [
        {
          fieldId: 'f1',
          kind: 'normal',
          players: ['p-self'],
          live: true,
          progress: { killed: 0, total: 5, done: false },
        },
        {
          fieldId: 'f2',
          kind: 'normal',
          players: ['p-other'],
          live: true,
          progress: { killed: 1, total: 5, done: false },
        },
      ],
      players: [
        {
          ...template,
          playerId: 'p-self',
          seat: 0,
          name: 'Self',
          fieldId: 'f1',
          status: 'combat',
        },
        {
          ...template,
          playerId: 'p-other',
          seat: 1,
          name: 'Other',
          fieldId: 'f2',
          isBot: true,
          status: 'combat',
        },
      ],
    };
    applyFrame(pub, 0);
    sessionStore.setState({
      ...sessionStore.getState(),
      playerId: 'p-self',
      backend: {
        mode: 'compat',
        capabilities: MASTER_CAPABILITIES,
      },
    });
    const { bus, sent } = fakeBus();
    renderPart('core:match.team', { bus });
    fireEvent.click(
      screen.getByRole('button', {
        name: t('core:watch.field', { name: 'Other' }),
      }),
    );
    expect(sent.at(-1)).toEqual({
      type: 'g.watch',
      fields: { fieldId: 'f2' },
    });
  });

  it('opens enemy intel from the right lens outside prep', () => {
    hudStore.setState({ intel: null });
    applyFrame({ ...firstOf('m.public'), phase: 'COMBAT' }, 0);
    applyFrame(
      {
        ...stockedShop(),
        nextEnemies: [
          {
            enemyKey: 'enemy_a',
            count: 3,
            elite: false,
            boss: false,
            fly: false,
          },
        ],
      },
      0,
    );
    renderPart('core:match.lens');
    fireEvent.click(
      screen.getByRole('button', { name: t('core:match.lens.enemies') }),
    );
    expect(hudStore.getState().intel).toBe('enemies');
  });
});
