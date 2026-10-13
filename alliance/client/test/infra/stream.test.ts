import { readFileSync } from 'node:fs';
import type { ServerMessage } from '@alliance/contract/server-message.js';
import { describe, expect, it } from 'vitest';
import { placeOf } from '../../infra/boot/presence.js';
import { matchViewOf } from '../../infra/router/match-view.js';
import { applyFrame } from '../../infra/store/frame.js';
import { matchStore } from '../../infra/store/match.js';
import { type Presence, presenceReducer } from '../../infra/store/presence.js';
import { roomStore } from '../../infra/store/room.js';
import { sessionStore } from '../../infra/store/session.js';

/** Server frames of a solo match against master, trimmed to its first and last rounds. */
const frames = JSON.parse(
  readFileSync(new URL('../fixture/master-solo.json', import.meta.url), 'utf8'),
) as readonly ServerMessage[];

describe('a recorded master match', () => {
  it('walks the stores, the presence and the match page to the settlement', () => {
    let presence: Presence = presenceReducer(
      { kind: 'disconnected' },
      { type: 'status', status: 'online' },
    );
    const views: string[] = [];
    const places: (string | null)[] = [];
    for (const frame of frames) {
      applyFrame(frame, 0);
      presence = presenceReducer(presence, { type: 'frame', frame });
      places.push(
        placeOf(presence.kind, 'code' in presence ? presence.code : null),
      );
      const state = matchStore.getState();
      const view = matchViewOf(state.public?.phase, state.result !== null);
      if (views.at(-1) !== view) {
        views.push(view);
      }
    }
    const code = roomStore.getState().room?.code;
    expect(code).toBeTypeOf('string');
    expect(sessionStore.getState().backend?.mode).toBe('compat');
    expect(presence).toEqual({ kind: 'in-match', code });
    expect(places).toContain(`/room/${code}`);
    expect(places.at(-1)).toBe(`/room/${code}/match`);
    expect(views).toEqual(['briefing', 'match', 'result']);
    expect(matchStore.getState().private).not.toBeNull();
  });
});

describe('master settlement data', () => {
  it('keeps the settled LP loss of a public view and drops it with the next view', () => {
    const view = {
      t: 'm.public',
      phase: 'SETTLE',
      players: [],
      fields: [],
      uniteResult: {
        through: 1,
        helpers: [],
        leakers: ['p1'],
        losses: { p1: 1 },
      },
    } as unknown as ServerMessage;
    applyFrame(view, 0);
    expect(matchStore.getState().settlement).toEqual({ lpLoss: { p1: 1 } });
    applyFrame(
      {
        ...view,
        phase: 'ROUND_START',
        uniteResult: undefined,
      } as ServerMessage,
      0,
    );
    expect(matchStore.getState().settlement).toBeNull();
  });
});
