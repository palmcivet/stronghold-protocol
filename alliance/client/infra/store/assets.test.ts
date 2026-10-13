import { type Catalog, EMPTY_CATALOG } from '@alliance/contract/catalog.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResourceStore } from '../resource/store.js';
import {
  assetsStore,
  bindMatchAssets,
  missingCueWarning,
  releaseMatchAssets,
} from './assets.js';
import { catalogStore } from './catalog.js';

const resources = (name: string): ResourceStore =>
  ({
    name,
    cues: {},
    resolver: { has: () => true },
  }) as unknown as ResourceStore;
const catalog = (modeId: string): Catalog => ({
  ...EMPTY_CATALOG,
  modes: { [modeId]: { id: modeId, type: 'SINGLE', difficulty: 'NORMAL' } },
});

const CLICK = 'audio:sfx/ui/g_ui_btn_h';
const TAB = 'audio:sfx/ui/g_ui_tabswitch';
const LOOP = 'audio:bgm/m_bat_x_loop';
const withCues = (published: readonly string[]): ResourceStore =>
  ({
    cues: {
      ui: { click: CLICK, tab: TAB },
      combat: [{ rounds: { from: 1 }, loop: LOOP }],
    },
    resolver: { has: (key: string) => published.includes(key) },
  }) as unknown as ResourceStore;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  assetsStore.setState({ resources: null, match: null });
  catalogStore.setState({ catalog: EMPTY_CATALOG, loaded: false });
});

describe('match assets', () => {
  it('keeps the snapshot of the match start while the resources change', () => {
    assetsStore.setState({ resources: resources('first') });
    catalogStore.setState({ catalog: catalog('mode_a'), loaded: true });
    const bound = bindMatchAssets('HAHT');

    assetsStore.setState({ resources: resources('second') });
    catalogStore.setState({ catalog: catalog('mode_b'), loaded: true });

    expect(bound).not.toBeNull();
    expect(bindMatchAssets('HAHT')).toBe(bound);
    expect(assetsStore.getState().match?.resources).toMatchObject({
      name: 'first',
    });
    expect(Object.keys(bound?.catalog.modes ?? {})).toEqual(['mode_a']);
    expect(Object.isFrozen(bound)).toBe(true);
  });

  it('waits for the resources and the catalog before it binds', () => {
    expect(bindMatchAssets('HAHT')).toBeNull();
    assetsStore.setState({ resources: resources('first') });
    expect(bindMatchAssets('HAHT')).toBeNull();
    catalogStore.setState({ catalog: catalog('mode_a'), loaded: true });
    expect(bindMatchAssets('HAHT')?.resources).toMatchObject({ name: 'first' });
  });

  it('binds again for the next match once released', () => {
    catalogStore.setState({ catalog: catalog('mode_a'), loaded: true });
    assetsStore.setState({ resources: resources('first') });
    bindMatchAssets('HAHT');
    releaseMatchAssets();
    expect(assetsStore.getState().match).toBeNull();

    assetsStore.setState({ resources: resources('second') });
    expect(bindMatchAssets('HAHT')?.resources).toMatchObject({
      name: 'second',
    });
  });

  it('names the cue keys no layer publishes', () => {
    expect(missingCueWarning(withCues([CLICK, TAB, LOOP]))).toBeNull();
    expect(missingCueWarning(withCues([CLICK]))).toBe(
      `cue keys no pack publishes, played as silence: ${LOOP}, ${TAB}`,
    );
  });

  it('warns about missing cue keys at binding in development and binds anyway', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    catalogStore.setState({ catalog: catalog('mode_a'), loaded: true });
    assetsStore.setState({ resources: withCues([CLICK]) });
    expect(bindMatchAssets('HAHT')).not.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      `cue keys no pack publishes, played as silence: ${LOOP}, ${TAB}`,
    );
  });

  it('stays silent about missing cue keys in production', () => {
    vi.stubEnv('DEV', false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    catalogStore.setState({ catalog: catalog('mode_a'), loaded: true });
    assetsStore.setState({ resources: withCues([CLICK]) });
    expect(bindMatchAssets('HAHT')).not.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('binds a new snapshot for a match in another room', () => {
    catalogStore.setState({ catalog: catalog('mode_a'), loaded: true });
    assetsStore.setState({ resources: resources('first') });
    const first = bindMatchAssets('HAHT');
    expect(bindMatchAssets('QWER')).not.toBe(first);
  });
});
