// @vitest-environment jsdom

import {
  type Catalog,
  type CatalogChess,
  EMPTY_CATALOG,
} from '@alliance/contract/catalog.js';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLoadoutSync } from '#infra/boot/boot.js';
import type { Connection } from '#infra/connection/socket.js';
import { RequestError } from '#infra/connection/socket.js';
import type { Intent, IntentBus } from '#infra/intent/bus.js';
import {
  backendOf,
  configureStorage,
  envelope,
  memoryHost,
} from '#infra/storage/index.js';
import { catalogStore } from '#infra/store/catalog.js';
import { resetMatch } from '#infra/store/frame.js';
import { matchStore } from '#infra/store/match.js';
import { t } from '#infra/text/index.js';
import { defaultPick } from '#loadout/squad.js';
import { loadoutItem, loadoutStore } from '#loadout/state.js';
import { sendSetting, syncStore, takesEffect } from '#loadout/sync.js';
import { DIALOG, dialogStore } from '#part/dialog.js';
import { renderPart } from '#test/support/part.js';

const chess: CatalogChess = {
  id: 'chess_a',
  baseId: 'chess_a',
  charId: 'char_a',
  goldenId: null,
  golden: false,
  tier: 3,
  rarity: 5,
  profession: 'SNIPER',
  bondIds: [],
  visible: true,
  droppable: true,
  loadout: {
    skills: [0, 1],
    defaultSkill: 1,
    modules: [],
    defaultModule: null,
  },
};
const slot = {
  id: 'slot5',
  tier: 5,
  candidates: ['char_p', 'char_own'],
  choices: {
    char_p: {
      skills: [],
      modules: [],
      locked: { skillIndex: 2, uniEquipId: null },
    },
    char_own: { skills: [0, 1, 2], modules: ['uniequip_x'] },
  },
};
const catalog: Catalog = {
  ...EMPTY_CATALOG,
  chess: { chess_a: chess },
  diySlots: [slot],
};

/** A bus that answers each message type with a reply or an error code. */
function fakeBus(errors: Readonly<Record<string, string>> = {}) {
  const sent: Intent[] = [];
  const bus: IntentBus = {
    dispatch: async (intent) => {
      sent.push(intent);
      const code = errors[intent.type];
      return code
        ? { ok: false, error: new RequestError(code) }
        : { ok: true, reply: { t: 'ok' } };
    },
    preview: () => null,
    onOutcome: () => () => {},
  };
  return { bus, sent };
}

