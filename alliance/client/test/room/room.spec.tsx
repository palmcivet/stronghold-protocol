// @vitest-environment jsdom

import type { RoomView } from '@alliance/contract/server-message.js';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { IntentBus } from '#infra/intent/bus.js';
import { roomStore } from '#infra/store/room.js';
import { initialSession, sessionStore } from '#infra/store/session.js';
import { answerConfirm, overlayStore } from '#part/overlay.js';
import { roomFacts, seatState } from '#room/facts.js';
import { ROOM } from '#room/parts.js';
import { renderPart } from '#test/support/part.js';

const room = (patch: Partial<RoomView> = {}): RoomView => ({
  code: 'ABCD',
  hostId: 'p1',
  mode: 'coop',
  difficulty: 'NORMAL',
  inMatch: false,
  seats: [
    {
      seat: 0,
      playerId: 'p1',
      name: 'Host',
      isBot: false,
      ready: false,
      connected: true,
    },
    {
      seat: 1,
      playerId: 'p2',
      name: 'Guest',
      isBot: false,
      ready: true,
      connected: true,
    },
    {
      seat: 2,
      playerId: 'bot2',
      name: 'AI',
      isBot: true,
      ready: true,
      connected: true,
    },
    null,
  ],
  spectators: [{ playerId: 'p3', name: 'Watcher' }],
  ...patch,
});

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

const online = (playerId: string) =>
  sessionStore.setState({
    playerId,
    connection: { ...initialSession().connection, status: 'online' },
  });

afterEach(() => {
  cleanup();
  roomStore.setState({ room: null });
  sessionStore.setState(initialSession());
  overlayStore.setState({ confirms: [] });
});

describe('room facts', () => {
  it('reads seat states and the host status', () => {
    const view = room();
    const [host, guest, bot] = view.seats;
    expect(host && seatState(view, host)).toBe('host');
    expect(guest && seatState(view, guest)).toBe('ready');
    expect(bot && seatState(view, bot)).toBe('ready');
    const facts = roomFacts(view, 'p1', true);
    expect(facts).toMatchObject({
      host: true,
      canStart: true,
      emptySeats: 1,
      status: 'canStart',
      readyHumans: 2,
    });
  });

  it('says offline, spectating and get ready', () => {
    expect(roomFacts(room(), 'p1', false).status).toBe('offline');
    expect(roomFacts(room(), 'p3', true).status).toBe('spectating');
    const notReady = room({
      seats: [
        {
          seat: 0,
          playerId: 'p1',
          name: 'Host',
          isBot: false,
          ready: false,
          connected: true,
        },
        {
          seat: 1,
          playerId: 'p2',
          name: 'Guest',
          isBot: false,
          ready: false,
          connected: true,
        },
      ],
    });
    expect(roomFacts(notReady, 'p2', true).status).toBe('getReady');
    expect(roomFacts(notReady, 'p1', true)).toMatchObject({
      canStart: false,
      status: 'waitingOthers',
    });
  });
});

describe('room page', () => {
  it('kicks a player only after the confirm', async () => {
    online('p1');
    roomStore.setState({ room: room() });
    const { bus, sent } = recorder();
    renderPart(ROOM.roster, { bus });
    fireEvent.click(screen.getByRole('button', { name: '移出同盟' }));
    expect(sent).toEqual([]);
    const [request] = overlayStore.getState().confirms;
    expect(request).toBeDefined();
    await act(async () => answerConfirm(request?.id ?? 0, true));
    expect(sent).toEqual([
      { type: 'room.kick', fields: { seat: 1, playerId: 'p2' } },
    ]);
  });

  it('lets the host remove an AI and a spectator', () => {
    online('p1');
    roomStore.setState({ room: room() });
    const { bus, sent } = recorder();
    renderPart(ROOM.roster, { bus });
    renderPart(ROOM.spectators, { bus });
    fireEvent.click(screen.getByRole('button', { name: '移除该 AI 队友' }));
    fireEvent.click(screen.getByRole('button', { name: '移出观战者 Watcher' }));
    expect(sent).toEqual([
      { type: 'room.removeBot', fields: { seat: 2 } },
      { type: 'room.removeSpectator', fields: { playerId: 'p3' } },
    ]);
  });

  it('lets a spectator sit in a free seat, and nobody else move people', () => {
    online('p3');
    roomStore.setState({ room: room() });
    const { bus, sent } = recorder();
    renderPart(ROOM.roster, { bus });
    renderPart(ROOM.spectators, { bus });
    expect(screen.queryByRole('button', { name: '移出同盟' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /入座/ }));
    expect(sent).toEqual([{ type: 'room.join', fields: { code: 'ABCD' } }]);
  });
});
