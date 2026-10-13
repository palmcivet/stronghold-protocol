// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MASTER_CAPABILITIES } from '../../infra/connection/backend.js';
import { roomStore } from '../../infra/store/room.js';
import { sessionStore } from '../../infra/store/session.js';
import { t } from '../../infra/text/index.js';
import { registerLoadoutParts } from '../../loadout/contribute.js';
import { insertPart, Slot } from '../../part/slot.js';

afterEach(() => {
  cleanup();
  roomStore.setState({ room: null });
  sessionStore.setState({
    playerId: null,
    backend: null,
  } as never);
});

describe('part slots', () => {
  it('sorts inserts by order and skips those whose when does not match', () => {
    const stopLate = insertPart({
      into: 'core:test.slot',
      id: 'core:test.late',
      order: 20,
      component: () => <span>late</span>,
    });
    const stopEarly = insertPart({
      into: 'core:test.slot',
      id: 'core:test.early',
      order: 10,
      component: () => <span>early</span>,
    });
    const stopHidden = insertPart({
      into: 'core:test.slot',
      id: 'core:test.hidden',
      order: 15,
      when: { capability: 'loadout' },
      component: () => <span>hidden</span>,
    });
    render(<Slot id="core:test.slot" />);
    expect(
      screen
        .getByText('early')
        .compareDocumentPosition(screen.getByText('late')),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.queryByText('hidden')).toBeNull();
    stopLate();
    stopEarly();
    stopHidden();
  });

  it('puts the loadout toggle between start and leave when the backend allows it', () => {
    sessionStore.setState({
      playerId: 'p1',
      backend: { mode: 'compat', capabilities: MASTER_CAPABILITIES },
    } as never);
    roomStore.setState({
      room: {
        code: 'HAHT',
        mode: 'solo',
        difficulty: 'NORMAL',
        hostId: 'p1',
        seats: [
          {
            playerId: 'p1',
            name: 'A',
            seat: 0,
            ready: false,
            isBot: false,
            connected: true,
          },
        ],
        spectators: [],
        inMatch: false,
      } as never,
    });
    const stop = registerLoadoutParts();
    render(
      <Slot
        id="core:room.actions"
        defaults={[
          {
            into: 'core:room.actions',
            id: 'core:room.start',
            order: 40,
            component: () => <span>start</span>,
          },
          {
            into: 'core:room.actions',
            id: 'core:room.leave',
            order: 60,
            component: () => <span>leave</span>,
          },
        ]}
      />,
    );
    const toggle = screen.getByRole('button', { name: t('core:room.loadout') });
    expect(screen.getByText('start').compareDocumentPosition(toggle)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(toggle.compareDocumentPosition(screen.getByText('leave'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    stop();
  });
});
