// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InviteConfirm } from '#entry/invite.js';
import { RequestError } from '#infra/connection/socket.js';
import type { Intent, IntentBus } from '#infra/intent/bus.js';
import { IntentContext } from '#infra/intent/context.js';
import { t } from '#infra/text/index.js';

function fakeBus(fail = false) {
  const sent: Intent[] = [];
  const bus: IntentBus = {
    dispatch: async (intent) => {
      sent.push(intent);
      return fail
        ? { ok: false, error: new RequestError('NO_ROOM', '同盟不存在') }
        : { ok: true, reply: { t: 'ok' } };
    },
    preview: () => null,
    onOutcome: () => () => {},
  };
  return { bus, sent };
}

function show(bus: IntentBus, onBack = vi.fn()) {
  render(
    <IntentContext.Provider value={bus}>
      <InviteConfirm code="HAHT" onBack={onBack} />
    </IntentContext.Provider>,
  );
  return onBack;
}

afterEach(cleanup);

describe('shared room link', () => {
  it('asks first, then joins or spectates the room', async () => {
    const { bus, sent } = fakeBus();
    show(bus);
    expect(
      screen.getByText(t('core:invite.title', { code: 'HAHT' })),
    ).toBeTruthy();
    expect(sent).toEqual([]);
    fireEvent.click(
      screen.getByRole('button', { name: t('core:invite.join') }),
    );
    await waitFor(() =>
      expect(sent).toEqual([{ type: 'room.join', fields: { code: 'HAHT' } }]),
    );
    fireEvent.click(
      screen.getByRole('button', { name: t('core:invite.spectate') }),
    );
    await waitFor(() =>
      expect(sent.at(-1)).toEqual({
        type: 'room.spectate',
        fields: { code: 'HAHT' },
      }),
    );
  });

  it('goes back without sending anything, and says why a join failed', async () => {
    const { bus, sent } = fakeBus(true);
    const onBack = show(bus);
    fireEvent.click(
      screen.getByRole('button', { name: t('core:invite.join') }),
    );
    expect((await screen.findByRole('status')).textContent).toBe('同盟不存在');
    fireEvent.click(
      screen.getAllByRole('button', {
        name: t('core:invite.back'),
      })[0] as HTMLElement,
    );
    expect(onBack).toHaveBeenCalled();
    expect(sent).toHaveLength(1);
  });
});
