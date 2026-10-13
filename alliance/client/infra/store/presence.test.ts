import type { ServerMessage } from '@alliance/contract/server-message.js';
import { describe, expect, it } from 'vitest';
import { type Presence, presenceReducer } from './presence.js';

const welcome: ServerMessage = {
  t: 'welcome',
  playerId: 'p1',
  token: 'k',
  name: 'Amiya',
  serverNow: 0,
  version: 1,
  resumed: false,
};

const roomState = (code: string, inMatch: boolean): ServerMessage => ({
  t: 'room.state',
  code,
  hostId: 'p1',
  mode: 'solo',
  difficulty: 'NORMAL',
  inMatch,
  seats: [],
  spectators: [],
});

const publicView = (phase: 'INFO_CHECK'): ServerMessage => ({
  t: 'm.public',
  phase,
  round: 0,
  lastRound: 14,
  deadline: 0,
  serverNow: 0,
  modeId: 'mode_single_funny',
  difficulty: 'NORMAL',
  stageId: null,
  players: [],
  fields: [],
});

const run = (events: Parameters<typeof presenceReducer>[1][]): Presence =>
  events.reduce(presenceReducer, { kind: 'disconnected' } as Presence);

describe('presence', () => {
  it('goes from connected into a room and its match', () => {
    expect(
      run([
        { type: 'status', status: 'online' },
        { type: 'frame', frame: welcome },
        { type: 'frame', frame: roomState('HAHT', false) },
      ]),
    ).toEqual({ kind: 'in-room', code: 'HAHT' });
    expect(
      run([
        { type: 'status', status: 'online' },
        { type: 'frame', frame: roomState('HAHT', false) },
        { type: 'frame', frame: publicView('INFO_CHECK') },
      ]),
    ).toEqual({ kind: 'in-match', code: 'HAHT' });
  });

  it('keeps the finished match until the player leaves its settlement', () => {
    const ended = run([
      { type: 'status', status: 'online' },
      { type: 'frame', frame: roomState('HAHT', true) },
      { type: 'frame', frame: roomState('HAHT', false) },
    ]);
    expect(ended).toEqual({ kind: 'in-match', code: 'HAHT' });
    expect(presenceReducer(ended, { type: 'leave-result' })).toEqual({
      kind: 'in-room',
      code: 'HAHT',
    });
  });

  it('drops to disconnected and back out of a closed room', () => {
    const inRoom: Presence = { kind: 'in-room', code: 'A1' };
    expect(
      presenceReducer(inRoom, { type: 'status', status: 'reconnecting' }),
    ).toEqual({
      kind: 'disconnected',
    });
    expect(
      presenceReducer(inRoom, {
        type: 'frame',
        frame: { t: 'room.closed', reason: 'closed' },
      }),
    ).toEqual({
      kind: 'connected',
    });
  });

  it('leaves a room or a match once the server accepts the leave', () => {
    const room: Presence = { kind: 'in-room', code: 'HAHT' };
    const match: Presence = { kind: 'in-match', code: 'HAHT' };
    expect(presenceReducer(room, { type: 'left' })).toEqual({
      kind: 'connected',
    });
    expect(presenceReducer(match, { type: 'left' })).toEqual({
      kind: 'connected',
    });
    expect(presenceReducer({ kind: 'disconnected' }, { type: 'left' })).toEqual(
      { kind: 'disconnected' },
    );
  });
});