/** A connection whose frames the test delivers. */
function fakeConnection() {
  const listeners = new Map<string, ((frame: unknown) => void)[]>();
  const on = (type: string, listener: (frame: unknown) => void) => {
    listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    return () => {};
  };
  return {
    on: on as Pick<Connection, 'on'>['on'],
    emit: (type: string, frame: unknown = { t: type }) => {
      for (const listener of listeners.get(type) ?? []) {
        listener(frame);
      }
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  cleanup();
  resetMatch();
  catalogStore.setState({ catalog: EMPTY_CATALOG, loaded: false });
  loadoutStore.setState({
    selected: null,
    entries: {},
    ops: {},
    notOwned: [],
    diy: {},
  });
  syncStore.setState({ loadout: 'idle', ownership: 'idle', diy: 'idle' });
});

describe('loadout sync replies', () => {
  it('reads WRONG_PHASE and ROOM_STARTED as saved for the next match, anything else as not saved', async () => {
    catalogStore.setState({ catalog, loaded: true });
    const locked = fakeBus({
      'room.loadout': 'WRONG_PHASE',
      'room.ownership': 'ROOM_STARTED',
      'room.diy': 'BAD_MSG',
    });
    expect(await sendSetting(locked.bus, 'loadout', catalog)).toBe('locked');
    expect(await sendSetting(locked.bus, 'ownership', catalog)).toBe('locked');
    expect(await sendSetting(locked.bus, 'diy', catalog)).toBe('error');

    renderPart('core:loadout.ownership', { bus: locked.bus });
    expect(
      await screen.findByText(t('core:loadout.locked.ownership')),
    ).toBeTruthy();
    expect(screen.queryByText(t('core:loadout.notSaved'))).toBeNull();
  });
});

describe('when changes take effect', () => {
  it('follows the phase: lobby next match, the briefing this match for the loadout only, later all next match', () => {
    expect(takesEffect('loadout', null)).toBe('nextMatch');
    expect(takesEffect('loadout', 'INFO_CHECK')).toBe('thisMatch');
    expect(takesEffect('ownership', 'INFO_CHECK')).toBe('nextMatch');
    expect(takesEffect('diy', 'INFO_CHECK')).toBe('nextMatch');
    expect(takesEffect('loadout', 'PREP')).toBe('nextMatch');
  });

  it('labels the loadout pages, the in-match one included', () => {
    catalogStore.setState({ catalog, loaded: true });
    const { bus } = fakeBus();
    matchStore.setState({ public: { phase: 'INFO_CHECK' } as never });
    renderPart('core:loadout.detail', { bus });
    expect(screen.getByText(t('core:loadout.effect.thisMatch'))).toBeTruthy();
    cleanup();
    renderPart('core:loadout.ownership', { bus });
    expect(screen.getByText(t('core:loadout.effect.nextMatch'))).toBeTruthy();
    cleanup();
    matchStore.setState({ public: { phase: 'PREP' } as never });
    renderPart('core:loadout.detail', { bus });
    expect(screen.getByText(t('core:loadout.effect.nextMatch'))).toBeTruthy();
  });
});

describe('sync after login', () => {
  it('sends all three on every welcome, an empty loadout as { entries: {}, ops: {} }', async () => {
    const connection = fakeConnection();
    const { bus, sent } = fakeBus();
    installLoadoutSync(connection, bus);
    connection.emit('welcome');
    await settle();
    // three independent syncs, as master's: their order is not part of the protocol
    expect(sent).toHaveLength(3);
    expect(sent).toEqual(
      expect.arrayContaining([
        { type: 'room.ownership', fields: { notOwned: [] } },
        { type: 'room.diy', fields: { picks: {} } },
        { type: 'room.loadout', fields: { entries: {}, ops: {} } },
      ]),
    );
    connection.emit('welcome');
    await settle();
    expect(sent).toHaveLength(6);
  });

  it('waits for the catalog before sending a loadout it must clean', async () => {
    const connection = fakeConnection();
    const { bus, sent } = fakeBus();
    loadoutStore.setState({
      entries: { chess_a: { skill: 0 }, gone: { skill: 0 } },
    });
    installLoadoutSync(connection, bus);
    connection.emit('welcome');
    await settle();
    expect(sent.map((intent) => intent.type)).toEqual([
      'room.ownership',
      'room.diy',
    ]);
    catalogStore.setState({ catalog, loaded: true });
    await settle();
    expect(sent.at(-1)).toEqual({
      type: 'room.loadout',
      fields: { entries: { chess_a: { skill: 0 } }, ops: {} },
    });
  });

  it('sends the locked ones again when the room is back out of a match', async () => {
    const connection = fakeConnection();
    const { bus, sent } = fakeBus();
    installLoadoutSync(connection, bus);
    syncStore.setState({ loadout: 'locked', diy: 'locked' });
    connection.emit('room.state', { t: 'room.state', inMatch: true });
    await settle();
    expect(sent).toEqual([]);
    connection.emit('room.state', { t: 'room.state', inMatch: false });
    await settle();
    expect(sent.map((intent) => intent.type)).toEqual([
      'room.loadout',
      'room.diy',
    ]);
    expect(syncStore.getState()).toMatchObject({
      loadout: 'synced',
      diy: 'synced',
    });
  });
});

describe('autosave', () => {
  it('sends an edit after the debounce, the last of a burst only, as master', async () => {
    vi.useFakeTimers();
    try {
      const connection = fakeConnection();
      const { bus, sent } = fakeBus();
      installLoadoutSync(connection, bus, 500);
      loadoutStore.setState({ notOwned: ['chess_a'] });
      loadoutStore.setState({ notOwned: ['chess_b'] });
      expect(syncStore.getState().ownership).toBe('pending');
      await vi.advanceTimersByTimeAsync(499);
      expect(sent).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(sent).toEqual([
        { type: 'room.ownership', fields: { notOwned: ['chess_b'] } },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends a pending edit at once when a dialog closes', async () => {
    const connection = fakeConnection();
    const { bus, sent } = fakeBus();
    installLoadoutSync(connection, bus, 60_000);
    dialogStore.setState({ open: DIALOG.loadout });
    loadoutStore.setState({ diy: { slot5: { charId: 'char_p' } } });
    expect(sent).toEqual([]);
    dialogStore.setState({ open: null });
    await settle();
    expect(sent).toEqual([
      { type: 'room.diy', fields: { picks: { slot5: { charId: 'char_p' } } } },
    ]);
  });

  it('has no save button: the pages only say when changes take effect', () => {
    catalogStore.setState({ catalog, loaded: true });
    const { bus } = fakeBus();
    for (const id of ['core:loadout.ownership', 'core:loadout.diy']) {
      renderPart(id, { bus });
      // the only plain buttons left are page actions; pickers open a popup
      const actions = screen
        .queryAllByRole('button')
        .filter((button) => !button.hasAttribute('aria-haspopup'))
        .map((button) => button.textContent);
      expect(actions).toEqual(
        id === 'core:loadout.ownership' ? [t('core:ownership.ownAll')] : [],
      );
      expect(screen.getByText(t('core:loadout.effect.nextMatch'))).toBeTruthy();
      cleanup();
    }
  });
});

describe('custom squad picks', () => {
  it("starts an owned pick at its last skill and first module, a prototype's locked", () => {
    expect(defaultPick(slot, 'char_own')).toEqual({
      charId: 'char_own',
      skillIndex: 2,
      uniEquipId: 'uniequip_x',
    });
    expect(defaultPick(slot, 'char_p')).toEqual({ charId: 'char_p' });
  });

  it('sends skillIndex and uniEquipId, the protocol fields of master', async () => {
    catalogStore.setState({ catalog, loaded: true });
    loadoutStore.setState({
      diy: {
        slot5: { charId: 'char_own', skillIndex: 2, uniEquipId: 'uniequip_x' },
      },
    });
    const { bus, sent } = fakeBus();
    renderPart('core:loadout.diy', { bus });
    await sendSetting(bus, 'diy', catalog);
    await waitFor(() =>
      expect(sent).toContainEqual({
        type: 'room.diy',
        fields: {
          picks: {
            slot5: {
              charId: 'char_own',
              skillIndex: 2,
              uniEquipId: 'uniequip_x',
            },
          },
        },
      }),
    );
  });

  it('turns a stored bare charId into a pick', async () => {
    configureStorage(memoryHost());
    await backendOf('small').set(
      loadoutItem.key(),
      envelope(1, {
        entries: {},
        ops: {},
        notOwned: [],
        diy: { slot5: 'char_own' },
      }),
    );
    expect((await loadoutItem.load()).diy).toEqual({
      slot5: { charId: 'char_own' },
    });
  });
});
