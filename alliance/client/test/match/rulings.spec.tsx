// @vitest-environment jsdom

import { type Catalog, EMPTY_CATALOG } from '@alliance/contract/catalog.js';
import type {
  PieceView,
  PublicView,
  RoomView,
} from '@alliance/contract/server-message.js';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Intent, IntentBus } from '../../infra/intent/bus.js';
import { catalogStore } from '../../infra/store/catalog.js';
import { resetMatch } from '../../infra/store/frame.js';
import { matchStore } from '../../infra/store/match.js';
import { roomStore } from '../../infra/store/room.js';
import { sessionStore } from '../../infra/store/session.js';
import { setDataText, t } from '../../infra/text/index.js';
import { equipItem, equipStore } from '../../match/equip.js';
import { renderPart } from '../support/part.js';

function recorder() {
  const sent: Intent[] = [];
  const bus: IntentBus = {
    dispatch: async (intent) => {
      sent.push(intent);
      return { ok: true, reply: { t: 'ok' } };
    },
    preview: () => null,
    onOutcome: () => () => {},
  };
  return { sent, bus };
}

const room = (extra: Partial<RoomView> = {}): RoomView =>
  ({
    code: 'ABCD',
    hostId: 'p1',
    mode: 'coop',
    difficulty: 'NORMAL',
    seats: [
      {
        seat: 0,
        playerId: 'p1',
        name: 'A',
        isBot: false,
        ready: false,
        connected: true,
      },
    ],
    spectators: [],
    ...extra,
  }) as unknown as RoomView;

const briefing = (extra: Partial<PublicView> = {}): PublicView =>
  ({
    phase: 'INFO_CHECK',
    round: 0,
    lastRound: 9,
    deadline: 0,
    serverNow: 0,
    modeId: 'm1',
    difficulty: 'NORMAL',
    stageId: 'stage_x',
    setupRevision: 4,
    bossId: 'boss_7',
    factions: ['DOT'],
    players: [{ playerId: 'p1', name: 'A', isBot: false, ready: false }],
    fields: [],
    ...extra,
  }) as unknown as PublicView;

afterEach(() => {
  cleanup();
  resetMatch();
  roomStore.setState({ room: null });
  setDataText({});
  catalogStore.setState({ catalog: EMPTY_CATALOG, loaded: false });
});

describe('briefing', () => {
  it('names the leader, stage and factions from the content and never shows their ids', () => {
    sessionStore.setState({ playerId: 'p1' });
    setDataText({
      'data:boss.boss_7.name': '假想敌：胄',
      'data:faction.DOT.name': '特训敌人·持续',
    });
    matchStore.setState({ public: briefing() });
    renderPart('core:briefing.layout', { bus: recorder().bus });
    expect(screen.getAllByText('假想敌：胄').length).toBeGreaterThan(0);
    expect(screen.getAllByText('特训敌人·持续').length).toBeGreaterThan(0);
    for (const id of ['boss_7', 'stage_x', 'DOT', 'm1']) {
      expect(screen.queryByText(id)).toBeNull();
    }
  });

  it('lets the host propose a reroll of this setup revision', async () => {
    const { sent, bus } = recorder();
    sessionStore.setState({ playerId: 'p1' });
    roomStore.setState({ room: room() });
    matchStore.setState({ public: briefing() });
    renderPart('core:briefing.layout', { bus });
    fireEvent.click(
      screen.getByRole('button', { name: t('core:briefing.reroll') }),
    );
    await waitFor(() =>
      expect(sent).toContainEqual({
        type: 'room.rerollSetup',
        fields: { setupRevision: 4 },
      }),
    );
  });
});

describe('reroll vote', () => {
  it('asks a voter, and lets the proposer withdraw', async () => {
    const { sent, bus } = recorder();
    sessionStore.setState({ playerId: 'p1' });
    matchStore.setState({
      public: briefing({
        rerollVote: {
          id: 9,
          proposerId: 'p1',
          voters: ['p1', 'p2'],
          agreed: [],
        },
      }),
    });
    renderPart('core:match.vote', { bus });
    fireEvent.click(screen.getByRole('button', { name: t('core:vote.agree') }));
    fireEvent.click(
      screen.getByRole('button', { name: t('core:vote.cancel') }),
    );
    await waitFor(() =>
      expect(sent).toEqual([
        { type: 'g.rerollVote', fields: { voteId: 9, agree: true } },
        { type: 'room.cancelReroll', fields: { voteId: 9 } },
      ]),
    );
  });
});

describe('equip', () => {
  const target = (items: number): PieceView =>
    ({
      uid: 5,
      id: 'chess_a',
      kind: 'chess',
      items: Array.from({ length: items }, (_, index) => ({
        uid: 10 + index,
        id: `item_${index}`,
      })),
    }) as unknown as PieceView;

  it('equips onto a free slot and asks which item to replace on a full operator', async () => {
    const { sent, bus } = recorder();
    await equipItem(bus, 1, target(1));
    expect(sent).toEqual([
      { type: 'g.equip', fields: { itemUid: 1, targetUid: 5 } },
    ]);
    await equipItem(bus, 2, target(2));
    expect(sent).toHaveLength(1);
    expect(
      equipStore.getState().request?.items.map((item) => item.uid),
    ).toEqual([10, 11]);
    equipStore.setState({ request: null });
  });
});

describe('room host', () => {
  it('switches the AI picking last', async () => {
    const { sent, bus } = recorder();
    sessionStore.setState({ playerId: 'p1' });
    roomStore.setState({ room: room({ aiPicksLast: false }) });
    renderPart('core:room.host', { bus });
    fireEvent.click(
      screen.getByRole('switch', { name: t('core:room.aiPicksLast') }),
    );
    await waitFor(() =>
      expect(sent).toContainEqual({
        type: 'room.setAiPicksLast',
        fields: { on: true },
      }),
    );
  });
});

describe('loadout tabs', () => {
  it('sends the not-owned list and the custom squad picks', async () => {
    const { sent, bus } = recorder();
    const catalog: Catalog = {
      ...EMPTY_CATALOG,
      chess: {
        chess_a: {
          id: 'chess_a',
          baseId: 'chess_a',
          charId: 'char_a',
          goldenId: null,
          golden: false,
          tier: 1,
          rarity: 4,
          profession: null,
          bondIds: [],
          visible: true,
          loadout: null,
          droppable: true,
        },
      },
      diySlots: [{ id: 'slot5', tier: 5, candidates: ['char_p'] }],
    };
    catalogStore.setState({ catalog, loaded: true });
    renderPart('core:loadout.ownership', { bus });
    fireEvent.click(
      screen.getByRole('button', { name: t('core:loadout.save') }),
    );
    await waitFor(() =>
      expect(sent).toContainEqual({
        type: 'room.ownership',
        fields: { notOwned: [] },
      }),
    );
    cleanup();
    renderPart('core:loadout.diy', { bus });
    fireEvent.click(
      screen.getByRole('button', { name: t('core:loadout.save') }),
    );
    await waitFor(() =>
      expect(sent).toContainEqual({
        type: 'room.diy',
        fields: { picks: { slot5: null } },
      }),
    );
  });
});
