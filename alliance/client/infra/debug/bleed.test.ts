// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  applyViewport,
  resetViewportStore,
  viewportStore,
} from '#infra/theme/viewport.js';
import {
  hideBleed,
  isBleedVisible,
  resolveBleedInsets,
  showBleed,
} from './bleed.js';
import { getWsde, resetWsde } from './index.js';

afterEach(() => {
  resetWsde();
  resetViewportStore();
  const root = document.documentElement;
  delete root.dataset['orientation'];
  delete root.dataset['safeArea'];
  root.style.removeProperty('--wsde-scale');
  root.style.removeProperty('--wsde-offset-x');
  root.style.removeProperty('--wsde-offset-y');
});

describe('bleed', () => {
  it('showBleed / hideBleed toggles visibility', () => {
    const api = getWsde()!;
    expect(api.isBleedVisible()).toBe(false);
    api.showBleed();
    expect(api.isBleedVisible()).toBe(true);
    api.hideBleed();
    expect(api.isBleedVisible()).toBe(false);
  });

  it('reads live safeInsets from viewportStore (zeros when safe area off)', () => {
    applyViewport({ width: 800, height: 400 }, 'off');
    showBleed();
    expect(isBleedVisible()).toBe(true);
    expect(resolveBleedInsets()).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
    hideBleed();
  });

  it('follows viewportStore.safeInsets updates', () => {
    viewportStore.setState({
      safeInsets: { top: 12, right: 8, bottom: 10, left: 8 },
    });
    expect(resolveBleedInsets()).toEqual({
      top: 12,
      right: 8,
      bottom: 10,
      left: 8,
    });
  });
});
