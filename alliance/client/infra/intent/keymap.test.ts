// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { resetMatch } from '#infra/store/frame.js';
import { matchStore } from '#infra/store/match.js';
import { settingsStore } from '#infra/store/settings.js';
import {
  actionFor,
  bindings,
  defineBinding,
  keysOf,
  runKey,
} from './keymap.js';

afterEach(() => {
  resetMatch();
  settingsStore.setState({ keymap: {} });
});

const key = (code: string, extra: Partial<KeyboardEventInit> = {}) =>
  new KeyboardEvent('keydown', { code, cancelable: true, ...extra });

describe('key map', () => {
  it("starts with master's keys: R refresh, D level up, F freeze, Space ready", () => {
    expect(
      Object.fromEntries(bindings().map((item) => [item.id, item.keys])),
    ).toEqual({
      'core:refresh': ['KeyR'],
      'core:levelUp': ['KeyD'],
      'core:freeze': ['KeyF'],
      'core:ready': ['Space'],
    });
  });

  it('applies a changed key and takes it from the default owner', () => {
    const changed = { 'core:refresh': ['KeyD'] };
    expect(keysOf('core:refresh', changed)).toEqual(['KeyD']);
    expect(actionFor('KeyD', changed)?.id).toBe('core:refresh');
    expect(actionFor('KeyR', changed)).toBeNull();
    expect(actionFor('KeyR', {})?.id).toBe('core:refresh');
  });

  it('takes actions a mod defines, and removes them again', () => {
    const remove = defineBinding({
      id: 'mod:buy-first',
      label: 'core:shop.heading',
      keys: ['Digit1'],
      intent: () => ({ type: 'g.buy', fields: { slot: 0 } }),
    });
    expect(actionFor('Digit1', {})?.id).toBe('mod:buy-first');
    expect(() =>
      defineBinding({
        id: 'mod:buy-first',
        label: 'core:shop.heading',
        keys: [],
        intent: () => null,
      }),
    ).toThrow();
    remove();
    expect(actionFor('Digit1', {})).toBeNull();
  });

  it('sends nothing outside preparation, and toggles ready with Space while preparing', () => {
    const sent: unknown[] = [];
    expect(runKey(key('Space'), (intent) => sent.push(intent))).toBe(false);
    matchStore.setState({
      public: { phase: 'PREP' } as never,
      private: { ready: false, canReady: true } as never,
    });
    expect(runKey(key('Space'), (intent) => sent.push(intent))).toBe(true);
    expect(runKey(key('KeyR', { ctrlKey: true }), () => {})).toBe(false);
    settingsStore.setState({ keymap: { 'core:ready': ['KeyQ'] } });
    expect(runKey(key('Space'), (intent) => sent.push(intent))).toBe(false);
    expect(sent).toEqual([{ type: 'g.ready', fields: { ready: true } }]);
  });
});
