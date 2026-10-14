// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApi, type WsdeHostApi } from './api.js';

function stubConnection() {
  return {
    setName: vi.fn(),
  };
}

function stubIntents() {
  return {
    dispatch: vi.fn(async (intent: unknown) => ({ ok: true as const, intent })),
  };
}

describe('createApi / WsdeHostApi', () => {
  beforeEach(() => {
    // host global is assigned by boot/main; keep tests free of leftover globals
    delete (window as { wsde?: WsdeHostApi }).wsde;
  });

  it('exposes enter, createRoom, joinRoom, submit, view', async () => {
    const connection = stubConnection();
    const intents = stubIntents();
    const api = createApi({
      connection: connection as never,
      intents: intents as never,
    });

    expect(Object.keys(api).sort()).toEqual([
      'createRoom',
      'enter',
      'joinRoom',
      'submit',
      'view',
    ]);

    api.enter('  Ace  ');
    expect(connection.setName).toHaveBeenCalledWith('Ace');

    await api.createRoom('solo', 'normal');
    expect(intents.dispatch).toHaveBeenCalledWith({
      type: 'room.create',
      fields: { mode: 'solo', difficulty: 'normal' },
    });

    await api.joinRoom('ab12');
    expect(intents.dispatch).toHaveBeenCalledWith({
      type: 'room.join',
      fields: { code: 'AB12' },
    });

    const view = api.view();
    expect(view).toMatchObject({
      session: { entered: true, name: 'Ace' },
      match: expect.any(Object),
    });
    expect(view).toHaveProperty('room');
    expect(view).toHaveProperty('battle');
  });

  it('can sit on window.wsde alongside debug-shaped methods', () => {
    const connection = stubConnection();
    const intents = stubIntents();
    const host = createApi({
      connection: connection as never,
      intents: intents as never,
    });
    const debug = {
      highlight() {},
      clearHighlight() {},
    };
    window.wsde = { ...host, ...debug };
    expect(window.wsde?.enter).toBeTypeOf('function');
    expect(window.wsde?.view).toBeTypeOf('function');
    expect((window.wsde as WsdeHostApi & typeof debug).highlight).toBeTypeOf(
      'function',
    );
  });
});
