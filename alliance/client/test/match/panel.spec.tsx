// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EMOTE_CATALOG } from '@alliance/contract/match.js';
import type {
  PrivateMessage,
  PublicMessage,
  ServerMessage,
} from '@alliance/contract/server-message.js';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Intent, IntentBus } from '../../infra/intent/bus.js';
import { IntentContext } from '../../infra/intent/context.js';
import { applyFrame, resetMatch } from '../../infra/store/frame.js';
import { matchStore } from '../../infra/store/match.js';
import { presenceStore } from '../../infra/store/presence.js';
import { roomStore } from '../../infra/store/room.js';
import { t } from '../../infra/text/index.js';
import { Emotes, emoteName } from '../../match/hud/emote.js';
import { Shop } from '../../match/hud/shop.js';
import { Ticker } from '../../match/hud/ticker.js';
import { cardName } from '../../match/piece-label.js';
import { ResultScreen } from '../../match/settlement/result.js';

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

function withBus(bus: IntentBus, node: ReactNode) {
  return render(
    <IntentContext.Provider value={bus}>{node}</IntentContext.Provider>,
  );
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
    applyFrame(own, 0);
    const { bus, sent } = fakeBus();
    withBus(bus, <Shop canAct />);

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
    applyFrame(stockedShop(), 0);
    const { bus, sent } = fakeBus();
    withBus(bus, <Shop canAct={false} />);
    for (const button of screen.getAllByRole('button')) {
      fireEvent.click(button);
    }
    expect(sent).toEqual([]);
  });
});

describe('emotes', () => {
  it('sends an official emote and waits out the cooldown', async () => {
    const publicView: PublicMessage = firstOf('m.public');
    applyFrame(publicView, 0);
    const { bus, sent } = fakeBus();
    withBus(bus, <Emotes canSend />);

    const open = screen.getByRole('button', { name: t('core:emote.open') });
    fireEvent.click(open);
    const first = EMOTE_CATALOG[0];
    if (!first) {
      throw new Error('there is no official emote');
    }
    fireEvent.click(
      await screen.findByRole('menuitem', { name: emoteName(first.id) }),
    );
    expect(sent).toEqual([{ type: 'g.emote', fields: { id: first.id } }]);
    expect(
      screen
        .getByRole('button', { name: t('core:emote.open') })
        .hasAttribute('disabled'),
    ).toBe(true);
  });

  it('shows the emotes the players send by their names', () => {
    const publicView: PublicMessage = firstOf('m.public');
    applyFrame(publicView, Date.now());
    const player = publicView.players[0];
    const first = EMOTE_CATALOG[0];
    if (!player || !first) {
      throw new Error('the recording has no player');
    }
    const { bus } = fakeBus();
    withBus(bus, <Emotes canSend={false} />);
    act(() => {
      applyFrame(
        { t: 'm.emote', playerId: player.playerId, id: first.id },
        Date.now(),
      );
    });
    expect(screen.getByRole('log').textContent).toContain(
      t('core:emote.line', { name: player.name, emote: emoteName(first.id) }),
    );
  });
});

describe('ticker', () => {
  it('reads out the broadcast lines', () => {
    render(<Ticker />);
    act(() => {
      applyFrame(firstOf('m.ticker'), 0);
    });
    const log = screen.getByRole('log');
    expect(log.getAttribute('aria-live')).toBe('polite');
    expect(log.querySelectorAll('li')).toHaveLength(1);
  });
});

describe('result', () => {
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
    render(<ResultScreen />);
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
